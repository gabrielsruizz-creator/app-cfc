/**
 * Porta do gateway de pagamento (Pix, cartão, split, estorno, transferência).
 * Adaptadores: NaoConfigurado (padrão), Simulado (somente testes) e Asaas.
 */
export type ResultadoExterno<T> =
  | ({ status: 'ok' } & T)
  | { status: 'pendente_configuracao'; motivo: string }
  | { status: 'erro'; motivo: string; reprocessar: boolean };

export type DadosCobrancaPix = {
  cobrancaId: string;
  valorCentavos: number;
  expiraEm: Date;
  descricao: string;
  pagador: { nome: string; cpf: string | null; email: string; telefone: string };
};

export type CobrancaCriada = {
  gatewayCobrancaId: string;
  pixCopiaCola: string;
  pixQrCodeBase64: string | null;
  expiraEm: Date;
  dadosGateway?: unknown;
};

export type WebhookArmazenado = {
  gateway: string;
  cabecalhos: Record<string, string>;
  payload: Record<string, unknown>;
};

export type InterpretacaoWebhook =
  | { tipo: 'pagamento_confirmado'; gatewayCobrancaId: string }
  | { tipo: 'ignorado'; motivo: string }
  | { tipo: 'invalido'; motivo: string };

export interface GatewayPagamentoPort {
  readonly nome: string;
  criarCobrancaPix(dados: DadosCobrancaPix): Promise<ResultadoExterno<CobrancaCriada>>;
  cancelarCobranca(gatewayCobrancaId: string): Promise<ResultadoExterno<object>>;
  estornar(dados: {
    gatewayCobrancaId: string;
    valorCentavos: number;
    estornoId: string;
  }): Promise<ResultadoExterno<{ gatewayEstornoId: string }>>;
  transferir(dados: {
    repasseId: string;
    valorCentavos: number;
    destinoId: string | null;
  }): Promise<ResultadoExterno<{ gatewayTransferenciaId: string }>>;
  interpretarWebhook(webhook: WebhookArmazenado): InterpretacaoWebhook;
}
