import {
  alunos,
  and,
  ATOR_SISTEMA,
  cobrancas,
  comAtor,
  eq,
  estornos,
  pedidos,
  repasses,
  usuarios,
  webhooksRecebidos,
} from '@volante/db';
import { confirmarPagamento } from '@volante/dominio';
import type { Dependencias } from '../dependencias';
import type { Consumidor, Evento } from '../outbox';
import type { GatewayPagamentoPort } from '../portas/gateway-pagamento';

const payload = <T>(e: Evento) => e.payload as T;

function gatewayDe(deps: Dependencias, nome: string): GatewayPagamentoPort {
  return deps.gateways[nome] ?? deps.gateways.nao_configurado!;
}

class ErroReprocessavel extends Error {}

/** Cria a cobrança Pix no gateway e grava o "copia e cola" para o app exibir. */
export const criarCobrancaNoGateway: Consumidor = {
  nome: 'gateway.criar_cobranca',
  eventos: ['cobranca.solicitada'],
  async executar(deps, evento) {
    const { cobrancaId } = payload<{ cobrancaId: string }>(evento);
    await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      const [linha] = await tx
        .select({ cobranca: cobrancas, pedido: pedidos, usuario: usuarios })
        .from(cobrancas)
        .innerJoin(pedidos, eq(pedidos.id, cobrancas.pedidoId))
        .innerJoin(alunos, eq(alunos.id, pedidos.alunoId))
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .where(eq(cobrancas.id, cobrancaId))
        .for('update', { of: cobrancas });
      if (!linha || linha.cobranca.status !== 'pendente_envio') return;
      const { cobranca, pedido, usuario } = linha;
      const r = await gatewayDe(deps, cobranca.gateway).criarCobrancaPix({
        cobrancaId: cobranca.id,
        valorCentavos: cobranca.valorCentavos,
        expiraEm: cobranca.pixExpiraEm ?? new Date(Date.now() + 30 * 60_000),
        descricao: `${pedido.snapshot.descricao} — pedido ${pedido.codigo}`,
        pagador: { nome: usuario.nome, cpf: usuario.cpf, email: usuario.email, telefone: usuario.telefone },
      });
      if (r.status === 'ok') {
        await tx
          .update(cobrancas)
          .set({
            status: 'aguardando_pagamento',
            gatewayCobrancaId: r.gatewayCobrancaId,
            pixCopiaCola: r.pixCopiaCola,
            pixQrcodeBase64: r.pixQrCodeBase64,
            dadosGateway: (r.dadosGateway ?? null) as never,
            ultimoErro: null,
          })
          .where(eq(cobrancas.id, cobranca.id));
      } else if (r.status === 'pendente_configuracao') {
        await tx
          .update(cobrancas)
          .set({ status: 'pendente_configuracao', ultimoErro: r.motivo })
          .where(eq(cobrancas.id, cobranca.id));
      } else if (r.reprocessar) {
        throw new ErroReprocessavel(r.motivo);
      } else {
        await tx.update(cobrancas).set({ status: 'falhou', ultimoErro: r.motivo }).where(eq(cobrancas.id, cobranca.id));
      }
    });
  },
};

/** Interpreta o webhook com o adaptador do gateway e confirma o pagamento. */
export const processarWebhookPagamento: Consumidor = {
  nome: 'gateway.webhook',
  eventos: ['pagamento.webhook_recebido'],
  async executar(deps, evento) {
    const { webhookId } = payload<{ webhookId: string }>(evento);
    const [w] = await deps.db.select().from(webhooksRecebidos).where(eq(webhooksRecebidos.id, webhookId));
    if (!w || w.processadoEm) return;
    const interpretacao = gatewayDe(deps, w.gateway).interpretarWebhook({
      gateway: w.gateway,
      cabecalhos: w.cabecalhos as Record<string, string>,
      payload: w.payload as Record<string, unknown>,
    });
    let erro: string | null = null;
    if (interpretacao.tipo === 'pagamento_confirmado') {
      await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
        const [c] = await tx
          .select()
          .from(cobrancas)
          .where(and(eq(cobrancas.gateway, w.gateway), eq(cobrancas.gatewayCobrancaId, interpretacao.gatewayCobrancaId)));
        if (!c) {
          erro = 'Cobrança não encontrada';
          return;
        }
        await confirmarPagamento(tx, c.id);
      });
    } else if (interpretacao.tipo === 'invalido') {
      erro = interpretacao.motivo;
      deps.log.erro(`Webhook ${w.id} recusado: ${interpretacao.motivo}`);
    }
    await deps.db
      .update(webhooksRecebidos)
      .set({ processadoEm: new Date(), erro })
      .where(eq(webhooksRecebidos.id, w.id));
  },
};

export const executarEstorno: Consumidor = {
  nome: 'gateway.estorno',
  eventos: ['estorno.solicitado'],
  async executar(deps, evento) {
    const { estornoId } = payload<{ estornoId: string }>(evento);
    await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      const [linha] = await tx
        .select({ estorno: estornos, cobranca: cobrancas })
        .from(estornos)
        .innerJoin(cobrancas, eq(cobrancas.id, estornos.cobrancaId))
        .where(eq(estornos.id, estornoId))
        .for('update', { of: estornos });
      if (!linha || !['solicitado', 'pendente_configuracao', 'falhou'].includes(linha.estorno.status)) return;
      const { estorno, cobranca } = linha;
      if (!cobranca.gatewayCobrancaId) {
        await tx.update(estornos).set({ status: 'pendente_configuracao', ultimoErro: 'Cobrança sem identificador no gateway' }).where(eq(estornos.id, estorno.id));
        return;
      }
      const r = await gatewayDe(deps, cobranca.gateway).estornar({
        gatewayCobrancaId: cobranca.gatewayCobrancaId,
        valorCentavos: estorno.valorCentavos,
        estornoId: estorno.id,
      });
      if (r.status === 'ok') {
        await tx
          .update(estornos)
          .set({ status: 'concluido', gatewayEstornoId: r.gatewayEstornoId, concluidoEm: new Date(), ultimoErro: null })
          .where(eq(estornos.id, estorno.id));
      } else if (r.status === 'pendente_configuracao') {
        await tx.update(estornos).set({ status: 'pendente_configuracao', ultimoErro: r.motivo }).where(eq(estornos.id, estorno.id));
      } else if (r.reprocessar) {
        throw new ErroReprocessavel(r.motivo);
      } else {
        await tx.update(estornos).set({ status: 'falhou', ultimoErro: r.motivo }).where(eq(estornos.id, estorno.id));
      }
    });
  },
};

export const executarRepasse: Consumidor = {
  nome: 'gateway.repasse',
  eventos: ['repasse.solicitado'],
  async executar(deps, evento) {
    const { repasseId } = payload<{ repasseId: string }>(evento);
    await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      const [repasse] = await tx.select().from(repasses).where(eq(repasses.id, repasseId)).for('update');
      if (!repasse || !['pendente', 'pendente_configuracao', 'falhou'].includes(repasse.status)) return;
      const [cobranca] = repasse.pedidoId
        ? await tx.select().from(cobrancas).where(eq(cobrancas.pedidoId, repasse.pedidoId)).limit(1)
        : [];
      // A conta de recebimento (subconta no gateway) chega na Fase 2.
      const r = await gatewayDe(deps, cobranca?.gateway ?? 'nao_configurado').transferir({
        repasseId: repasse.id,
        valorCentavos: repasse.valorCentavos,
        destinoId: null,
      });
      if (r.status === 'ok') {
        await tx
          .update(repasses)
          .set({ status: 'concluido', gatewayTransferenciaId: r.gatewayTransferenciaId, ultimoErro: null })
          .where(eq(repasses.id, repasse.id));
      } else if (r.status === 'pendente_configuracao') {
        await tx.update(repasses).set({ status: 'pendente_configuracao', ultimoErro: r.motivo }).where(eq(repasses.id, repasse.id));
      } else if (r.reprocessar) {
        throw new ErroReprocessavel(r.motivo);
      } else {
        await tx.update(repasses).set({ status: 'falhou', ultimoErro: r.motivo }).where(eq(repasses.id, repasse.id));
      }
    });
  },
};

export const cancelarCobrancaExpirada: Consumidor = {
  nome: 'gateway.cancelar_cobranca',
  eventos: ['cobranca.expirada'],
  async executar(deps, evento) {
    const { cobrancaId } = payload<{ cobrancaId: string }>(evento);
    const [c] = await comAtor(deps.db, ATOR_SISTEMA, (tx) => tx.select().from(cobrancas).where(eq(cobrancas.id, cobrancaId)));
    if (!c?.gatewayCobrancaId) return;
    const r = await gatewayDe(deps, c.gateway).cancelarCobranca(c.gatewayCobrancaId);
    if (r.status === 'erro' && r.reprocessar) throw new ErroReprocessavel(r.motivo);
  },
};

export const CONSUMIDORES_PAGAMENTO = [
  criarCobrancaNoGateway,
  processarWebhookPagamento,
  executarEstorno,
  executarRepasse,
  cancelarCobrancaExpirada,
];
