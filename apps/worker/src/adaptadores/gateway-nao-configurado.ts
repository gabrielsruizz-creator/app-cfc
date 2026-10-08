import type { GatewayPagamentoPort, ResultadoExterno } from '../portas/gateway-pagamento';

/**
 * Usado enquanto nenhum gateway real está configurado. Nunca finge sucesso:
 * toda operação fica registrada como "pendente_configuracao".
 */
export class GatewayNaoConfigurado implements GatewayPagamentoPort {
  readonly nome = 'nao_configurado';
  private pendente<T>(): Promise<ResultadoExterno<T>> {
    return Promise.resolve({
      status: 'pendente_configuracao',
      motivo: 'Nenhum gateway de pagamento configurado',
    });
  }
  criarCobrancaPix() {
    return this.pendente<never>();
  }
  cancelarCobranca() {
    return this.pendente<object>();
  }
  estornar() {
    return this.pendente<{ gatewayEstornoId: string }>();
  }
  transferir() {
    return this.pendente<{ gatewayTransferenciaId: string }>();
  }
  pagarPix() {
    return this.pendente<{ gatewayRef: string }>();
  }
  interpretarWebhook() {
    return { tipo: 'invalido' as const, motivo: 'Gateway não configurado' };
  }
}
