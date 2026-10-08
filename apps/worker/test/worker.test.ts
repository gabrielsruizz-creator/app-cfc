import {
  ATOR_SISTEMA,
  aulas,
  cobrancas,
  comAtor,
  criarBancoTeste,
  eq,
  estornos,
  fabricarAluno,
  fabricarArquivo,
  fabricarInstrutorAprovado,
  instrutorDocumentos,
  instrutores,
  notificacoes,
  outboxEventos,
  publicarEvento,
  semearBase,
  webhooksRecebidos,
  type BancoTeste,
} from '@volante/db';
import { solicitarAulaAvulsa } from '@volante/dominio';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CfcPlusNaoConfigurado } from '../src/adaptadores/cfc-plus-nao-configurado';
import { GatewayAsaas } from '../src/adaptadores/gateway-asaas';
import { GatewayNaoConfigurado } from '../src/adaptadores/gateway-nao-configurado';
import { GatewaySimulado } from '../src/adaptadores/gateway-simulado';
import { PushNaoConfigurado } from '../src/adaptadores/push';
import { CONSUMIDORES } from '../src/consumidores';
import { logSilencioso, type Dependencias } from '../src/dependencias';
import { processarTudo, type Consumidor } from '../src/outbox';
import { expirarSolicitacoesSemResposta, verificarDocumentos } from '../src/rotinas';

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

async function agendar(gateway: 'simulado' | 'nao_configurado', dias = 5) {
  const { instrutor, usuario: usuarioInstrutor } = await fabricarInstrutorAprovado(banco.db);
  const { aluno, usuario: usuarioAluno } = await fabricarAluno(banco.db);
  const inicio = DateTime.now().setZone('America/Sao_Paulo').plus({ days: dias }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  const r = await comAtor(banco.db, { tipo: 'aluno', alunoId: aluno.id }, (tx) =>
    solicitarAulaAvulsa(tx, {
      alunoId: aluno.id,
      instrutorId: instrutor.id,
      inicio,
      categoria: 'B',
      pontoEncontro: { lat: -23.55, lng: -46.63 },
      pontoEncontroEndereco: 'Rua X',
      gateway,
      chaveIdempotencia: crypto.randomUUID(),
    }),
  );
  return { ...r, instrutor, aluno, usuarioAluno, usuarioInstrutor };
}

describe('outbox + gateway simulado', () => {
  it('gera o Pix, confirma pelo webhook e notifica as duas partes', async () => {
    const { cobranca, aula, usuarioInstrutor, usuarioAluno } = await agendar('simulado');
    await processarTudo(deps, CONSUMIDORES);

    const [c] = await sistema((tx) => tx.select().from(cobrancas).where(eq(cobrancas.id, cobranca.id)));
    expect(c!.status).toBe('aguardando_pagamento');
    expect(c!.pixCopiaCola).toContain('SIMULADO');

    // o que a rota /dev/cobrancas/:id/simular-pagamento grava:
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

    const [a] = await sistema((tx) => tx.select().from(aulas).where(eq(aulas.id, aula.id)));
    expect(a!.status).toBe('solicitada');
    const avisoInstrutor = await banco.db.select().from(notificacoes).where(eq(notificacoes.usuarioId, usuarioInstrutor.id));
    expect(avisoInstrutor.map((n) => n.titulo)).toContain('Nova solicitação de aula');
    const avisoAluno = await banco.db.select().from(notificacoes).where(eq(notificacoes.usuarioId, usuarioAluno.id));
    expect(avisoAluno.map((n) => n.titulo)).toContain('Pagamento confirmado');
  });

  it('sem gateway configurado a cobrança fica pendente — nunca finge pagamento', async () => {
    const { cobranca, aula } = await agendar('nao_configurado', 6);
    await processarTudo(deps, CONSUMIDORES);
    const [c] = await sistema((tx) => tx.select().from(cobrancas).where(eq(cobrancas.id, cobranca.id)));
    expect(c!.status).toBe('pendente_configuracao');
    expect(c!.pixCopiaCola).toBeNull();
    const [a] = await sistema((tx) => tx.select().from(aulas).where(eq(aulas.id, aula.id)));
    expect(a!.status).toBe('aguardando_pagamento');
  });

  it('falha de um consumidor agenda nova tentativa com espera', async () => {
    const quebrado: Consumidor = {
      nome: 'teste.quebrado',
      eventos: ['usuario.cadastrado'],
      executar: async () => {
        throw new Error('fora do ar');
      },
    };
    const id = await sistema((tx) =>
      publicarEvento(tx, {
        tipo: 'usuario.cadastrado',
        agregadoTipo: 'usuario',
        agregadoId: '01a11bee-0000-7000-8000-000000000001',
        payload: { usuarioId: '01a11bee-0000-7000-8000-000000000001' },
      }),
    );
    await processarTudo(deps, [quebrado]);
    const [e] = await banco.db.select().from(outboxEventos).where(eq(outboxEventos.id, id));
    expect(e!.status).toBe('falhou');
    expect(e!.ultimoErro).toBe('fora do ar');
    expect(e!.proximaTentativaEm.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('rotinas', () => {
  it('solicitação sem resposta no prazo expira e estorna', async () => {
    const { cobranca, aula, pedido } = await agendar('simulado', 7);
    await processarTudo(deps, CONSUMIDORES);
    const { confirmarPagamento } = await import('@volante/dominio');
    await sistema((tx) => confirmarPagamento(tx, cobranca.id));
    await sistema((tx) => tx.update(aulas).set({ aceiteAte: new Date(Date.now() - 60_000) }).where(eq(aulas.id, aula.id)));

    expect(await expirarSolicitacoesSemResposta(deps)).toBeGreaterThanOrEqual(1);
    const [a] = await sistema((tx) => tx.select().from(aulas).where(eq(aulas.id, aula.id)));
    expect(a!.status).toBe('expirada');
    await processarTudo(deps, CONSUMIDORES);
    const [e] = await sistema((tx) => tx.select().from(estornos).where(eq(estornos.pedidoId, pedido.id)));
    expect(e!.status).toBe('concluido');
  });

  it('avisa documento vencendo e suspende instrutor com documento vencido', async () => {
    const { instrutor, usuario } = await fabricarInstrutorAprovado(banco.db);
    const arq = await fabricarArquivo(banco.db, usuario.id, 'documento');
    const hoje = new Date();
    const em = (d: number) => new Date(hoje.getTime() + d * 86400_000).toISOString().slice(0, 10);
    await banco.db.insert(instrutorDocumentos).values([
      { instrutorId: instrutor.id, tipo: 'cnh', arquivoId: arq.id, validade: em(10), status: 'aprovado' },
      { instrutorId: instrutor.id, tipo: 'credencial_detran', arquivoId: arq.id, validade: em(-1), status: 'aprovado' },
    ]);
    await verificarDocumentos(deps);
    const [i] = await banco.db.select().from(instrutores).where(eq(instrutores.id, instrutor.id));
    expect(i!.status).toBe('suspenso_documento');
    expect(i!.disponivel).toBe(false);
    const docs = await banco.db.select().from(instrutorDocumentos).where(eq(instrutorDocumentos.instrutorId, instrutor.id));
    expect(docs.find((d) => d.tipo === 'cnh')!.alertasEnviados).toEqual(expect.arrayContaining([15, 30]));
    // rodar de novo não duplica o alerta
    const antes = await banco.db.select().from(outboxEventos).where(eq(outboxEventos.agregadoId, instrutor.id));
    await verificarDocumentos(deps);
    const depois = await banco.db.select().from(outboxEventos).where(eq(outboxEventos.agregadoId, instrutor.id));
    expect(depois.length).toBe(antes.length);
  });
});

describe('adaptador Asaas', () => {
  const respostas: Record<string, unknown> = {
    'POST /customers': { id: 'cus_1' },
    'POST /payments': { id: 'pay_1' },
    'GET /payments/pay_1/pixQrCode': { encodedImage: 'QkFTRTY0', payload: '00020126PIXREAL', expirationDate: '2026-10-10' },
  };
  const chamadas: string[] = [];
  const fetchFalso = (async (url: string, init?: RequestInit) => {
    const chave = `${init?.method} ${url.replace('https://sandbox.test', '')}`;
    chamadas.push(chave);
    return new Response(JSON.stringify(respostas[chave] ?? {}), { status: 200 });
  }) as typeof fetch;

  it('sem API key fica pendente de configuração', async () => {
    const g = new GatewayAsaas({ url: 'https://sandbox.test' }, fetchFalso);
    const r = await g.criarCobrancaPix({
      cobrancaId: 'c1',
      valorCentavos: 1000,
      expiraEm: new Date(),
      descricao: 'Aula',
      pagador: { nome: 'A', cpf: '52998224725', email: 'a@a.com', telefone: '+5511999999999' },
    });
    expect(r.status).toBe('pendente_configuracao');
  });

  it('cria cliente, cobrança Pix e busca o QR Code', async () => {
    const g = new GatewayAsaas({ url: 'https://sandbox.test', apiKey: 'chave' }, fetchFalso);
    const r = await g.criarCobrancaPix({
      cobrancaId: 'c1',
      valorCentavos: 9000,
      expiraEm: new Date('2026-10-10T12:00:00Z'),
      descricao: 'Aula',
      pagador: { nome: 'A', cpf: '52998224725', email: 'a@a.com', telefone: '+5511999999999' },
    });
    expect(r).toMatchObject({ status: 'ok', gatewayCobrancaId: 'pay_1', pixCopiaCola: '00020126PIXREAL' });
    expect(chamadas).toEqual(['POST /customers', 'POST /payments', 'GET /payments/pay_1/pixQrCode']);
  });

  it('só aceita webhook com o token configurado', () => {
    const g = new GatewayAsaas({ url: 'x', apiKey: 'k', webhookToken: 'segredo-webhook' });
    const payload = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } };
    expect(g.interpretarWebhook({ gateway: 'asaas', cabecalhos: {}, payload }).tipo).toBe('invalido');
    expect(
      g.interpretarWebhook({ gateway: 'asaas', cabecalhos: { 'asaas-access-token': 'segredo-webhook' }, payload }),
    ).toEqual({ tipo: 'pagamento_confirmado', gatewayCobrancaId: 'pay_1' });
  });
});
