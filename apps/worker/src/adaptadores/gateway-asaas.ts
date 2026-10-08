import { timingSafeEqual } from 'node:crypto';
import type {
  DadosCobrancaCartao,
  DadosCobrancaPix,
  DadosPagamentoPix,
  GatewayPagamentoPort,
  ResultadoExterno,
  WebhookArmazenado,
} from '../portas/gateway-pagamento';

export type ConfigAsaas = {
  apiKey?: string;
  /** Sandbox: https://api-sandbox.asaas.com/v3 · Produção: https://api.asaas.com/v3 */
  url: string;
  webhookToken?: string;
};

type Fetch = typeof fetch;

/**
 * Adaptador Asaas (Pix e cartão). Sem API key configurada, comporta-se como "pendente_configuracao".
 * Webhook: o Asaas envia o token configurado no cabeçalho "asaas-access-token".
 */
export class GatewayAsaas implements GatewayPagamentoPort {
  readonly nome = 'asaas';

  constructor(
    private readonly config: ConfigAsaas,
    private readonly http: Fetch = fetch,
  ) {}

  private async chamar<T>(
    metodo: string,
    caminho: string,
    corpo?: unknown,
  ): Promise<ResultadoExterno<{ dados: T }>> {
    if (!this.config.apiKey)
      return { status: 'pendente_configuracao', motivo: 'ASAAS_API_KEY não configurada' };
    try {
      const r = await this.http(`${this.config.url}${caminho}`, {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          access_token: this.config.apiKey,
          'user-agent': 'volante-worker',
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const texto = await r.text();
      const dados = texto ? JSON.parse(texto) : {};
      if (!r.ok) {
        const motivo = dados?.errors?.[0]?.description ?? `HTTP ${r.status}`;
        return { status: 'erro', motivo, reprocessar: r.status >= 500 || r.status === 429 };
      }
      return { status: 'ok', dados: dados as T };
    } catch (erro) {
      return { status: 'erro', motivo: (erro as Error).message, reprocessar: true };
    }
  }

  private async cliente(d: DadosCobrancaPix) {
    if (!d.pagador.cpf)
      return { status: 'erro' as const, motivo: 'Pagador sem CPF', reprocessar: false };
    return this.chamar<{ id: string }>('POST', '/customers', {
      name: d.pagador.nome,
      cpfCnpj: d.pagador.cpf,
      email: d.pagador.email,
      mobilePhone: d.pagador.telefone.replace(/^\+55/, ''),
      externalReference: d.cobrancaId,
      notificationDisabled: true,
    });
  }

  /**
   * Cartão: cria a cobrança (parcelada quando parcelas > 1) e devolve a página de pagamento
   * do Asaas (invoiceUrl). Os dados do cartão são digitados lá, nunca passam por nós.
   */
  async criarCobrancaCartao(d: DadosCobrancaCartao) {
    const cliente = await this.cliente(d);
    if (cliente.status !== 'ok') return cliente;
    const valor = d.valorCentavos / 100;
    const pagamento = await this.chamar<{ id: string; invoiceUrl: string; installment?: string }>(
      'POST',
      '/payments',
      {
        customer: cliente.dados.id,
        billingType: 'CREDIT_CARD',
        dueDate: d.expiraEm.toISOString().slice(0, 10),
        description: d.descricao,
        externalReference: d.cobrancaId,
        ...(d.parcelas > 1
          ? { installmentCount: d.parcelas, totalValue: valor }
          : { value: valor }),
      },
    );
    if (pagamento.status !== 'ok') return pagamento;
    return {
      status: 'ok' as const,
      // Parcelado: o Asaas cria uma cobrança por parcela; acompanhamos o parcelamento.
      gatewayCobrancaId: pagamento.dados.installment ?? pagamento.dados.id,
      urlPagamento: pagamento.dados.invoiceUrl,
      dadosGateway: {
        clienteId: cliente.dados.id,
        pagamentoId: pagamento.dados.id,
        parcelamentoId: pagamento.dados.installment ?? null,
      },
    };
  }

  async criarCobrancaPix(d: DadosCobrancaPix) {
    const cliente = await this.cliente(d);
    if (cliente.status !== 'ok') return cliente;
    const pagamento = await this.chamar<{ id: string }>('POST', '/payments', {
      customer: cliente.dados.id,
      billingType: 'PIX',
      value: d.valorCentavos / 100,
      dueDate: d.expiraEm.toISOString().slice(0, 10),
      description: d.descricao,
      externalReference: d.cobrancaId,
    });
    if (pagamento.status !== 'ok') return pagamento;
    const qr = await this.chamar<{ encodedImage: string; payload: string; expirationDate: string }>(
      'GET',
      `/payments/${pagamento.dados.id}/pixQrCode`,
    );
    if (qr.status !== 'ok') return qr;
    return {
      status: 'ok' as const,
      gatewayCobrancaId: pagamento.dados.id,
      pixCopiaCola: qr.dados.payload,
      pixQrCodeBase64: qr.dados.encodedImage,
      expiraEm: d.expiraEm,
      dadosGateway: { clienteId: cliente.dados.id, pagamentoId: pagamento.dados.id },
    };
  }

  async cancelarCobranca(gatewayCobrancaId: string, opcoes: { parcelado?: boolean } = {}) {
    const recurso = opcoes.parcelado ? 'installments' : 'payments';
    const r = await this.chamar('DELETE', `/${recurso}/${gatewayCobrancaId}`);
    return r.status === 'ok' ? { status: 'ok' as const } : r;
  }

  async estornar(d: {
    gatewayCobrancaId: string;
    valorCentavos: number;
    parcelado?: boolean;
    valorCobrancaCentavos?: number;
  }) {
    if (d.parcelado) {
      // O Asaas estorna parcelamentos inteiros; estorno parcial fica para o painel do Asaas.
      if (d.valorCobrancaCentavos !== undefined && d.valorCentavos < d.valorCobrancaCentavos) {
        return {
          status: 'erro' as const,
          motivo: 'Estorno parcial de compra parcelada: faça pelo painel do Asaas',
          reprocessar: false,
        };
      }
      const r = await this.chamar('POST', `/installments/${d.gatewayCobrancaId}/refund`);
      return r.status === 'ok'
        ? { status: 'ok' as const, gatewayEstornoId: `${d.gatewayCobrancaId}:refund` }
        : r;
    }
    const r = await this.chamar<{ id: string }>('POST', `/payments/${d.gatewayCobrancaId}/refund`, {
      value: d.valorCentavos / 100,
    });
    return r.status === 'ok'
      ? { status: 'ok' as const, gatewayEstornoId: `${d.gatewayCobrancaId}:refund` }
      : r;
  }

  async transferir(d: { valorCentavos: number; destinoId: string | null }) {
    if (!d.destinoId) {
      return {
        status: 'pendente_configuracao' as const,
        motivo: 'Recebedor sem conta (subconta Asaas) cadastrada',
      };
    }
    const r = await this.chamar<{ id: string }>('POST', '/transfers', {
      value: d.valorCentavos / 100,
      walletId: d.destinoId,
    });
    return r.status === 'ok' ? { status: 'ok' as const, gatewayTransferenciaId: r.dados.id } : r;
  }

  async pagarPix(d: DadosPagamentoPix) {
    const tipos = {
      cpf: 'CPF',
      cnpj: 'CNPJ',
      email: 'EMAIL',
      telefone: 'PHONE',
      aleatoria: 'EVP',
    } as const;
    const r = await this.chamar<{ id: string }>('POST', '/transfers', {
      value: d.valorCentavos / 100,
      pixAddressKey: d.chave,
      pixAddressKeyType: tipos[d.tipoChave],
      operationType: 'PIX',
      description: `Saque ${d.saqueId}`,
      externalReference: d.saqueId,
    });
    return r.status === 'ok' ? { status: 'ok' as const, gatewayRef: r.dados.id } : r;
  }

  interpretarWebhook(w: WebhookArmazenado) {
    const recebido = w.cabecalhos['asaas-access-token'] ?? '';
    const esperado = this.config.webhookToken ?? '';
    const valido =
      esperado.length > 0 &&
      recebido.length === esperado.length &&
      timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
    if (!valido) return { tipo: 'invalido' as const, motivo: 'Token do webhook inválido' };
    const evento = String(w.payload.event ?? '');
    const pagamento = w.payload.payment as { id?: string; installment?: string } | undefined;
    if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(evento) && pagamento?.id) {
      // Parcela de cartão: o pagamento confirma o parcelamento inteiro (idempotente).
      return {
        tipo: 'pagamento_confirmado' as const,
        gatewayCobrancaId: pagamento.installment ?? pagamento.id,
      };
    }
    return { tipo: 'ignorado' as const, motivo: `evento ${evento}` };
  }
}
