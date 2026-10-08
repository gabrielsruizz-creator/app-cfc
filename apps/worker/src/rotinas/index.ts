import { DOCUMENTOS_COM_VALIDADE } from '@volante/contracts';
import {
  and,
  ATOR_SISTEMA,
  aulas,
  cobrancas,
  comAtor,
  creditosAula,
  disputas,
  eq,
  inArray,
  instrutorDocumentos,
  instrutores,
  lerConfiguracoes,
  isNull,
  lt,
  pedidos,
  publicarEvento,
  sql,
} from '@volante/db';
import {
  carregarAulaParaAlterar,
  concluirAula,
  encerrarComEstornoTotal,
  expirarAulaNaoPaga,
  expirarCredito,
  expirarPedidoAutoescola,
  lembrarAutoescola,
} from '@volante/dominio';
import type { Dependencias } from '../dependencias';

/** Aulas cujo Pix não foi pago dentro do prazo liberam o horário. */
export async function expirarPixNaoPagos(deps: Dependencias, agora = new Date()) {
  const vencidas = await comAtor(deps.db, ATOR_SISTEMA, (tx) =>
    tx
      .select({ aulaId: aulas.id })
      .from(aulas)
      .innerJoin(cobrancas, eq(cobrancas.pedidoId, aulas.pedidoId))
      .where(
        and(
          eq(aulas.status, 'aguardando_pagamento'),
          inArray(cobrancas.status, [
            'pendente_envio',
            'aguardando_pagamento',
            'pendente_configuracao',
            'falhou',
          ]),
          lt(cobrancas.pixExpiraEm, agora),
        ),
      ),
  );
  for (const { aulaId } of vencidas) {
    await comAtor(deps.db, ATOR_SISTEMA, (tx) => expirarAulaNaoPaga(tx, aulaId));
  }
  return vencidas.length;
}

/** Solicitações não respondidas pelo instrutor no prazo são encerradas com estorno integral. */
export async function expirarSolicitacoesSemResposta(deps: Dependencias, agora = new Date()) {
  const pendentes = await comAtor(deps.db, ATOR_SISTEMA, (tx) =>
    tx
      .select({ id: aulas.id })
      .from(aulas)
      .where(and(eq(aulas.status, 'solicitada'), lt(aulas.aceiteAte, agora))),
  );
  for (const { id } of pendentes) {
    await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      const aula = await carregarAulaParaAlterar(tx, id);
      if (aula.status !== 'solicitada') return;
      const motivo = 'O instrutor não respondeu dentro do prazo';
      await encerrarComEstornoTotal(tx, aula, 'expirada', { motivo });
      await publicarEvento(tx, {
        tipo: 'aula.expirada',
        agregadoTipo: 'aula',
        agregadoId: aula.id,
        autoescolaId: aula.autoescolaId,
        payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId, motivo },
      });
    });
  }
  return pendentes.length;
}

/** Fim de aula não contestado pelo aluno é confirmado automaticamente. */
export async function autoConfirmarFimDeAula(deps: Dependencias, agora = new Date()) {
  const cfg = await lerConfiguracoes(deps.db);
  const limite = new Date(agora.getTime() - cfg['aula.checkout_auto_confirmacao_h'] * 3600_000);
  const aguardando = await comAtor(deps.db, ATOR_SISTEMA, (tx) =>
    tx
      .select({ id: aulas.id })
      .from(aulas)
      .where(
        and(
          eq(aulas.status, 'aguardando_confirmacao'),
          lt(aulas.checkoutEm, limite),
          // aula com problema relatado espera a decisão do admin
          sql`not exists (select 1 from ${disputas} d where d.aula_id = ${aulas.id} and d.status = 'aberta')`,
        ),
      ),
  );
  for (const { id } of aguardando) {
    await comAtor(deps.db, ATOR_SISTEMA, (tx) => concluirAula(tx, id, 'automatico'));
  }
  return aguardando.length;
}

/**
 * Documentos do instrutor: avisa antes de vencer (ex.: 30/15/7 dias) e, quando vence,
 * marca o documento como vencido e suspende o instrutor (ele some da busca).
 */
export async function verificarDocumentos(deps: Dependencias, agora = new Date()) {
  const cfg = await lerConfiguracoes(deps.db);
  const hoje = agora.toISOString().slice(0, 10);
  const maiorAlerta = Math.max(...cfg['documento.alertas_dias']);
  const docs = await deps.db
    .select()
    .from(instrutorDocumentos)
    .where(
      and(
        eq(instrutorDocumentos.status, 'aprovado'),
        inArray(instrutorDocumentos.tipo, [...DOCUMENTOS_COM_VALIDADE]),
        sql`${instrutorDocumentos.validade} <= (${hoje}::date + ${maiorAlerta}::int)`,
      ),
    );
  let suspensos = 0;
  for (const doc of docs) {
    const dias = Math.round(
      (new Date(`${doc.validade}T00:00:00Z`).getTime() - new Date(`${hoje}T00:00:00Z`).getTime()) /
        86400_000,
    );
    await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      if (dias < 0) {
        await tx
          .update(instrutorDocumentos)
          .set({ status: 'vencido' })
          .where(eq(instrutorDocumentos.id, doc.id));
        const r = await tx
          .update(instrutores)
          .set({
            status: 'suspenso_documento',
            disponivel: false,
            motivoStatus: 'Documento vencido',
          })
          .where(and(eq(instrutores.id, doc.instrutorId), eq(instrutores.status, 'aprovado')))
          .returning();
        suspensos += r.length;
        await publicarEvento(tx, {
          tipo: 'instrutor.documento_vencido',
          agregadoTipo: 'instrutor',
          agregadoId: doc.instrutorId,
          payload: { instrutorId: doc.instrutorId, documentoId: doc.id, tipo: doc.tipo },
        });
        return;
      }
      const alerta = cfg['documento.alertas_dias']
        .filter((d) => dias <= d && !doc.alertasEnviados.includes(d))
        .sort((a, b) => a - b)[0];
      if (alerta === undefined) return;
      const jaEnviados = cfg['documento.alertas_dias'].filter((d) => dias <= d);
      await tx
        .update(instrutorDocumentos)
        .set({ alertasEnviados: [...new Set([...doc.alertasEnviados, ...jaEnviados])] })
        .where(eq(instrutorDocumentos.id, doc.id));
      await publicarEvento(tx, {
        tipo: 'instrutor.documento_vencendo',
        agregadoTipo: 'instrutor',
        agregadoId: doc.instrutorId,
        payload: {
          instrutorId: doc.instrutorId,
          documentoId: doc.id,
          tipo: doc.tipo,
          validade: doc.validade!,
          diasRestantes: dias,
        },
      });
    });
  }
  return { avaliados: docs.length, suspensos };
}

/**
 * Fila da autoescola: lembrete quando o pedido pago fica sem atendimento por X horas e
 * expiração (com estorno integral) quando passa do prazo de resposta.
 */
export async function acompanharPedidosAutoescola(deps: Dependencias, agora = new Date()) {
  const cfg = await lerConfiguracoes(deps.db);
  const limiteLembrete = new Date(agora.getTime() - cfg['pedido.lembrete_horas'] * 3600_000);
  const { lembrar, expirar } = await comAtor(deps.db, ATOR_SISTEMA, async (tx) => ({
    lembrar: await tx
      .select({ id: pedidos.id })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.status, 'pago'),
          eq(pedidos.statusAtendimento, 'novo'),
          isNull(pedidos.lembreteEnviadoEm),
          lt(pedidos.pagoEm, limiteLembrete),
        ),
      ),
    expirar: await tx
      .select({ id: pedidos.id })
      .from(pedidos)
      .where(
        and(
          eq(pedidos.status, 'pago'),
          inArray(pedidos.statusAtendimento, ['novo', 'em_contato']),
          lt(pedidos.prazoRespostaEm, agora),
        ),
      ),
  }));
  let lembretes = 0;
  let expirados = 0;
  for (const { id } of expirar) {
    if (await comAtor(deps.db, ATOR_SISTEMA, (tx) => expirarPedidoAutoescola(tx, id))) expirados++;
  }
  for (const { id } of lembrar) {
    if (expirar.some((e) => e.id === id)) continue;
    if (await comAtor(deps.db, ATOR_SISTEMA, (tx) => lembrarAutoescola(tx, id))) lembretes++;
  }
  return { lembretes, expirados };
}

/** Pacotes com validade vencida: aulas não usadas expiram e o valor vai ao vendedor. */
export async function expirarCreditosVencidos(deps: Dependencias, agora = new Date()) {
  const vencidos = await comAtor(deps.db, ATOR_SISTEMA, (tx) =>
    tx
      .select({ id: creditosAula.id })
      .from(creditosAula)
      .where(and(eq(creditosAula.status, 'ativo'), lt(creditosAula.validoAte, agora))),
  );
  let expirados = 0;
  for (const { id } of vencidos) {
    if (await comAtor(deps.db, ATOR_SISTEMA, (tx) => expirarCredito(tx, id, agora))) expirados++;
  }
  return expirados;
}

export async function executarRotinas(deps: Dependencias, agora = new Date()) {
  return {
    pedidosAutoescola: await acompanharPedidosAutoescola(deps, agora),
    creditosExpirados: await expirarCreditosVencidos(deps, agora),
    pixExpirados: await expirarPixNaoPagos(deps, agora),
    solicitacoesExpiradas: await expirarSolicitacoesSemResposta(deps, agora),
    aulasAutoConfirmadas: await autoConfirmarFimDeAula(deps, agora),
    documentos: await verificarDocumentos(deps, agora),
  };
}
