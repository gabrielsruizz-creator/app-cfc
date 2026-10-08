import { Injectable } from '@nestjs/common';
import type { AulaDetalhe, AulaResumo, ResumoCobranca, StatusAula } from '@volante/contracts';
import {
  alunos,
  and,
  asc,
  aulaAnotacoes,
  aulaHistorico,
  aulas,
  avaliacoes,
  cobrancas,
  desc,
  eq,
  habilidades,
  inArray,
  instrutores,
  registrosEvolucao,
  sql,
  usuarios,
  veiculos,
  type Ator,
  type Tx,
} from '@volante/db';
import { naoEncontrado } from '@volante/dominio';
import { alias } from 'drizzle-orm/pg-core';
import { BancoService } from '../../nucleo/banco.service';

const usuarioAluno = alias(usuarios, 'usuario_aluno');
const usuarioInstrutor = alias(usuarios, 'usuario_instrutor');

export const STATUS_PROXIMAS: StatusAula[] = [
  'aguardando_pagamento',
  'solicitada',
  'confirmada',
  'a_caminho',
  'em_andamento',
  'aguardando_confirmacao',
];

export function resumoCobranca(c: typeof cobrancas.$inferSelect): ResumoCobranca {
  return {
    id: c.id,
    status: c.status as ResumoCobranca['status'],
    gateway: c.gateway,
    metodo: c.metodo,
    parcelas: c.parcelas,
    valorCentavos: c.valorCentavos,
    urlPagamento: c.urlPagamento,
    pixCopiaCola: c.pixCopiaCola,
    pixQrCodeBase64: c.pixQrcodeBase64,
    pixExpiraEm: c.pixExpiraEm?.toISOString() ?? null,
    pagoEm: c.pagoEm?.toISOString() ?? null,
    ambienteTeste: c.gateway === 'simulado',
  };
}

type LinhaAula = {
  aula: typeof aulas.$inferSelect;
  alunoNome: string;
  alunoFoto: string | null;
  instrutorNome: string;
  instrutorFoto: string | null;
  avaliada: boolean;
};

/** Montagem das telas de aula (lista e detalhe), sempre dentro do contexto de RLS do usuário. */
@Injectable()
export class AulasConsultaService {
  constructor(private readonly banco: BancoService) {}

  private consultaBase(tx: Tx) {
    return tx
      .select({
        aula: aulas,
        alunoNome: usuarioAluno.nome,
        alunoFoto: alunos.selfieArquivoId,
        instrutorNome: usuarioInstrutor.nome,
        instrutorFoto: usuarioInstrutor.fotoArquivoId,
        avaliada: sql<boolean>`exists (select 1 from avaliacoes av where av.aula_id = ${aulas.id})`,
      })
      .from(aulas)
      .innerJoin(alunos, eq(alunos.id, aulas.alunoId))
      .innerJoin(usuarioAluno, eq(usuarioAluno.id, alunos.usuarioId))
      .innerJoin(instrutores, eq(instrutores.id, aulas.instrutorId))
      .innerJoin(usuarioInstrutor, eq(usuarioInstrutor.id, instrutores.usuarioId));
  }

  private resumo(l: LinhaAula): AulaResumo {
    const a = l.aula;
    return {
      id: a.id,
      status: a.status as StatusAula,
      inicio: a.inicio.toISOString(),
      fim: a.fim.toISOString(),
      categoria: a.categoria as AulaResumo['categoria'],
      valorCentavos: a.valorCentavos,
      pontoEncontro: a.pontoEncontro,
      pontoEncontroEndereco: a.pontoEncontroEndereco,
      pontoEncontroReferencia: a.pontoEncontroReferencia,
      aluno: { id: a.alunoId, nome: l.alunoNome, fotoArquivoId: l.alunoFoto },
      instrutor: { id: a.instrutorId, nome: l.instrutorNome, fotoArquivoId: l.instrutorFoto },
      aceiteAte: a.aceiteAte?.toISOString() ?? null,
      avaliada: Boolean(l.avaliada),
    };
  }

  async listar(
    ator: Ator,
    filtro: {
      status?: StatusAula[];
      de?: Date;
      ate?: Date;
      ordem?: 'asc' | 'desc';
      limite?: number;
    },
  ): Promise<AulaResumo[]> {
    return this.banco.comAtor(ator, async (tx) => {
      const condicoes = [];
      if (filtro.status?.length) condicoes.push(inArray(aulas.status, filtro.status));
      if (filtro.de) condicoes.push(sql`${aulas.fim} >= ${filtro.de}`);
      if (filtro.ate) condicoes.push(sql`${aulas.inicio} < ${filtro.ate}`);
      const linhas = await this.consultaBase(tx)
        .where(condicoes.length ? and(...condicoes) : undefined)
        .orderBy(filtro.ordem === 'desc' ? desc(aulas.inicio) : asc(aulas.inicio))
        .limit(filtro.limite ?? 100);
      return linhas.map((l) => this.resumo(l));
    });
  }

  async detalhe(ator: Ator, aulaId: string): Promise<AulaDetalhe> {
    return this.banco.comAtor(ator, async (tx) => {
      const [l] = await this.consultaBase(tx).where(eq(aulas.id, aulaId));
      if (!l) throw naoEncontrado('aula');
      const a = l.aula;
      const [cobranca] = await tx
        .select()
        .from(cobrancas)
        .where(eq(cobrancas.pedidoId, a.pedidoId))
        .orderBy(desc(cobrancas.criadoEm))
        .limit(1);
      const historico = await tx
        .select()
        .from(aulaHistorico)
        .where(eq(aulaHistorico.aulaId, a.id))
        .orderBy(asc(aulaHistorico.criadoEm));
      const [veiculo] = a.veiculoId
        ? await tx.select().from(veiculos).where(eq(veiculos.id, a.veiculoId))
        : [];
      const [anotacao] = await tx
        .select()
        .from(aulaAnotacoes)
        .where(eq(aulaAnotacoes.aulaId, a.id));
      const evolucao = await tx
        .select({
          habilidadeId: registrosEvolucao.habilidadeId,
          habilidade: habilidades.nome,
          nivel: registrosEvolucao.nivel,
          observacao: registrosEvolucao.observacao,
        })
        .from(registrosEvolucao)
        .innerJoin(habilidades, eq(habilidades.id, registrosEvolucao.habilidadeId))
        .where(eq(registrosEvolucao.aulaId, a.id))
        .orderBy(habilidades.ordem);
      const ehAluno = ator.tipo === 'aluno';
      return {
        ...this.resumo(l),
        pedidoId: a.pedidoId,
        codigoCheckin: ehAluno ? a.codigoCheckin : null,
        checkinEm: a.checkinEm?.toISOString() ?? null,
        checkoutEm: a.checkoutEm?.toISOString() ?? null,
        checkoutConfirmadoEm: a.checkoutConfirmadoEm?.toISOString() ?? null,
        canceladaEm: a.canceladaEm?.toISOString() ?? null,
        motivoCancelamento: a.motivoCancelamento,
        multaCancelamentoCentavos: a.multaCancelamentoCentavos,
        cobranca: cobranca ? resumoCobranca(cobranca) : null,
        historico: historico.map((h) => ({
          paraStatus: h.paraStatus,
          motivo: h.motivo,
          criadoEm: h.criadoEm.toISOString(),
        })),
        veiculo: veiculo
          ? {
              marca: veiculo.marca,
              modelo: veiculo.modelo,
              cor: veiculo.cor,
              cambio: veiculo.cambio,
            }
          : null,
        anotacao: anotacao && (!ehAluno || anotacao.visivelAluno) ? anotacao.texto : null,
        evolucao,
      };
    });
  }

  /** Avaliações recebidas pelo instrutor (inclusive ocultas pela moderação). */
  async avaliacoesRecebidas(ator: Ator, instrutorId: string) {
    return this.banco.comAtor(ator, (tx) =>
      tx
        .select({
          id: avaliacoes.id,
          nota: avaliacoes.nota,
          comentario: avaliacoes.comentario,
          criadoEm: avaliacoes.criadoEm,
          status: avaliacoes.status,
        })
        .from(avaliacoes)
        .where(eq(avaliacoes.instrutorId, instrutorId))
        .orderBy(desc(avaliacoes.criadoEm))
        .limit(100),
    );
  }
}
