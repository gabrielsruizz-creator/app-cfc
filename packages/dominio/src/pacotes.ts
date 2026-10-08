import type { Gateway, StatusAtendimento } from '@volante/contracts';
import {
  and,
  autoescolas,
  cobrancas,
  creditosAula,
  eq,
  instrutores,
  instrutorVinculos,
  lerConfiguracoes,
  matriculas,
  pacotes,
  pedidoHistorico,
  pedidos,
  publicarEvento,
  usuarios,
  type Tx,
} from '@volante/db';
import { gerarCodigoPedido } from './codigos';
import { ErroDominio, naoEncontrado } from './erros';
import { calcularComissao, estornarValor, liberarValor, regraComissaoVigente } from './financeiro';

type Pedido = typeof pedidos.$inferSelect;

async function nomeVendedor(tx: Tx, p: typeof pacotes.$inferSelect): Promise<string> {
  if (p.autoescolaId) {
    const [a] = await tx
      .select({ nome: autoescolas.nomeFantasia })
      .from(autoescolas)
      .where(eq(autoescolas.id, p.autoescolaId));
    return a?.nome ?? 'Autoescola';
  }
  const [i] = await tx
    .select({ nome: usuarios.nome })
    .from(instrutores)
    .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
    .where(eq(instrutores.id, p.instrutorId!));
  return i?.nome ?? 'Instrutor';
}

/**
 * Aluno compra um pacote de aulas (de instrutor ou de autoescola). Cria pedido, crédito
 * (ainda inativo) e cobrança Pix. O valor fica RETIDO quando o pagamento é confirmado.
 */
export async function comprarPacote(
  tx: Tx,
  d: {
    alunoId: string;
    pacoteId: string;
    gateway: Gateway;
    chaveIdempotencia: string;
    agora?: Date;
  },
) {
  const agora = d.agora ?? new Date();
  const [p] = await tx.select().from(pacotes).where(eq(pacotes.id, d.pacoteId));
  if (!p || !p.publicado || p.arquivadoEm) throw naoEncontrado('pacote');

  if (p.instrutorId) {
    const [i] = await tx.select().from(instrutores).where(eq(instrutores.id, p.instrutorId));
    if (i?.status !== 'aprovado')
      throw new ErroDominio('vendedor_indisponivel', 'Este instrutor não está vendendo no momento');
  } else {
    const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, p.autoescolaId!));
    if (a?.status !== 'aprovada')
      throw new ErroDominio(
        'vendedor_indisponivel',
        'Esta autoescola não está vendendo no momento',
      );
  }

  const vendedorTipo = p.vendedorTipo as 'instrutor' | 'autoescola';
  const regra = await regraComissaoVigente(tx, vendedorTipo, 'pacote', {
    instrutorId: p.instrutorId,
    autoescolaId: p.autoescolaId,
  });
  const comissao = calcularComissao(p.precoCentavos, regra);
  const cfg = await lerConfiguracoes(tx);

  const [pedido] = await tx
    .insert(pedidos)
    .values({
      codigo: gerarCodigoPedido(),
      alunoId: d.alunoId,
      vendedorTipo,
      instrutorId: p.instrutorId,
      autoescolaId: p.autoescolaId,
      tipo: 'pacote',
      pacoteId: p.id,
      snapshot: {
        descricao: p.nome,
        categorias: p.categorias,
        quantidadeAulas: p.quantidadeAulas,
        duracaoAulaMin: p.duracaoAulaMin,
        precoUnitarioCentavos: Math.round(p.precoCentavos / p.quantidadeAulas),
        vendedorNome: await nomeVendedor(tx, p),
      },
      quantidadeAulas: p.quantidadeAulas,
      valorBrutoCentavos: p.precoCentavos,
      valorTotalCentavos: p.precoCentavos,
      comissaoBp: regra.percentualBp,
      comissaoCentavos: comissao,
      regraComissaoId: regra.id,
      valorLiquidoVendedorCentavos: p.precoCentavos - comissao,
    })
    .returning();

  await tx.insert(creditosAula).values({
    pedidoId: pedido!.id,
    alunoId: d.alunoId,
    instrutorId: p.instrutorId,
    autoescolaId: p.autoescolaId,
    categorias: p.categorias,
    duracaoAulaMin: p.duracaoAulaMin,
    quantidadeTotal: p.quantidadeAulas,
    status: 'aguardando_pagamento',
  });

  const [cobranca] = await tx
    .insert(cobrancas)
    .values({
      pedidoId: pedido!.id,
      alunoId: d.alunoId,
      instrutorId: p.instrutorId,
      autoescolaId: p.autoescolaId,
      gateway: d.gateway,
      metodo: 'pix',
      valorCentavos: p.precoCentavos,
      pixExpiraEm: new Date(agora.getTime() + cfg['aula.pix_expira_min'] * 60_000),
      chaveIdempotencia: d.chaveIdempotencia,
    })
    .returning();

  await publicarEvento(tx, {
    tipo: 'pedido.criado',
    agregadoTipo: 'pedido',
    agregadoId: pedido!.id,
    autoescolaId: p.autoescolaId,
    payload: { pedidoId: pedido!.id, alunoId: d.alunoId, autoescolaId: p.autoescolaId },
  });
  await publicarEvento(tx, {
    tipo: 'cobranca.solicitada',
    agregadoTipo: 'cobranca',
    agregadoId: cobranca!.id,
    autoescolaId: p.autoescolaId,
    payload: { cobrancaId: cobranca!.id },
  });
  return { pedido: pedido!, cobranca: cobranca! };
}

async function validadeDoPacote(tx: Tx, pedido: Pedido, agora: Date): Promise<Date | null> {
  if (!pedido.pacoteId) return null;
  const [p] = await tx
    .select({ dias: pacotes.validadeDias })
    .from(pacotes)
    .where(eq(pacotes.id, pedido.pacoteId));
  return p?.dias ? new Date(agora.getTime() + p.dias * 86400_000) : null;
}

async function mudarAtendimento(
  tx: Tx,
  pedido: Pedido,
  para: StatusAtendimento,
  opcoes: { atorUsuarioId?: string | null; motivo?: string | null; extras?: Partial<Pedido> } = {},
) {
  const [p] = await tx
    .update(pedidos)
    .set({ ...opcoes.extras, statusAtendimento: para })
    .where(eq(pedidos.id, pedido.id))
    .returning();
  await tx.insert(pedidoHistorico).values({
    pedidoId: pedido.id,
    alunoId: pedido.alunoId,
    instrutorId: pedido.instrutorId,
    autoescolaId: pedido.autoescolaId,
    deStatus: pedido.statusAtendimento,
    paraStatus: para,
    atorUsuarioId: opcoes.atorUsuarioId ?? null,
    motivo: opcoes.motivo ?? null,
  });
  return p!;
}

/** Chamado na confirmação do pagamento de um pacote. */
export async function ativarPacotePago(tx: Tx, pedido: Pedido, agora: Date) {
  if (pedido.vendedorTipo === 'autoescola') {
    // Fica bloqueado até a autoescola confirmar o aluno (o valor continua retido).
    const cfg = await lerConfiguracoes(tx);
    await tx
      .update(creditosAula)
      .set({ status: 'bloqueado' })
      .where(eq(creditosAula.pedidoId, pedido.id));
    await mudarAtendimento(tx, pedido, 'novo', {
      motivo: 'Pagamento confirmado — aguardando contato da autoescola',
      extras: {
        prazoRespostaEm: new Date(agora.getTime() + cfg['pedido.expiracao_dias'] * 86400_000),
      },
    });
  } else {
    await tx
      .update(creditosAula)
      .set({ status: 'ativo', validoAte: await validadeDoPacote(tx, pedido, agora) })
      .where(eq(creditosAula.pedidoId, pedido.id));
  }
  await publicarEvento(tx, {
    tipo: 'pedido.pago',
    agregadoTipo: 'pedido',
    agregadoId: pedido.id,
    autoescolaId: pedido.autoescolaId,
    payload: { pedidoId: pedido.id, alunoId: pedido.alunoId, autoescolaId: pedido.autoescolaId },
  });
}

async function pedidoNaFila(tx: Tx, pedidoId: string, autoescolaId: string) {
  const [p] = await tx
    .select()
    .from(pedidos)
    .where(and(eq(pedidos.id, pedidoId), eq(pedidos.autoescolaId, autoescolaId)))
    .for('update');
  if (!p) throw naoEncontrado('pedido');
  if (p.status !== 'pago' || !['novo', 'em_contato'].includes(p.statusAtendimento ?? '')) {
    throw new ErroDominio('pedido_finalizado', 'Este pedido já foi respondido', 'conflito');
  }
  return p;
}

export async function marcarEmContato(
  tx: Tx,
  pedidoId: string,
  autoescolaId: string,
  atorUsuarioId: string,
) {
  const p = await pedidoNaFila(tx, pedidoId, autoescolaId);
  if (p.statusAtendimento === 'em_contato') return p;
  const atualizado = await mudarAtendimento(tx, p, 'em_contato', {
    atorUsuarioId,
    extras: { primeiroContatoEm: new Date() },
  });
  await publicarEvento(tx, {
    tipo: 'pedido.em_contato',
    agregadoTipo: 'pedido',
    agregadoId: p.id,
    autoescolaId,
    payload: { pedidoId: p.id, autoescolaId },
  });
  return atualizado;
}

/**
 * Autoescola confirma o aluno: libera o valor (menos a comissão), cria a matrícula e
 * ativa o saldo de aulas para o aluno agendar.
 */
export async function confirmarPedidoAutoescola(
  tx: Tx,
  pedidoId: string,
  autoescolaId: string,
  atorUsuarioId: string | null,
) {
  const p = await pedidoNaFila(tx, pedidoId, autoescolaId);
  const agora = new Date();
  const atualizado = await mudarAtendimento(tx, p, 'confirmado', {
    atorUsuarioId,
    motivo: 'Aluno confirmado pela autoescola',
    extras: { confirmadoEm: agora },
  });
  await tx
    .update(creditosAula)
    .set({ status: 'ativo', validoAte: await validadeDoPacote(tx, p, agora) })
    .where(eq(creditosAula.pedidoId, p.id));
  await liberarValor(tx, p, p.valorTotalCentavos, { descricao: `Pedido ${p.codigo} confirmado` });
  const [matricula] = await tx
    .insert(matriculas)
    .values({ autoescolaId, alunoId: p.alunoId, pedidoId: p.id, categorias: p.snapshot.categorias })
    .returning();
  await publicarEvento(tx, {
    tipo: 'pedido.confirmado',
    agregadoTipo: 'pedido',
    agregadoId: p.id,
    autoescolaId,
    payload: { pedidoId: p.id, alunoId: p.alunoId, autoescolaId },
  });
  await publicarEvento(tx, {
    tipo: 'matricula.criada',
    agregadoTipo: 'matricula',
    agregadoId: matricula!.id,
    autoescolaId,
    payload: { matriculaId: matricula!.id, pedidoId: p.id, alunoId: p.alunoId, autoescolaId },
  });
  return atualizado;
}

async function encerrarComEstorno(
  tx: Tx,
  p: Pedido,
  para: 'recusado' | 'expirado',
  motivo: string,
  atorUsuarioId: string | null,
) {
  const agora = new Date();
  await mudarAtendimento(tx, p, para, {
    atorUsuarioId,
    motivo,
    extras:
      para === 'recusado' ? { recusadoEm: agora, motivoRecusa: motivo } : { expiradoEm: agora },
  });
  await tx.update(creditosAula).set({ status: 'estornado' }).where(eq(creditosAula.pedidoId, p.id));
  await estornarValor(tx, p, p.valorTotalCentavos, {
    motivo: para === 'recusado' ? 'pedido_recusado' : 'pedido_expirado',
    solicitadoPor: atorUsuarioId,
  });
  await tx.update(pedidos).set({ status: 'estornado' }).where(eq(pedidos.id, p.id));
}

export async function recusarPedidoAutoescola(
  tx: Tx,
  pedidoId: string,
  autoescolaId: string,
  motivo: string,
  atorUsuarioId: string,
) {
  const p = await pedidoNaFila(tx, pedidoId, autoescolaId);
  await encerrarComEstorno(tx, p, 'recusado', motivo, atorUsuarioId);
  await publicarEvento(tx, {
    tipo: 'pedido.recusado',
    agregadoTipo: 'pedido',
    agregadoId: p.id,
    autoescolaId,
    payload: { pedidoId: p.id, alunoId: p.alunoId, autoescolaId, motivo },
  });
}

/** Rotina: sem resposta da autoescola no prazo, o aluno recebe o valor de volta. */
export async function expirarPedidoAutoescola(tx: Tx, pedidoId: string) {
  const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)).for('update');
  if (
    !p?.autoescolaId ||
    p.status !== 'pago' ||
    !['novo', 'em_contato'].includes(p.statusAtendimento ?? '')
  )
    return false;
  await encerrarComEstorno(tx, p, 'expirado', 'A autoescola não respondeu dentro do prazo', null);
  await publicarEvento(tx, {
    tipo: 'pedido.expirado',
    agregadoTipo: 'pedido',
    agregadoId: p.id,
    autoescolaId: p.autoescolaId,
    payload: { pedidoId: p.id, alunoId: p.alunoId, autoescolaId: p.autoescolaId },
  });
  return true;
}

/** Rotina: lembrete único à autoescola depois de X horas sem resposta. */
export async function lembrarAutoescola(tx: Tx, pedidoId: string) {
  const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)).for('update');
  if (!p?.autoescolaId || p.lembreteEnviadoEm || p.statusAtendimento !== 'novo') return false;
  await tx.update(pedidos).set({ lembreteEnviadoEm: new Date() }).where(eq(pedidos.id, p.id));
  await publicarEvento(tx, {
    tipo: 'pedido.lembrete',
    agregadoTipo: 'pedido',
    agregadoId: p.id,
    autoescolaId: p.autoescolaId,
    payload: { pedidoId: p.id, autoescolaId: p.autoescolaId },
  });
  return true;
}

/** Quantas aulas ainda podem ser agendadas com um crédito. */
export const aulasDisponiveis = (c: typeof creditosAula.$inferSelect) =>
  c.quantidadeTotal - c.quantidadeReservada - c.quantidadeConsumida;

/**
 * Valida se um crédito pode ser usado com um instrutor: pacote de instrutor só com ele;
 * pacote de autoescola com instrutores vinculados (ativos) a ela.
 */
export async function validarCreditoParaInstrutor(
  tx: Tx,
  credito: typeof creditosAula.$inferSelect,
  instrutorId: string,
) {
  if (credito.status !== 'ativo') {
    throw new ErroDominio(
      'credito_indisponivel',
      credito.status === 'bloqueado'
        ? 'Aguarde a autoescola confirmar sua matrícula para agendar'
        : 'Este saldo não está disponível',
    );
  }
  if (credito.validoAte && credito.validoAte < new Date()) {
    throw new ErroDominio('credito_vencido', 'O prazo para usar este pacote terminou');
  }
  if (aulasDisponiveis(credito) <= 0)
    throw new ErroDominio('credito_esgotado', 'Você já usou todas as aulas deste pacote');
  if (credito.instrutorId && credito.instrutorId !== instrutorId) {
    throw new ErroDominio('instrutor_invalido', 'Este pacote é de outro instrutor');
  }
  if (credito.autoescolaId) {
    const [v] = await tx
      .select({ id: instrutorVinculos.id })
      .from(instrutorVinculos)
      .where(
        and(
          eq(instrutorVinculos.autoescolaId, credito.autoescolaId),
          eq(instrutorVinculos.instrutorId, instrutorId),
          eq(instrutorVinculos.status, 'ativo'),
        ),
      );
    if (!v) throw new ErroDominio('instrutor_invalido', 'Escolha um instrutor da sua autoescola');
  }
}
