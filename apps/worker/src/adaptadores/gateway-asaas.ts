import { timingSafeEqual } from 'node:crypto';
import type {
  DadosCobrancaPix,
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
 * Adaptador Asaas (Pix). Sem API key configurada, comporta-se como "pendente_configuracao".
 * Webhook: o Asaas envia o token configurado no cabeçalho "asaas-access-token".
 */
export class GatewayAsaas implements GatewayPagamentoPort {
  readonly nome = 'asaas';

  constructor(
    private readonly config: ConfigAsaas,
    private readonly http: Fetch = fetch,
  ) {}

  private async chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<ResultadoExterno<{ dados: T }>> {
    if (!this.config.apiKey) return { status: 'pendente_configuracao', motivo: 'ASAAS_API_KEY não configurada' };
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

  async criarCobrancaPix(d: DadosCobrancaPix) {
    if (!d.pagador.cpf) return { status: 'erro' as const, motivo: 'Pagador sem CPF', reprocessar: false };
    const cliente = await this.chamar<{ id: string }>('POST', '/customers', {
      name: d.pagador.nome,
      cpfCnpj: d.pagador.cpf,
      email: d.pagador.email,
      mobilePhone: d.pagador.telefone.replace(/^\+55/, ''),
      externalReference: d.cobrancaId,
      notificationDisabled: true,
    });
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

  async cancelarCobranca(gatewayCobrancaId: string) {
    const r = await this.chamar('DELETE', `/payments/${gatewayCobrancaId}`);
    return r.status === 'ok' ? { status: 'ok' as const } : r;
  }

  async estornar(d: { gatewayCobrancaId: string; valorCentavos: number }) {
    const r = await this.chamar<{ id: string }>('POST', `/payments/${d.gatewayCobrancaId}/refund`, {
      value: d.valorCentavos / 100,
    });
    return r.status === 'ok' ? { status: 'ok' as const, gatewayEstornoId: `${d.gatewayCobrancaId}:refund` } : r;
  }

  async transferir(d: { valorCentavos: number; destinoId: string | null }) {
    if (!d.destinoId) {
      return { status: 'pendente_configuracao' as const, motivo: 'Recebedor sem conta (subconta Asaas) cadastrada' };
    }
    const r = await this.chamar<{ id: string }>('POST', '/transfers', {
      value: d.valorCentavos / 100,
      walletId: d.destinoId,
    });
    return r.status === 'ok' ? { status: 'ok' as const, gatewayTransferenciaId: r.dados.id } : r;
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
    const pagamento = w.payload.payment as { id?: string } | undefined;
    if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(evento) && pagamento?.id) {
      return { tipo: 'pagamento_confirmado' as const, gatewayCobrancaId: pagamento.id };
    }
    return { tipo: 'ignorado' as const, motivo: `evento ${evento}` };
  }
}
