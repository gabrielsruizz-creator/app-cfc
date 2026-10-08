import {
  ATOR_SISTEMA,
  aulaPosicoes,
  cobrancas,
  comAtor,
  criarBancoTeste,
  eq,
  fabricarAluno,
  fabricarInstrutorAprovado,
  pacotes,
  pedidos,
  publicarEvento,
  semearBase,
  webhooksRecebidos,
  type BancoTeste,
} from '@volante/db';
import { comprarPacote } from '@volante/dominio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CfcPlusNaoConfigurado } from '../src/adaptadores/cfc-plus-nao-configurado';
import { GatewayAsaas } from '../src/adaptadores/gateway-asaas';
import { GatewayNaoConfigurado } from '../src/adaptadores/gateway-nao-configurado';
import { GatewaySimulado } from '../src/adaptadores/gateway-simulado';
import { PushNaoConfigurado } from '../src/adaptadores/push';
import { CONSUMIDORES } from '../src/consumidores';
import { logSilencioso, type Dependencias } from '../src/dependencias';
import { processarTudo } from '../src/outbox';
import { expurgarPosicoesAntigas } from '../src/rotinas';

let banco: BancoTeste;
let deps: Dependencias;

beforeAll(async () => {
  banco = await criarBancoTeste();
  await semearBase(banco.db);
  deps = {
    db: banco.db,
    gateways: { simulado: new GatewaySimulado(), nao_configurado: new GatewayNaoConfigurado() },
    push: new PushNaoConfigurado(),
    cfcPlus: new CfcPlusNaoConfigurado(),
    log: logSilencioso,
  };
});
afterAll(async () => banco?.destruir());

const sistema = <T>(fn: Parameters<typeof comAtor<T>>[2]) => comAtor(banco.db, ATOR_SISTEMA, fn);

describe('cartão parcelado (simulado)', () => {
  it('gera a cobrança no cartão e confirma pelo webhook', async () => {
    const { instrutor } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const [p] = await sistema((tx) =>
      tx
        .insert(pacotes)
        .values({
          vendedorTipo: 'instrutor',
          instrutorId: instrutor.id,
          nome: '10 aulas',
          categorias: ['B'],
          quantidadeAulas: 10,
          duracaoAulaMin: 50,
          precoCentavos: 90000,
          parcelasMax: 6,
          publicado: true,
        })
        .returning(),
    );
    const { pedido, cobranca } = await comAtor(
      banco.db,
      { tipo: 'aluno', alunoId: aluno.id },
      (tx) =>
        comprarPacote(tx, {
          alunoId: aluno.id,
          pacoteId: p!.id,
          gateway: 'simulado',
          chaveIdempotencia: crypto.randomUUID(),
          metodo: 'cartao',
          parcelas: 6,
        }),
    );
    await processarTudo(deps, CONSUMIDORES);
    const [c] = await sistema((tx) =>
      tx.select().from(cobrancas).where(eq(cobrancas.id, cobranca.id)),
    );
    expect(c).toMatchObject({
      status: 'aguardando_pagamento',
      metodo: 'cartao',
      parcelas: 6,
      gatewayCobrancaId: `sim_cart_${cobranca.id}`,
      pixCopiaCola: null,
    });
    // o link do cartão fica aberto 24 h (o Pix, 30 min)
    expect(c!.pixExpiraEm!.getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);

    await sistema(async (tx) => {
      const [w] = await tx
        .insert(webhooksRecebidos)
        .values({
          gateway: 'simulado',
          eventoExternoId: `sim_${c!.id}`,
          cabecalhos: {},
          payload: { evento: 'PAGAMENTO_CONFIRMADO', cobrancaGatewayId: c!.gatewayCobrancaId },
        })
        .returning();
      await publicarEvento(tx, {
        tipo: 'pagamento.webhook_recebido',
        agregadoTipo: 'webhook',
        agregadoId: w!.id,
        payload: { webhookId: w!.id, gateway: 'simulado' },
      });
    });
    await processarTudo(deps, CONSUMIDORES);
    const [pago] = await sistema((tx) =>
      tx.select().from(pedidos).where(eq(pedidos.id, pedido.id)),
    );
    expect(pago!.status).toBe('pago');
  });

  it('expurga posições com mais de 30 dias', async () => {
    const r = await expurgarPosicoesAntigas(deps, new Date(Date.now() + 31 * 86400_000));
    expect(r).toBeGreaterThanOrEqual(0);
    const restantes = await sistema((tx) => tx.select().from(aulaPosicoes));
    expect(restantes).toHaveLength(0);
  });
});

describe('adaptador Asaas — cartão', () => {
  const corpos: Record<string, unknown> = {};
  const fetchFalso = (async (url: string, init?: RequestInit) => {
    const chave = `${init?.method} ${url.replace('https://sandbox.test', '')}`;
    corpos[chave] = init?.body ? JSON.parse(String(init.body)) : null;
    const respostas: Record<string, unknown> = {
      'POST /customers': { id: 'cus_1' },
      'POST /payments': {
        id: 'pay_9',
        installment: 'ins_9',
        invoiceUrl: 'https://sandbox.asaas.com/i/abc',
      },
      'POST /installments/ins_9/refund': { id: 'ins_9' },
    };
    return new Response(JSON.stringify(respostas[chave] ?? {}), { status: 200 });
  }) as typeof fetch;
  const g = new GatewayAsaas(
    { url: 'https://sandbox.test', apiKey: 'chave', webhookToken: 'segredo' },
    fetchFalso,
  );
  const dados = {
    cobrancaId: 'c9',
    valorCentavos: 90000,
    parcelas: 6,
    expiraEm: new Date('2026-10-10T12:00:00Z'),
    descricao: 'Pacote',
    pagador: { nome: 'A', cpf: '52998224725', email: 'a@a.com', telefone: '+5511999999999' },
  };

  it('cria o parcelamento e devolve a página de pagamento', async () => {
    const r = await g.criarCobrancaCartao(dados);
    expect(r).toMatchObject({
      status: 'ok',
      gatewayCobrancaId: 'ins_9',
      urlPagamento: 'https://sandbox.asaas.com/i/abc',
    });
    expect(corpos['POST /payments']).toMatchObject({
      billingType: 'CREDIT_CARD',
      installmentCount: 6,
      totalValue: 900,
    });
  });

  it('webhook de parcela confirma o parcelamento; estorno parcial parcelado não é automático', async () => {
    expect(
      g.interpretarWebhook({
        gateway: 'asaas',
        cabecalhos: { 'asaas-access-token': 'segredo' },
        payload: { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_10', installment: 'ins_9' } },
      }),
    ).toEqual({ tipo: 'pagamento_confirmado', gatewayCobrancaId: 'ins_9' });
    const parcial = await g.estornar({
      gatewayCobrancaId: 'ins_9',
      valorCentavos: 1000,
      parcelado: true,
      valorCobrancaCentavos: 90000,
    });
    expect(parcial).toMatchObject({ status: 'erro', reprocessar: false });
    const total = await g.estornar({
      gatewayCobrancaId: 'ins_9',
      valorCentavos: 90000,
      parcelado: true,
      valorCobrancaCentavos: 90000,
    });
    expect(total.status).toBe('ok');
  });
});
