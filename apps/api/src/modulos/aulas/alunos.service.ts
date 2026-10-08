import { Injectable } from '@nestjs/common';
import type { CriarPerfilAluno, EvolucaoAluno, Recibo } from '@volante/contracts';
import {
  alunos,
  and,
  aulaAnotacoes,
  aulas,
  cobrancas,
  desc,
  eq,
  habilidades,
  instrutores,
  recibos,
  registrosEvolucao,
  sql,
  usuarios,
  type Ator,
} from '@volante/db';
import { ErroDominio, naoEncontrado } from '@volante/dominio';
import type { Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';
import { ArquivosService } from '../arquivos/arquivos.service';
import { resumoCobranca } from './aulas-consulta.service';

@Injectable()
export class AlunosService {
  constructor(
    private readonly banco: BancoService,
    private readonly arquivos: ArquivosService,
  ) {}

  async criarPerfil(sessao: Sessao, dados: CriarPerfilAluno) {
    if (sessao.alunoId) throw new ErroDominio('perfil_existente', 'Você já tem cadastro de aluno', 'conflito');
    const [u] = await this.banco.db.select().from(usuarios).where(eq(usuarios.id, sessao.usuarioId));
    if (!u?.cpf) throw new ErroDominio('cpf_obrigatorio', 'Informe seu CPF para continuar');
    await this.arquivos.exigirDono(dados.selfieArquivoId, sessao.usuarioId);
    const [a] = await this.banco.db
      .insert(alunos)
      .values({
        usuarioId: sessao.usuarioId,
        categoriaDesejada: dados.categoriaDesejada,
        renach: dados.renach ?? null,
        selfieArquivoId: dados.selfieArquivoId,
        municipio: dados.municipio ?? null,
        uf: dados.uf ?? null,
      })
      .returning();
    return { id: a!.id, categoriaDesejada: a!.categoriaDesejada, renach: a!.renach };
  }

  async atualizarPerfil(alunoId: string, dados: Partial<CriarPerfilAluno>, usuarioId: string) {
    if (dados.selfieArquivoId) await this.arquivos.exigirDono(dados.selfieArquivoId, usuarioId);
    const [a] = await this.banco.db
      .update(alunos)
      .set({
        ...(dados.categoriaDesejada ? { categoriaDesejada: dados.categoriaDesejada } : {}),
        ...(dados.renach !== undefined ? { renach: dados.renach || null } : {}),
        ...(dados.selfieArquivoId ? { selfieArquivoId: dados.selfieArquivoId } : {}),
      })
      .where(eq(alunos.id, alunoId))
      .returning();
    return { id: a!.id, categoriaDesejada: a!.categoriaDesejada, renach: a!.renach };
  }

  async cobranca(ator: Ator, cobrancaId: string) {
    const [c] = await this.banco.comAtor(ator, (tx) =>
      tx.select().from(cobrancas).where(eq(cobrancas.id, cobrancaId)),
    );
    if (!c) throw naoEncontrado('cobranca');
    return resumoCobranca(c);
  }

  async evolucao(ator: Ator, alunoId: string, filtroInstrutorId?: string): Promise<EvolucaoAluno> {
    return this.banco.comAtor(ator, async (tx) => {
      const [aluno] = await tx.select().from(alunos).where(eq(alunos.id, alunoId));
      if (!aluno) throw naoEncontrado('aluno');
      const condicao = filtroInstrutorId
        ? and(eq(registrosEvolucao.alunoId, alunoId), eq(registrosEvolucao.instrutorId, filtroInstrutorId))
        : eq(registrosEvolucao.alunoId, alunoId);
      const registros = await tx
        .select({
          habilidadeId: registrosEvolucao.habilidadeId,
          nome: habilidades.nome,
          ordem: habilidades.ordem,
          nivel: registrosEvolucao.nivel,
          data: aulas.inicio,
        })
        .from(registrosEvolucao)
        .innerJoin(habilidades, eq(habilidades.id, registrosEvolucao.habilidadeId))
        .innerJoin(aulas, eq(aulas.id, registrosEvolucao.aulaId))
        .where(condicao)
        .orderBy(aulas.inicio);
      const porHabilidade = new Map<string, EvolucaoAluno['habilidades'][number] & { ordem: number }>();
      for (const r of registros) {
        const h = porHabilidade.get(r.habilidadeId) ?? {
          habilidadeId: r.habilidadeId,
          nome: r.nome,
          ordem: r.ordem,
          nivelAtual: r.nivel,
          historico: [],
        };
        h.historico.push({ nivel: r.nivel, data: r.data.toISOString() });
        h.nivelAtual = r.nivel;
        porHabilidade.set(r.habilidadeId, h);
      }
      const anotacoes = await tx
        .select({ aulaId: aulaAnotacoes.aulaId, texto: aulaAnotacoes.texto, data: aulas.inicio, instrutor: usuarios.nome, visivel: aulaAnotacoes.visivelAluno })
        .from(aulaAnotacoes)
        .innerJoin(aulas, eq(aulas.id, aulaAnotacoes.aulaId))
        .innerJoin(instrutores, eq(instrutores.id, aulas.instrutorId))
        .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
        .where(eq(aulaAnotacoes.alunoId, alunoId))
        .orderBy(desc(aulas.inicio));
      return {
        horasAcumuladasMin: aluno.horasAcumuladasMin,
        aulasConcluidas: aluno.aulasConcluidas,
        habilidades: [...porHabilidade.values()]
          .sort((a, b) => a.ordem - b.ordem)
          .map(({ ordem: _o, ...h }) => h),
        anotacoes: anotacoes
          .filter((a) => ator.tipo !== 'aluno' || a.visivel)
          .map((a) => ({ aulaId: a.aulaId, data: a.data.toISOString(), instrutor: a.instrutor, texto: a.texto })),
      };
    });
  }

  async recibos(ator: Ator): Promise<Recibo[]> {
    const linhas = await this.banco.comAtor(ator, (tx) =>
      tx.select().from(recibos).orderBy(desc(recibos.emitidoEm)).limit(200),
    );
    return linhas.map((r) => ({
      id: r.id,
      numero: r.numero ?? 0,
      pedidoId: r.pedidoId,
      valorCentavos: r.valorCentavos,
      emissorNome: r.emissorNome,
      itens: r.itens,
      emitidoEm: r.emitidoEm.toISOString(),
    }));
  }

  /** Alunos atendidos por um instrutor. */
  async alunosDoInstrutor(ator: Ator) {
    const r = await this.banco.comAtor(ator, (tx) =>
      tx
        .select({
          alunoId: aulas.alunoId,
          nome: usuarios.nome,
          selfieArquivoId: alunos.selfieArquivoId,
          categoriaDesejada: alunos.categoriaDesejada,
          aulasConcluidas: sql<number>`count(*) filter (where ${aulas.status} = 'concluida')::int`,
          proximaAula: sql<string | null>`min(${aulas.inicio}) filter (where ${aulas.inicio} > now() and ${aulas.status} in ('solicitada','confirmada'))`,
          ultimaAula: sql<string | null>`max(${aulas.inicio}) filter (where ${aulas.status} = 'concluida')`,
        })
        .from(aulas)
        .innerJoin(alunos, eq(alunos.id, aulas.alunoId))
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .where(sql`${aulas.status} not in ('aguardando_pagamento', 'expirada')`)
        .groupBy(aulas.alunoId, usuarios.nome, alunos.selfieArquivoId, alunos.categoriaDesejada)
        .orderBy(usuarios.nome),
    );
    return r;
  }
}
