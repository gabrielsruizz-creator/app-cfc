import type { StatusAula } from '@volante/contracts';
import {
  alunos,
  and,
  aulaHistorico,
  aulas,
  cobrancas,
  creditosAula,
  creditosMovimentos,
  eq,
  instrutores,
  lerConfiguracoes,
  pedidoHistorico,
  pedidos,
  publicarEvento,
  recibos,
  sql,
  type Tx,
} from '@volante/db';
import type { Ponto } from '@volante/db';
import { atualizarUsoCupom } from './promocoes';
import { ErroDominio, naoEncontrado } from './erros';
import {
  estornarValor,
  liberarValor,
  registrarRetencao,
  retidoDoPedido,
  type MotivoEstorno,
} from './financeiro';
import { ativarPacotePago } from './pacotes';

export type Aula = typeof aulas.$inferSelect;
type Pedido = typeof pedidos.$inferSelect;

/** Transições de status permitidas. Qualquer outra é recusada. */
export const TRANSICOES_AULA: Record<StatusAula, readonly StatusAula[]> = {
  aguardando_pagamento: ['solicitada', 'expirada', 'cancelada'],
  solicitada: ['confirmada', 'recusada', 'expirada', 'cancelada', 'solicitada'],
  confirmada: [
    'a_caminho',
    'em_andamento',
    'cancelada',
    'solicitada',
    'nao_compareceu_aluno',
    'nao_compareceu_instrutor',
  ],
  a_caminho: ['em_andamento', 'cancelada', 'nao_compareceu_aluno'],
  em_andamento: ['aguardando_confirmacao'],
  aguardando_confirmacao: ['concluida', 'cancelada'],
  concluida: [],
  recusada: [],
  expirada: [],
  cancelada: [],
  nao_compareceu_aluno: [],
  nao_compareceu_instrutor: [],
};

export type OpcoesMudanca = {
  atorUsuarioId?: string | null;
  motivo?: string | null;
  local?: Ponto | null;
  extras?: Partial<typeof aulas.$inferInsert>;
};

export async function carregarAulaParaAlterar(tx: Tx, aulaId: string): Promise<Aula> {
  const [aula] = await tx.select().from(aulas).where(eq(aulas.id, aulaId)).for('update');
  if (!aula) throw naoEncontrado('aula');
  return aula;
}

export async function mudarStatusAula(
  tx: Tx,
  aula: Aula,
  para: StatusAula,
  opcoes: OpcoesMudanca = {},
): Promise<Aula> {
  const de = aula.status as StatusAula;
  if (!TRANSICOES_AULA[de].includes(para)) {
    throw new ErroDominio(
      'transicao_invalida',
      `Não é possível passar a aula de "${de}" para "${para}"`,
      'conflito',
    );
  }
  const [atualizada] = await tx
    .update(aulas)
    .set({ ...opcoes.extras, status: para })
    .where(and(eq(aulas.id, aula.id), eq(aulas.status, de)))
    .returning();
  if (!atualizada) {
    throw new ErroDominio(
      'aula_alterada',
      'A aula foi alterada por outra ação. Tente novamente.',
      'conflito',
    );
  }
  await tx.insert(aulaHistorico).values({
    aulaId: aula.id,
    alunoId: aula.alunoId,
    instrutorId: aula.instrutorId,
    autoescolaId: aula.autoescolaId,
    deStatus: de,
    paraStatus: para,
    atorUsuarioId: opcoes.atorUsuarioId ?? null,
    local: opcoes.local ?? null,
    motivo: opcoes.motivo ?? null,
  });
  return atualizada;
}

export async function mudarStatusPedido(
  tx: Tx,
  pedido: Pedido,
  para: Pedido['status'],
  opcoes: { atorUsuarioId?: string | null; motivo?: string | null; extras?: Partial<Pedido> } = {},
) {
  if (pedido.status === para) return pedido;
  const [p] = await tx
    .update(pedidos)
    .set({ ...opcoes.extras, status: para })
    .where(eq(pedidos.id, pedido.id))
    .returning();
  await tx.insert(pedidoHistorico).values({
    pedidoId: pedido.id,
    alunoId: pedido.alunoId,
    instrutorId: pedido.instrutorId,
    autoescolaId: pedido.autoescolaId,
    deStatus: pedido.status,
    paraStatus: para,
    atorUsuarioId: opcoes.atorUsuarioId ?? null,
    motivo: opcoes.motivo ?? null,
  });
  return p!;
}

export async function carregarPedido(tx: Tx, pedidoId: string) {
  const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)).for('update');
  if (!p) throw naoEncontrado('pedido');
  return p;
}

async function movimentarCredito(
  tx: Tx,
  creditoId: string,
  aulaId: string,
  tipo: 'reserva' | 'consumo' | 'devolucao',
  novoStatus?: string,
) {
  const delta =
    tipo === 'reserva'
      ? { quantidadeReservada: sql`${creditosAula.quantidadeReservada} + 1` }
      : tipo === 'devolucao'
        ? { quantidadeReservada: sql`${creditosAula.quantidadeReservada} - 1` }
        : {
            quantidadeReservada: sql`${creditosAula.quantidadeReservada} - 1`,
            quantidadeConsumida: sql`${creditosAula.quantidadeConsumida} + 1`,
          };
  const [c] = await tx
    .update(creditosAula)
    .set({ ...delta, ...(novoStatus ? { status: novoStatus } : {}) } as never)
    .where(eq(creditosAula.id, creditoId))
    .returning();
  await tx.insert(creditosMovimentos).values({ creditoId, aulaId, tipo, quantidade: 1 });
  if (c && tipo === 'consumo' && c.quantidadeConsumida >= c.quantidadeTotal) {
    await tx.update(creditosAula).set({ status: 'esgotado' }).where(eq(creditosAula.id, creditoId));
  }
  return c!;
}

export { movimentarCredito };

/** Prazo para o instrutor aceitar: o menor entre "agora + prazo" e "início − limite". */
export function calcularAceiteAte(
  agora: Date,
  inicio: Date,
  cfg: { prazoAceiteHoras: number; limiteAntesInicioHoras: number },
): Date {
  const porPrazo = agora.getTime() + cfg.prazoAceiteHoras * 3600_000;
  const porInicio = inicio.getTime() - cfg.limiteAntesInicioHoras * 3600_000;
  const minimo = agora.getTime() + 10 * 60_000;
  return new Date(Math.max(Math.min(porPrazo, porInicio), minimo));
}

/**
 * Pagamento confirmado pelo gateway. Idempotente: chamar duas vezes não duplica nada.
 * Se a aula já tinha expirado (Pix pago depois do prazo), o valor é estornado automaticamente.
 */
export async function confirmarPagamento(tx: Tx, cobrancaId: string, agora = new Date()) {
  const [cobranca] = await tx
    .select()
    .from(cobrancas)
    .where(eq(cobrancas.id, cobrancaId))
    .for('update');
  if (!cobranca) throw naoEncontrado('cobranca');
  if (['paga', 'estornada', 'estornada_parcial'].includes(cobranca.status))
    return { jaProcessada: true };

  await tx
    .update(cobrancas)
    .set({ status: 'paga', pagoEm: agora })
    .where(eq(cobrancas.id, cobranca.id));
  let pedido = await carregarPedido(tx, cobranca.pedidoId);
  const pedidoEstavaCancelado = pedido.status === 'cancelado';
  pedido = await mudarStatusPedido(tx, pedido, 'pago', { extras: { pagoEm: agora } });
  await registrarRetencao(tx, pedido);
  await publicarEvento(tx, {
    tipo: 'cobranca.paga',
    agregadoTipo: 'cobranca',
    agregadoId: cobranca.id,
    autoescolaId: pedido.autoescolaId,
    payload: { cobrancaId: cobranca.id, pedidoId: pedido.id },
  });
  await emitirRecibo(tx, pedido, agora);

  if (!pedidoEstavaCancelado) await atualizarUsoCupom(tx, pedido.id, 'confirmado');

  if (pedido.tipo === 'pacote') {
    if (pedidoEstavaCancelado) {
      await estornarValor(tx, pedido, pedido.valorTotalCentavos, { motivo: 'pedido_expirado' });
      await mudarStatusPedido(tx, pedido, 'estornado', {
        motivo: 'Pagamento recebido após o prazo',
      });
      return { jaProcessada: false, estornado: true };
    }
    await ativarPacotePago(tx, pedido, agora);
    return { jaProcessada: false, estornado: false };
  }

  const aulasDoPedido = await tx
    .select()
    .from(aulas)
    .where(eq(aulas.pedidoId, pedido.id))
    .for('update');
  const cfg = await lerConfiguracoes(tx);

  if (pedidoEstavaCancelado || aulasDoPedido.every((a) => a.status !== 'aguardando_pagamento')) {
    // Pagamento chegou depois que a aula expirou: devolve tudo.
    await estornarValor(tx, pedido, pedido.valorTotalCentavos, { motivo: 'aula_expirada' });
    await mudarStatusPedido(tx, pedido, 'estornado', { motivo: 'Pagamento recebido após o prazo' });
    return { jaProcessada: false, estornado: true };
  }

  await tx
    .update(creditosAula)
    .set({ status: 'ativo' })
    .where(eq(creditosAula.pedidoId, pedido.id));

  for (const aula of aulasDoPedido.filter((a) => a.status === 'aguardando_pagamento')) {
    const aceiteAte = calcularAceiteAte(agora, aula.inicio, {
      prazoAceiteHoras: cfg['aula.prazo_aceite_horas'],
      limiteAntesInicioHoras: cfg['aula.aceite_limite_antes_inicio_horas'],
    });
    await mudarStatusAula(tx, aula, 'solicitada', {
      motivo: 'Pagamento confirmado',
      extras: { aceiteAte },
    });
    await publicarEvento(tx, {
      tipo: 'aula.solicitada',
      agregadoTipo: 'aula',
      agregadoId: aula.id,
      autoescolaId: aula.autoescolaId,
      payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId },
    });
  }
  return { jaProcessada: false, estornado: false };
}

async function emitirRecibo(tx: Tx, pedido: Pedido, agora: Date) {
  await tx
    .insert(recibos)
    .values({
      pedidoId: pedido.id,
      alunoId: pedido.alunoId,
      instrutorId: pedido.instrutorId,
      autoescolaId: pedido.autoescolaId,
      emissorTipo: pedido.vendedorTipo,
      emissorNome: pedido.snapshot.vendedorNome,
      valorCentavos: pedido.valorTotalCentavos,
      itens: [{ descricao: pedido.snapshot.descricao, valorCentavos: pedido.valorTotalCentavos }],
      emitidoEm: agora,
    })
    .onConflictDoNothing();
}

/** Pix não foi pago no prazo: libera o horário e cancela o pedido. */
export async function expirarAulaNaoPaga(tx: Tx, aulaId: string) {
  const aula = await carregarAulaParaAlterar(tx, aulaId);
  if (aula.status !== 'aguardando_pagamento') return null;
  await mudarStatusAula(tx, aula, 'expirada', { motivo: 'Pagamento não realizado no prazo' });
  await movimentarCredito(tx, aula.creditoId, aula.id, 'devolucao', 'cancelado');
  const pedido = await carregarPedido(tx, aula.pedidoId);
  await mudarStatusPedido(tx, pedido, 'cancelado', { motivo: 'Pagamento não realizado no prazo' });
  await atualizarUsoCupom(tx, pedido.id, 'cancelado');
  const pendentes = await tx
    .update(cobrancas)
    .set({ status: 'expirada' })
    .where(
      and(
        eq(cobrancas.pedidoId, pedido.id),
        sql`${cobrancas.status} in ('pendente_envio', 'aguardando_pagamento', 'pendente_configuracao')`,
      ),
    )
    .returning({ id: cobrancas.id });
  for (const c of pendentes) {
    await publicarEvento(tx, {
      tipo: 'cobranca.expirada',
      agregadoTipo: 'cobranca',
      agregadoId: c.id,
      payload: { cobrancaId: c.id, pedidoId: pedido.id },
    });
  }
  return aula;
}

/**
 * Pedido de pacote ainda não pago: cancela (Pix vencido ou desistência do aluno). Se o Pix
 * for pago depois, confirmarPagamento devolve o valor automaticamente.
 */
export async function cancelarPedidoNaoPago(tx: Tx, pedidoId: string, motivo: string) {
  const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)).for('update');
  if (!p || p.tipo !== 'pacote' || p.status !== 'aguardando_pagamento') return false;
  await mudarStatusPedido(tx, p, 'cancelado', { motivo });
  await atualizarUsoCupom(tx, p.id, 'cancelado');
  await tx.update(creditosAula).set({ status: 'cancelado' }).where(eq(creditosAula.pedidoId, p.id));
  const pendentes = await tx
    .update(cobrancas)
    .set({ status: 'expirada' })
    .where(
      and(
        eq(cobrancas.pedidoId, p.id),
        sql`${cobrancas.status} in ('pendente_envio', 'aguardando_pagamento', 'pendente_configuracao')`,
      ),
    )
    .returning({ id: cobrancas.id });
  for (const c of pendentes) {
    await publicarEvento(tx, {
      tipo: 'cobranca.expirada',
      agregadoTipo: 'cobranca',
      agregadoId: c.id,
      autoescolaId: p.autoescolaId,
      payload: { cobrancaId: c.id, pedidoId: p.id },
    });
  }
  return true;
}

type StatusEncerramento = 'recusada' | 'expirada' | 'cancelada' | 'nao_compareceu_instrutor';

const motivoEstornoPorStatus: Record<StatusEncerramento, MotivoEstorno> = {
  recusada: 'aula_recusada',
  expirada: 'aula_expirada',
  cancelada: 'cancelamento',
  nao_compareceu_instrutor: 'disputa',
};

/**
 * Encerra uma aula já paga devolvendo o valor ao aluno (recusa, prazo de aceite vencido,
 * cancelamento pelo instrutor ou cancelamento grátis pelo aluno).
 */
export async function encerrarComEstornoTotal(
  tx: Tx,
  aula: Aula,
  para: StatusEncerramento,
  opcoes: {
    motivo: string;
    atorUsuarioId?: string | null;
    canceladaPor?: string;
    motivoEstorno?: MotivoEstorno;
  },
) {
  const agora = new Date();
  const atualizada = await mudarStatusAula(tx, aula, para, {
    motivo: opcoes.motivo,
    atorUsuarioId: opcoes.atorUsuarioId,
    extras:
      para === 'cancelada'
        ? {
            canceladaEm: agora,
            canceladaPor: opcoes.canceladaPor ?? 'sistema',
            motivoCancelamento: opcoes.motivo,
          }
        : {},
  });
  const pedido = await carregarPedido(tx, aula.pedidoId);
  if (pedido.tipo === 'aula_avulsa') {
    await movimentarCredito(tx, aula.creditoId, aula.id, 'devolucao', 'estornado');
    await estornarValor(tx, pedido, aula.valorCentavos, {
      motivo: opcoes.motivoEstorno ?? motivoEstornoPorStatus[para],
      aulaId: aula.id,
      solicitadoPor: opcoes.atorUsuarioId,
    });
    await mudarStatusPedido(tx, pedido, 'estornado', { motivo: opcoes.motivo });
  } else {
    // Aula de pacote: o crédito volta para o saldo do aluno, sem estorno em dinheiro.
    await movimentarCredito(tx, aula.creditoId, aula.id, 'devolucao');
  }
  return atualizada;
}

export type CalculoCancelamento = {
  gratuito: boolean;
  multaCentavos: number;
  reembolsoCentavos: number;
  gratisAte: Date;
};

export function calcularCancelamento(
  aula: Pick<Aula, 'inicio' | 'valorCentavos' | 'politicaCancelamento' | 'status'>,
  agora: Date,
): CalculoCancelamento {
  const politica = aula.politicaCancelamento;
  const gratisAte = new Date(aula.inicio.getTime() - politica.gratisAteHoras * 3600_000);
  // Antes da confirmação do instrutor, cancelar é sempre grátis.
  const gratuito =
    agora <= gratisAte || aula.status === 'solicitada' || aula.status === 'aguardando_pagamento';
  const multa = gratuito ? 0 : Math.round((aula.valorCentavos * politica.multaBp) / 10000);
  return {
    gratuito,
    multaCentavos: multa,
    reembolsoCentavos: aula.valorCentavos - multa,
    gratisAte,
  };
}

export async function cancelarAula(
  tx: Tx,
  aula: Aula,
  opcoes: {
    por: 'aluno' | 'instrutor' | 'admin' | 'sistema';
    motivo: string;
    atorUsuarioId?: string | null;
    agora?: Date;
  },
) {
  const agora = opcoes.agora ?? new Date();
  let resultado: Aula;
  if (aula.status === 'aguardando_pagamento') {
    resultado = await mudarStatusAula(tx, aula, 'cancelada', {
      motivo: opcoes.motivo,
      atorUsuarioId: opcoes.atorUsuarioId,
      extras: { canceladaEm: agora, canceladaPor: opcoes.por, motivoCancelamento: opcoes.motivo },
    });
    await movimentarCredito(tx, aula.creditoId, aula.id, 'devolucao', 'cancelado');
    const pedido = await carregarPedido(tx, aula.pedidoId);
    await mudarStatusPedido(tx, pedido, 'cancelado', {
      motivo: opcoes.motivo,
      atorUsuarioId: opcoes.atorUsuarioId,
    });
  } else {
    const calculo = calcularCancelamento(aula, agora);
    const comMulta = opcoes.por === 'aluno' && !calculo.gratuito;
    if (!comMulta) {
      resultado = await encerrarComEstornoTotal(tx, aula, 'cancelada', {
        motivo: opcoes.motivo,
        atorUsuarioId: opcoes.atorUsuarioId,
        canceladaPor: opcoes.por,
      });
    } else {
      resultado = await mudarStatusAula(tx, aula, 'cancelada', {
        motivo: opcoes.motivo,
        atorUsuarioId: opcoes.atorUsuarioId,
        extras: {
          canceladaEm: agora,
          canceladaPor: 'aluno',
          motivoCancelamento: opcoes.motivo,
          multaCancelamentoCentavos: calculo.multaCentavos,
        },
      });
      const pedido = await carregarPedido(tx, aula.pedidoId);
      if (pedido.tipo === 'aula_avulsa') {
        await movimentarCredito(tx, aula.creditoId, aula.id, 'devolucao', 'cancelado');
        await estornarValor(tx, pedido, calculo.reembolsoCentavos, {
          motivo: 'cancelamento',
          aulaId: aula.id,
          solicitadoPor: opcoes.atorUsuarioId,
        });
        await liberarValor(tx, pedido, calculo.multaCentavos, {
          aulaId: aula.id,
          descricao: `Multa por cancelamento tardio — pedido ${pedido.codigo}`,
        });
        await mudarStatusPedido(tx, pedido, 'encerrado', { motivo: 'Cancelado com multa' });
      } else {
        // Pacote: o cancelamento tardio consome a aula do saldo.
        await movimentarCredito(tx, aula.creditoId, aula.id, 'consumo');
      }
    }
  }
  await publicarEvento(tx, {
    tipo: 'aula.cancelada',
    agregadoTipo: 'aula',
    agregadoId: aula.id,
    autoescolaId: aula.autoescolaId,
    payload: {
      aulaId: aula.id,
      alunoId: aula.alunoId,
      instrutorId: aula.instrutorId,
      canceladaPor: opcoes.por,
      motivo: opcoes.motivo,
    },
  });
  return resultado;
}

/**
 * Carga horária de uma aula. `realizados` é o tempo real entre check-in e check-out (null sem os dois);
 * `contados` é o que entra nas horas do aluno: o realizado, limitado à duração agendada
 * (aula que passou do horário não gera horas além das contratadas; sem check-out, vale a agendada).
 */
export function cargaHoraria(aula: {
  inicio: Date;
  fim: Date;
  checkinEm: Date | null;
  checkoutEm: Date | null;
}) {
  const agendados = Math.round((aula.fim.getTime() - aula.inicio.getTime()) / 60_000);
  const realizados =
    aula.checkinEm && aula.checkoutEm
      ? Math.max(0, Math.round((aula.checkoutEm.getTime() - aula.checkinEm.getTime()) / 60_000))
      : null;
  return { agendados, realizados, contados: Math.min(realizados ?? agendados, agendados) };
}

/**
 * Fim da aula confirmado (pelo aluno ou automaticamente): consome o crédito e libera o valor ao instrutor.
 */
export async function concluirAula(
  tx: Tx,
  aulaId: string,
  por: 'aluno' | 'automatico',
  opcoes: { atorUsuarioId?: string | null; agora?: Date } = {},
) {
  const agora = opcoes.agora ?? new Date();
  const aula = await carregarAulaParaAlterar(tx, aulaId);
  if (aula.status === 'concluida') return aula;
  const { realizados, contados } = cargaHoraria(aula);
  const concluida = await mudarStatusAula(tx, aula, 'concluida', {
    atorUsuarioId: opcoes.atorUsuarioId,
    motivo: por === 'aluno' ? 'Fim da aula confirmado pelo aluno' : 'Confirmado automaticamente',
    extras: {
      checkoutConfirmadoEm: agora,
      checkoutConfirmadoPor: por,
      minutosRealizados: realizados,
    },
  });
  await movimentarCredito(tx, aula.creditoId, aula.id, 'consumo');
  const pedido = await carregarPedido(tx, aula.pedidoId);
  const [credito] = await tx.select().from(creditosAula).where(eq(creditosAula.id, aula.creditoId));
  if (pedido.vendedorTipo === 'instrutor') {
    // Pacote: libera uma parte por aula; na última, libera todo o restante (sem sobras de arredondamento).
    const restante = await retidoDoPedido(tx, pedido);
    const valor =
      pedido.tipo === 'aula_avulsa' || credito?.status === 'esgotado'
        ? restante
        : Math.min(restante, Math.round(pedido.valorTotalCentavos / pedido.quantidadeAulas));
    await liberarValor(tx, pedido, valor, {
      aulaId: aula.id,
      descricao: `Aula de ${aula.inicio.toISOString().slice(0, 10)} — pedido ${pedido.codigo}`,
    });
  }
  if (credito?.status === 'esgotado') await mudarStatusPedido(tx, pedido, 'encerrado');

  await tx
    .update(alunos)
    .set({
      horasAcumuladasMin: sql`${alunos.horasAcumuladasMin} + ${contados}`,
      aulasConcluidas: sql`${alunos.aulasConcluidas} + 1`,
    })
    .where(eq(alunos.id, aula.alunoId));
  await tx
    .update(instrutores)
    .set({ totalAulas: sql`${instrutores.totalAulas} + 1` })
    .where(eq(instrutores.id, aula.instrutorId));
  await publicarEvento(tx, {
    tipo: 'aula.concluida',
    agregadoTipo: 'aula',
    agregadoId: aula.id,
    autoescolaId: aula.autoescolaId,
    payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId },
  });
  return concluida;
}
