import {
  and,
  cobrancas,
  contasFinanceiras,
  eq,
  estornos,
  isNull,
  lancamentos,
  pedidos,
  publicarEvento,
  regrasComissao,
  repasses,
  sql,
  type Tx,
} from '@volante/db';
import { uuidv7 } from 'uuidv7';
import { ErroDominio } from './erros';

type Pedido = typeof pedidos.$inferSelect;
type Cobranca = typeof cobrancas.$inferSelect;

/**
 * Comissão (em centavos) sobre parte do valor de um pedido, na mesma proporção da comissão total
 * congelada no pedido. Para o valor integral devolve exatamente a comissão do pedido.
 */
export function comissaoProporcional(
  valorCentavos: number,
  pedido: Pick<Pedido, 'valorTotalCentavos' | 'comissaoCentavos'>,
): number {
  if (pedido.valorTotalCentavos === 0) return 0;
  if (valorCentavos === pedido.valorTotalCentavos) return pedido.comissaoCentavos;
  return Math.round((valorCentavos * pedido.comissaoCentavos) / pedido.valorTotalCentavos);
}

/** Calcula a comissão de uma venda a partir da regra vigente. */
export function calcularComissao(
  valorTotalCentavos: number,
  regra: Pick<typeof regrasComissao.$inferSelect, 'percentualBp' | 'valorFixoCentavos'>,
): number {
  const c = Math.round((valorTotalCentavos * regra.percentualBp) / 10000) + regra.valorFixoCentavos;
  return Math.min(c, valorTotalCentavos);
}

export async function regraComissaoVigente(
  tx: Tx,
  vendedorTipo: 'instrutor' | 'autoescola',
  produtoTipo: 'aula_avulsa' | 'pacote',
  dono: { instrutorId?: string | null; autoescolaId?: string | null } = {},
) {
  // Exceção específica do parceiro tem prioridade sobre a regra geral.
  const candidatas = await tx
    .select()
    .from(regrasComissao)
    .where(
      and(
        eq(regrasComissao.vendedorTipo, vendedorTipo),
        eq(regrasComissao.produtoTipo, produtoTipo),
        isNull(regrasComissao.vigenteAte),
      ),
    );
  const especifica = candidatas.find(
    (r) =>
      (dono.instrutorId && r.instrutorId === dono.instrutorId) ||
      (dono.autoescolaId && r.autoescolaId === dono.autoescolaId),
  );
  const geral = candidatas.find((r) => !r.instrutorId && !r.autoescolaId);
  const regra = especifica ?? geral;
  if (!regra) {
    throw new ErroDominio(
      'comissao_nao_configurada',
      'Regra de comissão não configurada',
      'regra_negocio',
    );
  }
  return regra;
}

export async function contaDe(
  tx: Tx,
  titular:
    | { tipo: 'plataforma' }
    | { tipo: 'externa' }
    | { tipo: 'instrutor'; instrutorId: string }
    | { tipo: 'autoescola'; autoescolaId: string },
) {
  const filtro =
    titular.tipo === 'instrutor'
      ? eq(contasFinanceiras.instrutorId, titular.instrutorId)
      : titular.tipo === 'autoescola'
        ? eq(contasFinanceiras.autoescolaId, titular.autoescolaId)
        : eq(contasFinanceiras.titularTipo, titular.tipo);
  const [existente] = await tx.select().from(contasFinanceiras).where(filtro);
  if (existente) return existente;
  const [nova] = await tx
    .insert(contasFinanceiras)
    .values({
      titularTipo: titular.tipo,
      instrutorId: titular.tipo === 'instrutor' ? titular.instrutorId : null,
      autoescolaId: titular.tipo === 'autoescola' ? titular.autoescolaId : null,
    })
    .onConflictDoNothing()
    .returning();
  if (nova) return nova;
  const [criadaPorOutro] = await tx.select().from(contasFinanceiras).where(filtro);
  return criadaPorOutro!;
}

const contaVendedor = (tx: Tx, p: Pedido) =>
  p.vendedorTipo === 'instrutor'
    ? contaDe(tx, { tipo: 'instrutor', instrutorId: p.instrutorId! })
    : contaDe(tx, { tipo: 'autoescola', autoescolaId: p.autoescolaId! });

type Lancamento = Omit<typeof lancamentos.$inferInsert, 'operacaoId'>;

async function gravarOperacao(tx: Tx, itens: Lancamento[]) {
  const soma = itens.reduce((acc, l) => acc + l.valorCentavos, 0);
  if (soma !== 0) throw new Error(`Operação financeira desbalanceada (soma ${soma})`);
  const operacaoId = uuidv7();
  await tx.insert(lancamentos).values(itens.map((l) => ({ ...l, operacaoId })));
  return operacaoId;
}

/** Pagamento confirmado: o valor entra e fica RETIDO na conta do vendedor. */
export async function registrarRetencao(tx: Tx, pedido: Pedido) {
  const externa = await contaDe(tx, { tipo: 'externa' });
  const vendedor = await contaVendedor(tx, pedido);
  const comum = {
    pedidoId: pedido.id,
    instrutorId: pedido.instrutorId,
    autoescolaId: pedido.autoescolaId,
  };
  await gravarOperacao(tx, [
    {
      ...comum,
      contaId: externa.id,
      tipo: 'retencao',
      bucket: 'movimento',
      valorCentavos: -pedido.valorTotalCentavos,
      descricao: `Pagamento do pedido ${pedido.codigo}`,
    },
    {
      ...comum,
      contaId: vendedor.id,
      tipo: 'retencao',
      bucket: 'retido',
      valorCentavos: pedido.valorTotalCentavos,
      descricao: `Valor retido do pedido ${pedido.codigo}`,
    },
  ]);
}

/**
 * Libera parte (ou todo) o valor retido: o líquido fica disponível ao vendedor e a comissão vai à plataforma.
 * Também agenda o repasse no gateway (executado pelo worker).
 */
export async function liberarValor(
  tx: Tx,
  pedido: Pedido,
  valorBrutoCentavos: number,
  opcoes: { aulaId?: string | null; descricao: string },
) {
  if (valorBrutoCentavos <= 0) return;
  const comissao = comissaoProporcional(valorBrutoCentavos, pedido);
  const liquido = valorBrutoCentavos - comissao;
  const vendedor = await contaVendedor(tx, pedido);
  const plataforma = await contaDe(tx, { tipo: 'plataforma' });
  const comum = {
    pedidoId: pedido.id,
    aulaId: opcoes.aulaId ?? null,
    instrutorId: pedido.instrutorId,
    autoescolaId: pedido.autoescolaId,
  };
  await gravarOperacao(tx, [
    {
      ...comum,
      contaId: vendedor.id,
      tipo: 'liberacao',
      bucket: 'retido',
      valorCentavos: -valorBrutoCentavos,
      descricao: opcoes.descricao,
    },
    {
      ...comum,
      contaId: vendedor.id,
      tipo: 'liberacao',
      bucket: 'disponivel',
      valorCentavos: liquido,
      descricao: opcoes.descricao,
    },
    {
      ...comum,
      contaId: plataforma.id,
      tipo: 'comissao',
      bucket: 'disponivel',
      valorCentavos: comissao,
      descricao: `Comissão — ${opcoes.descricao}`,
    },
  ]);
  const [repasse] = await tx
    .insert(repasses)
    .values({
      contaId: vendedor.id,
      instrutorId: pedido.instrutorId,
      autoescolaId: pedido.autoescolaId,
      pedidoId: pedido.id,
      aulaId: opcoes.aulaId ?? null,
      valorCentavos: liquido,
    })
    .returning();
  await publicarEvento(tx, {
    tipo: 'repasse.solicitado',
    agregadoTipo: 'repasse',
    agregadoId: repasse!.id,
    autoescolaId: pedido.autoescolaId,
    payload: { repasseId: repasse!.id },
  });
}

export type MotivoEstorno =
  | 'aula_recusada'
  | 'aula_expirada'
  | 'cancelamento'
  | 'pedido_recusado'
  | 'pedido_expirado'
  | 'disputa'
  | 'admin';

/** Devolve ao aluno um valor que estava retido e agenda o estorno no gateway. */
export async function estornarValor(
  tx: Tx,
  pedido: Pedido,
  valorCentavos: number,
  opcoes: { motivo: MotivoEstorno; aulaId?: string | null; solicitadoPor?: string | null },
) {
  if (valorCentavos <= 0) return null;
  const [cobranca] = await tx
    .select()
    .from(cobrancas)
    .where(and(eq(cobrancas.pedidoId, pedido.id), eq(cobrancas.status, 'paga')))
    .for('update');
  const cobrancaParcial: Cobranca | undefined =
    cobranca ??
    (
      await tx
        .select()
        .from(cobrancas)
        .where(and(eq(cobrancas.pedidoId, pedido.id), eq(cobrancas.status, 'estornada_parcial')))
        .for('update')
    )[0];
  if (!cobrancaParcial) {
    throw new ErroDominio('cobranca_nao_paga', 'Não há pagamento confirmado para estornar');
  }
  const disponivel = cobrancaParcial.valorCentavos - cobrancaParcial.valorEstornadoCentavos;
  if (valorCentavos > disponivel) {
    throw new ErroDominio('estorno_acima_do_pago', 'Valor de estorno maior que o valor pago');
  }

  const externa = await contaDe(tx, { tipo: 'externa' });
  const vendedor = await contaVendedor(tx, pedido);
  const [estorno] = await tx
    .insert(estornos)
    .values({
      cobrancaId: cobrancaParcial.id,
      pedidoId: pedido.id,
      alunoId: pedido.alunoId,
      instrutorId: pedido.instrutorId,
      autoescolaId: pedido.autoescolaId,
      aulaId: opcoes.aulaId ?? null,
      valorCentavos,
      motivo: opcoes.motivo,
      solicitadoPor: opcoes.solicitadoPor ?? null,
    })
    .returning();
  const comum = {
    pedidoId: pedido.id,
    aulaId: opcoes.aulaId ?? null,
    estornoId: estorno!.id,
    instrutorId: pedido.instrutorId,
    autoescolaId: pedido.autoescolaId,
  };
  await gravarOperacao(tx, [
    {
      ...comum,
      contaId: vendedor.id,
      tipo: 'estorno',
      bucket: 'retido',
      valorCentavos: -valorCentavos,
      descricao: `Estorno ao aluno — pedido ${pedido.codigo}`,
    },
    {
      ...comum,
      contaId: externa.id,
      tipo: 'estorno',
      bucket: 'movimento',
      valorCentavos,
      descricao: `Estorno ao aluno — pedido ${pedido.codigo}`,
    },
  ]);
  const novoTotal = cobrancaParcial.valorEstornadoCentavos + valorCentavos;
  await tx
    .update(cobrancas)
    .set({
      valorEstornadoCentavos: sql`${cobrancas.valorEstornadoCentavos} + ${valorCentavos}`,
      status: novoTotal >= cobrancaParcial.valorCentavos ? 'estornada' : 'estornada_parcial',
    })
    .where(eq(cobrancas.id, cobrancaParcial.id));
  await publicarEvento(tx, {
    tipo: 'estorno.solicitado',
    agregadoTipo: 'estorno',
    agregadoId: estorno!.id,
    autoescolaId: pedido.autoescolaId,
    payload: { estornoId: estorno!.id },
  });
  return estorno!;
}

/** Saldos de uma conta, derivados dos lançamentos. */
export async function saldosConta(tx: Tx, contaId: string) {
  const linhas = await tx
    .select({
      bucket: lancamentos.bucket,
      total: sql<string>`coalesce(sum(${lancamentos.valorCentavos}), 0)`,
    })
    .from(lancamentos)
    .where(eq(lancamentos.contaId, contaId))
    .groupBy(lancamentos.bucket);
  const valor = (b: string) => Number(linhas.find((l) => l.bucket === b)?.total ?? 0);
  return { retido: valor('retido'), disponivel: valor('disponivel') };
}
