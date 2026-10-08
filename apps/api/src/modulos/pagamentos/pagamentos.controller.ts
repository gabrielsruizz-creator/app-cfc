import { Body, Controller, ForbiddenException, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { cobrancas, eq, publicarEvento, webhooksRecebidos } from '@volante/db';
import { ErroDominio, naoEncontrado } from '@volante/dominio';
import { createHash } from 'node:crypto';
import { CONFIG, type Config } from '../../config';
import { atorAluno, Publico, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';

const GATEWAYS_WEBHOOK = ['asaas', 'pagarme', 'mercadopago', 'simulado'];

@Controller()
export class PagamentosController {
  constructor(
    private readonly banco: BancoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /**
   * Recebe notificações do gateway. A API apenas grava (de forma idempotente) e publica um evento;
   * a validação da autenticidade e a interpretação ficam no adaptador do gateway, no worker.
   */
  @Publico()
  @HttpCode(200)
  @Post('webhooks/pagamentos/:gateway')
  async webhook(
    @Param('gateway') gateway: string,
    @Body() corpo: Record<string, unknown>,
    @Headers() cabecalhos: Record<string, string>,
  ) {
    if (!GATEWAYS_WEBHOOK.includes(gateway)) throw naoEncontrado('gateway');
    await this.registrarWebhook(gateway, corpo, cabecalhos);
    return { recebido: true };
  }

  private async registrarWebhook(gateway: string, corpo: Record<string, unknown>, cabecalhos: Record<string, string>) {
    const idExterno =
      typeof corpo.id === 'string' ? corpo.id : createHash('sha256').update(JSON.stringify(corpo)).digest('hex');
    const relevantes = Object.fromEntries(
      Object.entries(cabecalhos).filter(([k]) => /token|signature|assinatura|x-/i.test(k)),
    );
    await this.banco.comAtor({ tipo: 'sistema' }, async (tx) => {
      const [w] = await tx
        .insert(webhooksRecebidos)
        .values({ gateway, eventoExternoId: idExterno, tipo: String(corpo.event ?? corpo.evento ?? ''), cabecalhos: relevantes, payload: corpo })
        .onConflictDoNothing()
        .returning({ id: webhooksRecebidos.id });
      if (w) {
        await publicarEvento(tx, {
          tipo: 'pagamento.webhook_recebido',
          agregadoTipo: 'webhook',
          agregadoId: w.id,
          payload: { webhookId: w.id, gateway },
        });
      }
    });
  }

  /**
   * SOMENTE AMBIENTE DE TESTE: simula o aviso de "Pix pago" do gateway simulado.
   * Percorre o mesmo caminho de um webhook real (gravação → worker → confirmação).
   */
  @HttpCode(202)
  @Post('dev/cobrancas/:id/simular-pagamento')
  async simularPagamento(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    if (this.config.PAGAMENTO_GATEWAY !== 'simulado' || this.config.NODE_ENV === 'production') {
      throw new ForbiddenException({ codigo: 'indisponivel', mensagem: 'Simulação disponível apenas em ambiente de teste' });
    }
    const [c] = await this.banco.comAtor(atorAluno(s), (tx) => tx.select().from(cobrancas).where(eq(cobrancas.id, id)));
    if (!c) throw naoEncontrado('cobranca');
    if (c.gateway !== 'simulado' || !c.gatewayCobrancaId) {
      throw new ErroDominio('cobranca_nao_pronta', 'A cobrança ainda está sendo gerada. Tente em alguns segundos.', 'conflito');
    }
    await this.registrarWebhook(
      'simulado',
      { id: `sim_${c.id}`, evento: 'PAGAMENTO_CONFIRMADO', cobrancaGatewayId: c.gatewayCobrancaId, valorCentavos: c.valorCentavos },
      {},
    );
    return { simulado: true };
  }
}
