import {
  comoSistema,
  and,
  cupomUsos,
  cupons,
  eq,
  inArray,
  ne,
  pedidos,
  sql,
  type Tx,
} from '@volante/db';
import { ErroDominio } from './erros';
import { calcularComissao } from './financeiro';

type Cupom = typeof cupons.$inferSelect;
type Pedido = typeof pedidos.$inferSelect;

/** O aluno sempre paga pelo menos isto (mínimo dos meios de pagamento). */
export const VALOR_MINIMO_COBRANCA_CENTAVOS = 500;

export type CupomResolvido = { cupom: Cupom; descontoCentavos: number };

/** Desconto de um cupom sobre um valor, sem deixar a cobrança abaixo do mínimo. */
export function calcularDesconto(
  c: Pick<Cupom, 'tipo' | 'valor' | 'descontoMaximoCentavos'>,
  valorBrutoCentavos: number,
): number {
  let d = c.tipo === 'percentual' ? Math.round((valorBrutoCentavos * c.valor) / 10000) : c.valor;
  if (c.descontoMaximoCentavos) d = Math.min(d, c.descontoMaximoCentavos);
  return Math.max(0, Math.min(d, valorBrutoCentavos - VALOR_MINIMO_COBRANCA_CENTAVOS));
}

/**
 * Valores do pedido com (ou sem) cupom. A conta sempre fecha: líquido + comissão = total.
 * - Bancado pelo vendedor: o preço cai e a comissão é sobre o valor com desconto.
 * - Bancado pela plataforma: o vendedor recebe o mesmo líquido de sempre; a comissão absorve o
 *   desconto (e pode ficar negativa — a plataforma subsidia a diferença).
 */
export function valoresDoPedido(
  valorBrutoCentavos: number,
  regra: Parameters<typeof calcularComissao>[1],
  cupom: CupomResolvido | null,
) {
  const desconto = cupom?.descontoCentavos ?? 0;
  const total = valorBrutoCentavos - desconto;
  const comissao =
    !cupom || cupom.cupom.bancadoPor === 'vendedor'
      ? calcularComissao(total, regra)
      : calcularComissao(valorBrutoCentavos, regra) - desconto;
  return {
    valorBrutoCentavos,
    descontoCentavos: desconto,
    valorTotalCentavos: total,
    comissaoCentavos: comissao,
    valorLiquidoVendedorCentavos: total - comissao,
  };
}

const invalido = (codigo: string, mensagem: string) =>
  new ErroDominio(codigo, mensagem, 'regra_negocio');

/**
 * Confere se o cupom vale para esta compra e calcula o desconto. Trava a linha do cupom
 * para que o limite total não seja ultrapassado por compras simultâneas.
 */
export async function resolverCupom(
  tx: Tx,
  d: {
    codigo: string;
    alunoId: string;
    produtoTipo: 'aula_avulsa' | 'pacote';
    instrutorId: string | null;
    autoescolaId: string | null;
    valorBrutoCentavos: number;
    agora?: Date;
  },
): Promise<CupomResolvido> {
  // O aluno não lê a tabela de cupons (RLS); a regra roda como sistema.
  return comoSistema(tx, async () => {
    const agora = d.agora ?? new Date();
    const codigo = d.codigo.trim().toUpperCase();
    const [c] = await tx.select().from(cupons).where(eq(cupons.codigo, codigo)).for('update');
    if (!c || !c.ativo) throw invalido('cupom_invalido', 'Cupom inválido');
    if (c.inicioEm > agora) throw invalido('cupom_fora_do_prazo', 'Este cupom ainda não começou');
    if (c.fimEm && c.fimEm < agora) throw invalido('cupom_fora_do_prazo', 'Este cupom expirou');
    if (c.produtoTipo && c.produtoTipo !== d.produtoTipo)
      throw invalido(
        'cupom_nao_aplicavel',
        c.produtoTipo === 'pacote'
          ? 'Este cupom vale só para pacotes'
          : 'Este cupom vale só para aulas avulsas',
      );
    if (
      (c.instrutorId && c.instrutorId !== d.instrutorId) ||
      (c.autoescolaId && c.autoescolaId !== d.autoescolaId)
    )
      throw invalido('cupom_nao_aplicavel', 'Este cupom não vale para este vendedor');
    if (d.valorBrutoCentavos < c.valorMinimoCentavos)
      throw invalido(
        'cupom_valor_minimo',
        `Este cupom vale para compras a partir de R$ ${(c.valorMinimoCentavos / 100).toFixed(2).replace('.', ',')}`,
      );

    const contar = (filtro: ReturnType<typeof and>) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(cupomUsos)
        .where(and(eq(cupomUsos.cupomId, c.id), ne(cupomUsos.status, 'cancelado'), filtro))
        .then((r) => r[0]?.n ?? 0);
    if (c.limiteTotal && (await contar(undefined)) >= c.limiteTotal)
      throw invalido('cupom_esgotado', 'Este cupom já foi usado o máximo de vezes');
    if ((await contar(eq(cupomUsos.alunoId, d.alunoId))) >= c.limitePorAluno)
      throw invalido('cupom_ja_usado', 'Você já usou este cupom');
    if (c.apenasPrimeiraCompra) {
      const [compra] = await tx
        .select({ id: pedidos.id })
        .from(pedidos)
        .where(and(eq(pedidos.alunoId, d.alunoId), inArray(pedidos.status, ['pago', 'encerrado'])))
        .limit(1);
      if (compra) throw invalido('cupom_primeira_compra', 'Este cupom é só para a primeira compra');
    }

    const desconto = calcularDesconto(c, d.valorBrutoCentavos);
    if (desconto <= 0)
      throw invalido('cupom_nao_aplicavel', 'Este cupom não dá desconto nesta compra');
    return { cupom: c, descontoCentavos: desconto };
  });
}

/** Reserva o uso do cupom junto com o pedido (confirmado no pagamento). */
export async function reservarUsoCupom(tx: Tx, pedido: Pedido, r: CupomResolvido) {
  await comoSistema(tx, () =>
    tx.insert(cupomUsos).values({
      cupomId: r.cupom.id,
      pedidoId: pedido.id,
      alunoId: pedido.alunoId,
      instrutorId: pedido.instrutorId,
      autoescolaId: pedido.autoescolaId,
      descontoCentavos: r.descontoCentavos,
      bancadoPor: r.cupom.bancadoPor,
    }),
  );
}

/** Pagamento confirmado → uso confirmado; pedido não pago → o cupom volta a ficar disponível. */
export async function atualizarUsoCupom(
  tx: Tx,
  pedidoId: string,
  para: 'confirmado' | 'cancelado',
) {
  await tx
    .update(cupomUsos)
    .set({ status: para, atualizadoEm: new Date() })
    .where(and(eq(cupomUsos.pedidoId, pedidoId), eq(cupomUsos.status, 'reservado')));
}
