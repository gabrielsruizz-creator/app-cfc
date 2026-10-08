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

/** Cartão: o aluno paga numa página do gateway (o app nunca vê dados do cartão). */
export type DadosCobrancaCartao = Omit<DadosCobrancaPix, never> & { parcelas: number };

export type CobrancaCartaoCriada = {
  gatewayCobrancaId: string;
  /** Página de pagamento; nulo no simulador (o app mostra "Simular pagamento"). */
  urlPagamento: string | null;
  dadosGateway?: unknown;
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
  criarCobrancaCartao(dados: DadosCobrancaCartao): Promise<ResultadoExterno<CobrancaCartaoCriada>>;
  /** `parcelado`: a cobrança é um parcelamento no cartão (cancelado/estornado como um todo). */
  cancelarCobranca(
    gatewayCobrancaId: string,
    opcoes?: { parcelado?: boolean },
  ): Promise<ResultadoExterno<object>>;
  estornar(dados: {
    gatewayCobrancaId: string;
    valorCentavos: number;
    estornoId: string;
    parcelado?: boolean;
    /** Valor total da cobrança (para saber se o estorno é integral). */
    valorCobrancaCentavos?: number;
  }): Promise<ResultadoExterno<{ gatewayEstornoId: string }>>;
  transferir(dados: {
    repasseId: string;
    valorCentavos: number;
    destinoId: string | null;
  }): Promise<ResultadoExterno<{ gatewayTransferenciaId: string }>>;
  /** Saque: transferência Pix para a chave do instrutor/autoescola. */
  pagarPix(dados: DadosPagamentoPix): Promise<ResultadoExterno<{ gatewayRef: string }>>;
  interpretarWebhook(webhook: WebhookArmazenado): InterpretacaoWebhook;
}

export type DadosPagamentoPix = {
  saqueId: string;
  valorCentavos: number;
  chave: string;
  tipoChave: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';
};
