import { Inject, Injectable } from '@nestjs/common';
import type {
  AgendarComCredito,
  Pacote,
  PacoteEntrada,
  ResumoPedido,
  SaldoCredito,
} from '@volante/contracts';
import {
  and,
  asc,
  auditar,
  autoescolas,
  avaliacoes,
  cobrancas,
  creditosAula,
  desc,
  eq,
  instrutores,
  isNull,
  pacotes,
  pedidoHistorico,
  pedidos,
  sql,
  usuarios,
  type Ator,
  type Tx,
} from '@volante/db';
import {
  aulasDisponiveis,
  comprarPacote,
  ErroDominio,
  naoEncontrado,
  solicitarAulaComCredito,
  cancelarPedidoNaoPago,
} from '@volante/dominio';
import { CONFIG, type Config } from '../../config';
import { BancoService } from '../../nucleo/banco.service';
import { resumoCobranca } from '../aulas/aulas-consulta.service';

type LinhaPacote = typeof pacotes.$inferSelect & { vendedorNome: string | null };

export function paraPacote(p: LinhaPacote): Pacote {
  return {
    id: p.id,
    vendedorTipo: p.vendedorTipo as Pacote['vendedorTipo'],
    instrutorId: p.instrutorId,
    autoescolaId: p.autoescolaId,
    vendedorNome: p.vendedorNome ?? '',
    nome: p.nome,
    descricao: p.descricao ?? undefined,
    categorias: p.categorias as Pacote['categorias'],
    quantidadeAulas: p.quantidadeAulas,
    duracaoAulaMin: p.duracaoAulaMin,
    precoCentavos: p.precoCentavos,
    precoPorAulaCentavos: Math.round(p.precoCentavos / p.quantidadeAulas),
    parcelasMax: p.parcelasMax,
    validadeDias: p.validadeDias ?? undefined,
    publicado: p.publicado,
  };
}

const colunasPacote = {
  vendedorNome: sql<string | null>`coalesce(${autoescolas.nomeFantasia}, ${usuarios.nome})`,
};

@Injectable()
export class ComercialService {
  constructor(
    private readonly banco: BancoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  private consultaPacotes(tx: Tx) {
    return tx
      .select({ p: pacotes, ...colunasPacote })
      .from(pacotes)
      .leftJoin(autoescolas, eq(autoescolas.id, pacotes.autoescolaId))
      .leftJoin(instrutores, eq(instrutores.id, pacotes.instrutorId))
      .leftJoin(usuarios, eq(usuarios.id, instrutores.usuarioId));
  }

  // ---------- Pacotes do vendedor (instrutor ou autoescola) ----------

  async meusPacotes(ator: Ator): Promise<Pacote[]> {
    return this.banco.comAtor(ator, async (tx) => {
      const filtro = ator.instrutorId
        ? eq(pacotes.instrutorId, ator.instrutorId)
        : eq(pacotes.autoescolaId, ator.autoescolaId!);
      const linhas = await this.consultaPacotes(tx)
        .where(and(filtro, isNull(pacotes.arquivadoEm)))
        .orderBy(asc(pacotes.precoCentavos));
      return linhas.map((l) => paraPacote({ ...l.p, vendedorNome: l.vendedorNome }));
    });
  }

  async salvarPacote(ator: Ator, d: PacoteEntrada, pacoteId?: string): Promise<Pacote[]> {
    await this.banco.comAtor(ator, async (tx) => {
      const valores = {
        nome: d.nome,
        descricao: d.descricao ?? null,
        categorias: d.categorias,
        quantidadeAulas: d.quantidadeAulas,
        duracaoAulaMin: d.duracaoAulaMin,
        precoCentavos: d.precoCentavos,
        parcelasMax: d.parcelasMax,
        validadeDias: d.validadeDias ?? null,
        publicado: d.publicado,
      };
      if (pacoteId) {
        const [antes] = await tx
          .select()
          .from(pacotes)
          .where(eq(pacotes.id, pacoteId))
          .for('update');
        if (!antes) throw naoEncontrado('pacote');
        await tx.update(pacotes).set(valores).where(eq(pacotes.id, pacoteId));
        if (antes.precoCentavos !== d.precoCentavos) {
          await auditar(tx, {
            ator,
            entidadeTipo: 'pacote',
            entidadeId: pacoteId,
            acao: 'preco.alterado',
            antes: { precoCentavos: antes.precoCentavos },
            depois: { precoCentavos: d.precoCentavos },
          });
        }
      } else {
        await tx.insert(pacotes).values({
          ...valores,
          vendedorTipo: ator.instrutorId ? 'instrutor' : 'autoescola',
          instrutorId: ator.instrutorId ?? null,
          autoescolaId: ator.instrutorId ? null : ator.autoescolaId!,
        });
      }
    });
    return this.meusPacotes(ator);
  }

  async arquivarPacote(ator: Ator, pacoteId: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const r = await tx
        .update(pacotes)
        .set({ arquivadoEm: new Date(), publicado: false })
        .where(eq(pacotes.id, pacoteId))
        .returning({ id: pacotes.id });
      if (!r.length) throw naoEncontrado('pacote');
    });
    return this.meusPacotes(ator);
  }

  async pacotesPublicos(filtro: {
    instrutorId?: string;
    autoescolaId?: string;
  }): Promise<Pacote[]> {
    return this.banco.comAtor({ tipo: 'anonimo' }, async (tx) => {
      const linhas = await this.consultaPacotes(tx)
        .where(
          and(
            filtro.instrutorId
              ? eq(pacotes.instrutorId, filtro.instrutorId)
              : eq(pacotes.autoescolaId, filtro.autoescolaId!),
            eq(pacotes.publicado, true),
            isNull(pacotes.arquivadoEm),
          ),
        )
        .orderBy(asc(pacotes.precoCentavos));
      return linhas.map((l) => paraPacote({ ...l.p, vendedorNome: l.vendedorNome }));
    });
  }

  // ---------- Aluno: pedidos e saldo ----------

  async comprar(
    ator: Ator & { alunoId: string },
    d: { pacoteId: string; cupom?: string; metodo: 'pix' | 'cartao'; parcelas: number },
    chave: string,
  ) {
    const chaveIdempotencia = `${ator.alunoId}:${chave}`;
    const pedidoId = await this.banco.comAtor(ator, async (tx) => {
      const [existente] = await tx
        .select({ pedidoId: cobrancas.pedidoId })
        .from(cobrancas)
        .where(eq(cobrancas.chaveIdempotencia, chaveIdempotencia));
      if (existente) return existente.pedidoId;
      const r = await comprarPacote(tx, {
        alunoId: ator.alunoId,
        pacoteId: d.pacoteId,
        cupom: d.cupom || null,
        metodo: d.metodo,
        parcelas: d.parcelas,
        gateway: this.config.PAGAMENTO_GATEWAY,
        chaveIdempotencia,
      });
      return r.pedido.id;
    });
    return this.pedido(ator, pedidoId);
  }

  async pedidos(ator: Ator): Promise<ResumoPedido[]> {
    const ids = await this.banco.comAtor(ator, (tx) =>
      tx
        .select({ id: pedidos.id })
        .from(pedidos)
        .where(eq(pedidos.tipo, 'pacote'))
        .orderBy(desc(pedidos.criadoEm))
        .limit(100),
    );
    return Promise.all(ids.map((p) => this.pedido(ator, p.id)));
  }

  /** O aluno desiste de um pacote ainda não pago (o Pix é cancelado). */
  async cancelarPedido(ator: Ator, pedidoId: string): Promise<ResumoPedido> {
    await this.banco.comAtor(ator, async (tx) => {
      const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId));
      if (!p) throw naoEncontrado('pedido');
      await this.banco.elevarParaSistema(tx);
      const ok = await cancelarPedidoNaoPago(tx, p.id, 'Cancelado pelo aluno antes do pagamento');
      if (!ok)
        throw new ErroDominio(
          'pedido_nao_cancelavel',
          'Só é possível cancelar pedidos que ainda não foram pagos',
          'conflito',
        );
    });
    return this.pedido(ator, pedidoId);
  }

  async pedido(ator: Ator, pedidoId: string): Promise<ResumoPedido> {
    return this.banco.comAtor(ator, async (tx) => {
      const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId));
      if (!p) throw naoEncontrado('pedido');
      const [c] = await tx
        .select()
        .from(cobrancas)
        .where(eq(cobrancas.pedidoId, p.id))
        .orderBy(desc(cobrancas.criadoEm))
        .limit(1);
      const historico = await tx
        .select()
        .from(pedidoHistorico)
        .where(eq(pedidoHistorico.pedidoId, p.id))
        .orderBy(asc(pedidoHistorico.criadoEm));
      const [cr] = await tx.select().from(creditosAula).where(eq(creditosAula.pedidoId, p.id));
      const [av] = await tx
        .select({ id: avaliacoes.id })
        .from(avaliacoes)
        .where(eq(avaliacoes.pedidoId, p.id));
      return {
        id: p.id,
        codigo: p.codigo,
        tipo: p.tipo as ResumoPedido['tipo'],
        vendedorTipo: p.vendedorTipo as ResumoPedido['vendedorTipo'],
        vendedorNome: p.snapshot.vendedorNome,
        descricao: p.snapshot.descricao,
        quantidadeAulas: p.quantidadeAulas,
        valorTotalCentavos: p.valorTotalCentavos,
        status: p.status,
        statusAtendimento: p.statusAtendimento,
        motivoRecusa: p.motivoRecusa,
        pagoEm: p.pagoEm?.toISOString() ?? null,
        prazoRespostaEm: p.prazoRespostaEm?.toISOString() ?? null,
        criadoEm: p.criadoEm.toISOString(),
        autoescolaId: p.autoescolaId,
        instrutorId: p.instrutorId,
        cobranca: c ? resumoCobranca(c) : null,
        valorBrutoCentavos: p.valorBrutoCentavos,
        descontoCentavos: p.descontoCentavos,
        cupomCodigo: p.snapshot.cupomCodigo ?? null,
        historico: historico.map((h) => ({
          paraStatus: h.paraStatus,
          motivo: h.motivo,
          criadoEm: h.criadoEm.toISOString(),
        })),
        credito: cr
          ? {
              id: cr.id,
              quantidadeTotal: cr.quantidadeTotal,
              quantidadeReservada: cr.quantidadeReservada,
              quantidadeConsumida: cr.quantidadeConsumida,
              status: cr.status,
              validoAte: cr.validoAte?.toISOString() ?? null,
            }
          : null,
        avaliado: Boolean(av),
      };
    });
  }

  async creditos(ator: Ator): Promise<SaldoCredito[]> {
    return this.banco.comAtor(ator, async (tx) => {
      const linhas = await tx
        .select({ c: creditosAula, p: pedidos })
        .from(creditosAula)
        .innerJoin(pedidos, eq(pedidos.id, creditosAula.pedidoId))
        .where(
          and(eq(pedidos.tipo, 'pacote'), sql`${creditosAula.status} in ('ativo', 'bloqueado')`),
        )
        .orderBy(desc(creditosAula.criadoEm));
      return linhas.map(({ c, p }) => ({
        id: c.id,
        pedidoId: p.id,
        descricao: p.snapshot.descricao,
        vendedorTipo: p.vendedorTipo as SaldoCredito['vendedorTipo'],
        vendedorNome: p.snapshot.vendedorNome,
        instrutorId: c.instrutorId,
        autoescolaId: c.autoescolaId,
        categorias: c.categorias,
        duracaoAulaMin: c.duracaoAulaMin,
        quantidadeTotal: c.quantidadeTotal,
        disponiveis: aulasDisponiveis(c),
        status: c.status,
        validoAte: c.validoAte?.toISOString() ?? null,
      }));
    });
  }

  async agendarComCredito(ator: Ator & { alunoId: string }, d: AgendarComCredito) {
    return this.banco.comAtor(ator, async (tx) => {
      const aula = await solicitarAulaComCredito(tx, {
        alunoId: ator.alunoId,
        creditoId: d.creditoId,
        instrutorId: d.instrutorId,
        inicio: new Date(d.inicio),
        categoria: d.categoria,
        pontoEncontro: d.pontoEncontro,
        pontoEncontroEndereco: d.pontoEncontroEndereco,
        pontoEncontroReferencia: d.pontoEncontroReferencia,
      });
      return aula.id;
    });
  }

  /** Aluno avalia a autoescola depois que ela confirmou o pedido. */
  async avaliarAutoescola(
    ator: Ator & { alunoId: string },
    pedidoId: string,
    nota: number,
    comentario?: string,
  ) {
    await this.banco.comAtor(ator, async (tx) => {
      const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId));
      if (!p?.autoescolaId) throw naoEncontrado('pedido');
      if (p.statusAtendimento !== 'confirmado') {
        throw new ErroDominio(
          'pedido_nao_confirmado',
          'Você poderá avaliar depois que a autoescola confirmar sua matrícula',
        );
      }
      const [ja] = await tx
        .select({ id: avaliacoes.id })
        .from(avaliacoes)
        .where(eq(avaliacoes.pedidoId, p.id));
      if (ja) throw new ErroDominio('ja_avaliada', 'Você já avaliou esta autoescola', 'conflito');
      await tx.insert(avaliacoes).values({
        pedidoId: p.id,
        autorAlunoId: ator.alunoId,
        alvoTipo: 'autoescola',
        autoescolaId: p.autoescolaId,
        nota,
        comentario: comentario || null,
      });
      // A nota média fica na própria autoescola (desnormalizada para a vitrine).
      await this.banco.elevarParaSistema(tx);
      await tx
        .update(autoescolas)
        .set({
          totalAvaliacoes: sql`${autoescolas.totalAvaliacoes} + 1`,
          notaMedia: sql`round((coalesce(${autoescolas.notaMedia}, 0) * ${autoescolas.totalAvaliacoes} + ${nota})::numeric / (${autoescolas.totalAvaliacoes} + 1), 1)`,
        })
        .where(eq(autoescolas.id, p.autoescolaId));
    });
  }
}
