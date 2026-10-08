import type {
  DadosCobrancaPix,
  GatewayPagamentoPort,
  WebhookArmazenado,
} from '../portas/gateway-pagamento';

/**
 * SOMENTE PARA TESTES. Gera um "Pix" fictício; o pagamento só é confirmado quando alguém
 * aciona explicitamente "Simular pagamento" (rota /dev da API), que grava um webhook como
 * um gateway real faria. Bloqueado em produção pela configuração da API.
 */
export class GatewaySimulado implements GatewayPagamentoPort {
  readonly nome = 'simulado';

  async criarCobrancaPix(d: DadosCobrancaPix) {
    const id = `sim_cob_${d.cobrancaId}`;
    return {
      status: 'ok' as const,
      gatewayCobrancaId: id,
      pixCopiaCola: `00020126SIMULADO-AMBIENTE-DE-TESTE-${d.cobrancaId}-VALOR-${d.valorCentavos}`,
      pixQrCodeBase64: null,
      expiraEm: d.expiraEm,
      dadosGateway: { simulado: true },
    };
  }

  async cancelarCobranca() {
    return { status: 'ok' as const };
  }

  async estornar(d: { estornoId: string }) {
    return { status: 'ok' as const, gatewayEstornoId: `sim_est_${d.estornoId}` };
  }

  async transferir(d: { repasseId: string }) {
    return { status: 'ok' as const, gatewayTransferenciaId: `sim_tra_${d.repasseId}` };
  }

  interpretarWebhook(w: WebhookArmazenado) {
    const p = w.payload;
    if (p.evento === 'PAGAMENTO_CONFIRMADO' && typeof p.cobrancaGatewayId === 'string') {
      return { tipo: 'pagamento_confirmado' as const, gatewayCobrancaId: p.cobrancaGatewayId };
    }
    return { tipo: 'ignorado' as const, motivo: `evento ${String(p.evento)}` };
  }
}
