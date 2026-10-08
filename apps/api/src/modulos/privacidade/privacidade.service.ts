import { Injectable } from '@nestjs/common';
import type { FinalidadeConsentimento } from '@volante/contracts';
import {
  alunos,
  and,
  arquivos,
  auditar,
  aulas,
  consentimentos,
  desc,
  dispositivosPush,
  eq,
  inArray,
  instrutores,
  sessoes,
  solicitacoesExclusao,
  usuarios,
} from '@volante/db';
import { contaDe, ErroDominio, saldosConta } from '@volante/dominio';
import { randomBytes } from 'node:crypto';
import type { Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';

const STATUS_AULA_ATIVA = ['aguardando_pagamento', 'solicitada', 'confirmada', 'a_caminho', 'em_andamento', 'aguardando_confirmacao'];

@Injectable()
export class PrivacidadeService {
  constructor(private readonly banco: BancoService) {}

  async consentimentos(usuarioId: string) {
    const linhas = await this.banco.db
      .select()
      .from(consentimentos)
      .where(eq(consentimentos.usuarioId, usuarioId))
      .orderBy(desc(consentimentos.criadoEm));
    const atuais = new Map<string, { finalidade: string; aceito: boolean; registradoEm: string }>();
    for (const c of linhas) {
      if (!atuais.has(c.finalidade)) {
        atuais.set(c.finalidade, { finalidade: c.finalidade, aceito: c.aceito, registradoEm: c.criadoEm.toISOString() });
      }
    }
    return [...atuais.values()];
  }

  async registrarConsentimento(s: Sessao, finalidade: FinalidadeConsentimento, aceito: boolean) {
    if (!aceito && ['termos_uso', 'politica_privacidade'].includes(finalidade)) {
      throw new ErroDominio(
        'consentimento_obrigatorio',
        'Os termos de uso e a política de privacidade são necessários para usar o app. Para revogá-los, solicite a exclusão da conta.',
      );
    }
    await this.banco.db.insert(consentimentos).values({
      usuarioId: s.usuarioId,
      finalidade,
      aceito,
      ip: s.ip,
      userAgent: s.userAgent,
    });
    return this.consentimentos(s.usuarioId);
  }

  /** Exporta os dados pessoais do titular (portabilidade — art. 18 da LGPD). */
  async meusDados(s: Sessao) {
    const [u] = await this.banco.db.select().from(usuarios).where(eq(usuarios.id, s.usuarioId));
    const { senhaHash: _s, ...usuario } = u!;
    const [aluno] = await this.banco.db.select().from(alunos).where(eq(alunos.usuarioId, s.usuarioId));
    const [instrutor] = await this.banco.db.select().from(instrutores).where(eq(instrutores.usuarioId, s.usuarioId));
    const aulasAluno = aluno
      ? await this.banco.comAtor({ tipo: 'aluno', alunoId: aluno.id }, (tx) => tx.select().from(aulas))
      : [];
    const aulasInstrutor = instrutor
      ? await this.banco.comAtor({ tipo: 'instrutor', instrutorId: instrutor.id }, (tx) => tx.select().from(aulas))
      : [];
    return {
      geradoEm: new Date().toISOString(),
      usuario,
      aluno: aluno ?? null,
      instrutor: instrutor ?? null,
      consentimentos: await this.consentimentos(s.usuarioId),
      aulasComoAluno: aulasAluno.map(({ codigoCheckin: _c, ...a }) => a),
      aulasComoInstrutor: aulasInstrutor.map(({ codigoCheckin: _c, ...a }) => a),
    };
  }

  /**
   * Exclusão de conta: anonimiza os dados pessoais. Registros financeiros e fiscais são mantidos
   * (sem dados identificáveis) pelo prazo legal. Bloqueada se houver aula em andamento ou valores a receber.
   */
  async solicitarExclusao(s: Sessao, motivo?: string) {
    const pendencias: string[] = [];
    if (s.alunoId) {
      const ativas = await this.banco.comAtor({ tipo: 'aluno', alunoId: s.alunoId }, (tx) =>
        tx.select({ id: aulas.id }).from(aulas).where(inArray(aulas.status, STATUS_AULA_ATIVA)),
      );
      if (ativas.length) pendencias.push('Você tem aulas agendadas. Cancele-as antes de excluir a conta.');
    }
    if (s.instrutorId) {
      const ativas = await this.banco.comAtor({ tipo: 'instrutor', instrutorId: s.instrutorId }, (tx) =>
        tx.select({ id: aulas.id }).from(aulas).where(inArray(aulas.status, STATUS_AULA_ATIVA)),
      );
      if (ativas.length) pendencias.push('Você tem aulas agendadas com alunos.');
      const saldo = await this.banco.comAtor({ tipo: 'sistema' }, async (tx) => {
        const conta = await contaDe(tx, { tipo: 'instrutor', instrutorId: s.instrutorId! });
        return saldosConta(tx, conta.id);
      });
      if (saldo.retido > 0 || saldo.disponivel > 0) pendencias.push('Você tem valores a receber. Faça o saque antes.');
    }
    if (s.autoescolas.some((a) => a.papel === 'dono')) {
      pendencias.push('Você é responsável por uma autoescola. Transfira a responsabilidade antes.');
    }

    if (pendencias.length) {
      await this.banco.db.insert(solicitacoesExclusao).values({
        usuarioId: s.usuarioId,
        status: 'bloqueada_pendencia',
        motivo: motivo ?? null,
        pendencias,
      });
      throw new ErroDominio('exclusao_com_pendencias', 'Não é possível excluir a conta agora', 'regra_negocio', { pendencias });
    }

    await this.banco.comAtor({ tipo: 'sistema', usuarioId: s.usuarioId }, async (tx) => {
      const sufixo = s.usuarioId.replace(/-/g, '');
      await tx
        .update(usuarios)
        .set({
          nome: 'Usuário removido',
          nomeSocial: null,
          cpf: null,
          email: `removido+${sufixo}@excluido.invalid`,
          telefone: `removido-${sufixo}`,
          senhaHash: randomBytes(32).toString('hex'),
          dataNascimento: null,
          genero: null,
          fotoArquivoId: null,
          status: 'excluido',
          excluidoEm: new Date(),
        })
        .where(eq(usuarios.id, s.usuarioId));
      if (s.alunoId) await tx.update(alunos).set({ renach: null }).where(eq(alunos.id, s.alunoId));
      if (s.instrutorId) {
        await tx
          .update(instrutores)
          .set({ disponivel: false, status: 'bloqueado', motivoStatus: 'Conta excluída pelo titular', bio: null, baseLocalizacao: null })
          .where(eq(instrutores.id, s.instrutorId));
      }
      await tx.update(arquivos).set({ excluidoEm: new Date() }).where(eq(arquivos.donoUsuarioId, s.usuarioId));
      await tx.update(sessoes).set({ revogadaEm: new Date() }).where(and(eq(sessoes.usuarioId, s.usuarioId)));
      await tx.update(dispositivosPush).set({ ativo: false }).where(eq(dispositivosPush.usuarioId, s.usuarioId));
      await tx.insert(solicitacoesExclusao).values({
        usuarioId: s.usuarioId,
        status: 'concluida',
        motivo: motivo ?? null,
        concluidaEm: new Date(),
      });
      await auditar(tx, {
        ator: { tipo: 'sistema', usuarioId: s.usuarioId },
        entidadeTipo: 'usuario',
        entidadeId: s.usuarioId,
        acao: 'conta.excluida',
        motivo: motivo ?? null,
      });
    });
    return { excluida: true };
  }
}
