import { and, auditar, disputas, eq, publicarEvento, type Ator, type Tx } from '@volante/db';
import {
  carregarAulaParaAlterar,
  carregarPedido,
  concluirAula,
  encerrarComEstornoTotal,
} from './aulas';
import { ErroDominio, naoEncontrado } from './erros';
import { estornarValor, retidoDoPedido } from './financeiro';

/** Status em que uma aula pode ser contestada (o valor ainda está retido). */
export const STATUS_CONTESTAVEIS = ['aguardando_confirmacao', 'confirmada', 'a_caminho'] as const;

/**
 * Abre uma disputa. Enquanto aberta, a confirmação automática do fim da aula fica suspensa
 * e o valor continua retido até a decisão do admin.
 */
export async function abrirDisputa(
  tx: Tx,
  d: {
    aulaId: string;
    usuarioId: string;
    papel: 'aluno' | 'instrutor' | 'autoescola';
    motivo: string;
    descricao: string;
  },
) {
  const aula = await carregarAulaParaAlterar(tx, d.aulaId);
  const confirmadaVencida =
    (aula.status === 'confirmada' || aula.status === 'a_caminho') && aula.fim < new Date();
  if (aula.status !== 'aguardando_confirmacao' && !confirmadaVencida) {
    throw new ErroDominio(
      'disputa_indisponivel',
      'Você pode relatar um problema depois do horário da aula, antes de confirmar o fim dela',
    );
  }
  const [aberta] = await tx
    .select({ id: disputas.id })
    .from(disputas)
    .where(and(eq(disputas.aulaId, aula.id), eq(disputas.status, 'aberta')));
  if (aberta)
    throw new ErroDominio(
      'disputa_existente',
      'Já existe um problema relatado para esta aula',
      'conflito',
    );
  const [disputa] = await tx
    .insert(disputas)
    .values({
      aulaId: aula.id,
      pedidoId: aula.pedidoId,
      abertaPorUsuarioId: d.usuarioId,
      abertaPorPapel: d.papel,
      motivo: d.motivo,
      descricao: d.descricao,
    })
    .returning();
  await publicarEvento(tx, {
    tipo: 'disputa.aberta',
    agregadoTipo: 'disputa',
    agregadoId: disputa!.id,
    autoescolaId: aula.autoescolaId,
    payload: { disputaId: disputa!.id, aulaId: aula.id },
  });
  return disputa!;
}

export async function existeDisputaAberta(tx: Tx, aulaId: string) {
  const [d] = await tx
    .select({ id: disputas.id })
    .from(disputas)
    .where(and(eq(disputas.aulaId, aulaId), eq(disputas.status, 'aberta')));
  return Boolean(d);
}

/**
 * Decisão do admin:
 * - estorno_total: a aula é encerrada e o aluno recebe tudo de volta (pacote: a aula volta ao saldo);
 * - estorno_parcial: devolve parte ao aluno e conclui a aula liberando o restante ao instrutor;
 * - negada: conclui a aula normalmente.
 */
export async function decidirDisputa(
  tx: Tx,
  d: {
    disputaId: string;
    ator: Ator;
    decisao: 'estorno_total' | 'estorno_parcial' | 'negada';
    valorEstornoCentavos?: number;
    resolucao: string;
  },
) {
  const [disputa] = await tx
    .select()
    .from(disputas)
    .where(eq(disputas.id, d.disputaId))
    .for('update');
  if (!disputa) throw naoEncontrado('disputa');
  if (disputa.status !== 'aberta')
    throw new ErroDominio('disputa_resolvida', 'Esta disputa já foi resolvida', 'conflito');
  const aula = await carregarAulaParaAlterar(tx, disputa.aulaId);
  const pedido = await carregarPedido(tx, aula.pedidoId);
  let valorEstorno = 0;

  if (d.decisao === 'estorno_total') {
    const para = ['confirmada', 'a_caminho'].includes(aula.status)
      ? 'nao_compareceu_instrutor'
      : 'cancelada';
    await encerrarComEstornoTotal(tx, aula, para, {
      motivo: `Disputa: ${d.resolucao}`,
      atorUsuarioId: d.ator.usuarioId,
      canceladaPor: 'admin',
      motivoEstorno: 'disputa',
    });
    valorEstorno = pedido.tipo === 'aula_avulsa' ? aula.valorCentavos : 0;
  } else {
    if (aula.status === 'confirmada' || aula.status === 'a_caminho') {
      throw new ErroDominio(
        'aula_sem_checkout',
        'A aula não teve check-out; use estorno total ou aguarde o instrutor',
      );
    }
    if (d.decisao === 'estorno_parcial') {
      if (pedido.tipo !== 'aula_avulsa' || pedido.vendedorTipo !== 'instrutor') {
        throw new ErroDominio(
          'estorno_parcial_indisponivel',
          'Estorno parcial só se aplica a aulas avulsas',
        );
      }
      const retido = await retidoDoPedido(tx, pedido);
      valorEstorno = d.valorEstornoCentavos ?? 0;
      if (valorEstorno <= 0 || valorEstorno >= retido) {
        throw new ErroDominio(
          'valor_invalido',
          'Informe um valor de estorno menor que o valor da aula',
        );
      }
      await estornarValor(tx, pedido, valorEstorno, {
        motivo: 'disputa',
        aulaId: aula.id,
        solicitadoPor: d.ator.usuarioId,
      });
    }
    await concluirAula(tx, aula.id, 'automatico', { atorUsuarioId: d.ator.usuarioId });
  }

  await tx
    .update(disputas)
    .set({
      status: 'resolvida',
      decisao: d.decisao,
      valorEstornoCentavos: valorEstorno,
      resolucao: d.resolucao,
      resolvidaPor: d.ator.usuarioId,
      resolvidaEm: new Date(),
    })
    .where(eq(disputas.id, disputa.id));
  await auditar(tx, {
    ator: d.ator,
    entidadeTipo: 'disputa',
    entidadeId: disputa.id,
    acao: `disputa.${d.decisao}`,
    depois: { valorEstornoCentavos: valorEstorno },
    motivo: d.resolucao,
    autoescolaId: aula.autoescolaId,
  });
  await publicarEvento(tx, {
    tipo: 'disputa.resolvida',
    agregadoTipo: 'disputa',
    agregadoId: disputa.id,
    autoescolaId: aula.autoescolaId,
    payload: { disputaId: disputa.id, aulaId: aula.id, decisao: d.decisao },
  });
}
