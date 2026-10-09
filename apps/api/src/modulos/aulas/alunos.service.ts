import { Injectable } from '@nestjs/common';
import type { CriarPerfilAluno, EvolucaoAluno, ExtratoAulas, Recibo } from '@volante/contracts';
import {
  alunos,
  and,
  asc,
  aulaAnotacoes,
  aulas,
  autoescolas,
  cobrancas,
  desc,
  eq,
  habilidades,
  inArray,
  instrutores,
  recibos,
  registrosEvolucao,
  sql,
  usuarios,
  veiculos,
  type Ator,
} from '@volante/db';
import { cargaHoraria, ErroDominio, naoEncontrado } from '@volante/dominio';
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
    if (sessao.alunoId)
      throw new ErroDominio('perfil_existente', 'Você já tem cadastro de aluno', 'conflito');
    const [u] = await this.banco.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, sessao.usuarioId));
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
        ? and(
            eq(registrosEvolucao.alunoId, alunoId),
            eq(registrosEvolucao.instrutorId, filtroInstrutorId),
          )
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
      const porHabilidade = new Map<
        string,
        EvolucaoAluno['habilidades'][number] & { ordem: number }
      >();
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
        .select({
          aulaId: aulaAnotacoes.aulaId,
          texto: aulaAnotacoes.texto,
          data: aulas.inicio,
          instrutor: usuarios.nome,
          visivel: aulaAnotacoes.visivelAluno,
        })
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
          .map((a) => ({
            aulaId: a.aulaId,
            data: a.data.toISOString(),
            instrutor: a.instrutor,
            texto: a.texto,
          })),
      };
    });
  }

  /** Aulas concluídas com horários reais, minutos, instrutor e o que foi trabalhado em cada uma. */
  async extrato(ator: Ator, alunoId: string): Promise<ExtratoAulas> {
    return this.banco.comAtor(ator, async (tx) => {
      const [aluno] = await tx
        .select({ nome: usuarios.nome, cpf: usuarios.cpf, categoria: alunos.categoriaDesejada })
        .from(alunos)
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .where(eq(alunos.id, alunoId));
      if (!aluno) throw naoEncontrado('aluno');
      const linhas = await tx
        .select({
          aula: aulas,
          instrutor: usuarios.nome,
          autoescola: autoescolas.nomeFantasia,
          veiculo: veiculos,
        })
        .from(aulas)
        .innerJoin(instrutores, eq(instrutores.id, aulas.instrutorId))
        .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
        .leftJoin(autoescolas, eq(autoescolas.id, aulas.autoescolaId))
        .leftJoin(veiculos, eq(veiculos.id, aulas.veiculoId))
        .where(and(eq(aulas.alunoId, alunoId), eq(aulas.status, 'concluida')))
        .orderBy(asc(aulas.inicio));
      const ids = linhas.map((l) => l.aula.id);
      const evolucao = ids.length
        ? await tx
            .select({
              aulaId: registrosEvolucao.aulaId,
              nome: habilidades.nome,
              nivel: registrosEvolucao.nivel,
              ordem: habilidades.ordem,
            })
            .from(registrosEvolucao)
            .innerJoin(habilidades, eq(habilidades.id, registrosEvolucao.habilidadeId))
            .where(
              and(eq(registrosEvolucao.alunoId, alunoId), inArray(registrosEvolucao.aulaId, ids)),
            )
            .orderBy(asc(habilidades.ordem))
        : [];
      const anotacoes = ids.length
        ? await tx.select().from(aulaAnotacoes).where(eq(aulaAnotacoes.alunoId, alunoId))
        : [];
      const itens = linhas.map(({ aula: a, instrutor, autoescola, veiculo }) => {
        const c = cargaHoraria(a);
        const nota = anotacoes.find((n) => n.aulaId === a.id);
        return {
          aulaId: a.id,
          inicio: a.inicio.toISOString(),
          fim: a.fim.toISOString(),
          checkinEm: a.checkinEm?.toISOString() ?? null,
          checkoutEm: a.checkoutEm?.toISOString() ?? null,
          minutosAgendados: c.agendados,
          minutosRealizados: a.minutosRealizados ?? c.realizados,
          minutosContados: c.contados,
          categoria: a.categoria,
          instrutor,
          autoescola: autoescola ?? null,
          veiculo: veiculo
            ? `${veiculo.marca} ${veiculo.modelo}${veiculo.cor ? ` ${veiculo.cor.toLowerCase()}` : ''} · ${veiculo.placa}`
            : null,
          pontoEncontro: a.pontoEncontroEndereco,
          habilidades: evolucao
            .filter((e) => e.aulaId === a.id)
            .map((e) => ({ nome: e.nome, nivel: e.nivel })),
          anotacao: nota && (ator.tipo !== 'aluno' || nota.visivelAluno) ? nota.texto : null,
        };
      });
      return {
        aluno: { nome: aluno.nome, cpf: aluno.cpf, categoriaDesejada: aluno.categoria },
        totais: {
          aulas: itens.length,
          minutosAgendados: itens.reduce((s, i) => s + i.minutosAgendados, 0),
          minutosRealizados: itens.reduce((s, i) => s + (i.minutosRealizados ?? 0), 0),
          minutosContados: itens.reduce((s, i) => s + i.minutosContados, 0),
        },
        aulas: itens.reverse(),
        geradoEm: new Date().toISOString(),
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
          proximaAula: sql<
            string | null
          >`min(${aulas.inicio}) filter (where ${aulas.inicio} > now() and ${aulas.status} in ('solicitada','confirmada'))`,
          ultimaAula: sql<
            string | null
          >`max(${aulas.inicio}) filter (where ${aulas.status} = 'concluida')`,
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
