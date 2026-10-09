import type { AulaCfcPlus, EventoCfcPlus } from '@volante/contracts';
import {
  ATOR_SISTEMA,
  aulas,
  comAtor,
  creditosAula,
  criarBancoTeste,
  eq,
  fabricarAluno,
  fabricarAutoescola,
  fabricarInstrutorAprovado,
  integracoesAutoescola,
  operacoesIntegracao,
  outboxEventos,
  pacotes,
  publicarEvento,
  semearBase,
  type BancoTeste,
} from '@volante/db';
import { cifrar, comprarPacote, confirmarPagamento } from '@volante/dominio';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { baseIntegracao, CfcPlusHttp } from '../src/adaptadores/cfc-plus-http';
import { GatewayNaoConfigurado } from '../src/adaptadores/gateway-nao-configurado';
import { GatewaySimulado } from '../src/adaptadores/gateway-simulado';
import { PushNaoConfigurado } from '../src/adaptadores/push';
import { CONSUMIDORES } from '../src/consumidores';
import { logSilencioso, type Dependencias } from '../src/dependencias';
import { processarTudo } from '../src/outbox';
import type { CfcPlusPort, ConexaoCfcPlus, ResultadoCfcPlus } from '../src/portas/cfc-plus';

/** CFC Plus de mentira: guarda o que recebeu e responde o que o teste mandar. */
class CfcPlusFalso implements CfcPlusPort {
  recebidos: { conexao: ConexaoCfcPlus; evento: EventoCfcPlus }[] = [];
  respostaTeste: ResultadoCfcPlus = {
    status: 'sucesso',
    resposta: { cfc: { nome: 'Auto Escola Albatroz' } },
  };
  respostaEnvio: ResultadoCfcPlus = {
    status: 'sucesso',
    resposta: { recebido: true },
    httpStatus: 200,
  };
  async testar() {
    return this.respostaTeste;
  }
  async enviarEvento(conexao: ConexaoCfcPlus, evento: EventoCfcPlus) {
    this.recebidos.push({ conexao, evento });
    return this.respostaEnvio;
  }
  aulas: AulaCfcPlus[] = [];
  async enviarAula(_conexao: ConexaoCfcPlus, aula: AulaCfcPlus) {
    this.aulas.push(aula);
    return this.respostaEnvio;
  }
}

let banco: BancoTeste;
let deps: Dependencias;
let cfc: CfcPlusFalso;

beforeAll(async () => {
  banco = await criarBancoTeste();
  await semearBase(banco.db);
});
afterAll(async () => banco?.destruir());
beforeEach(() => {
  cfc = new CfcPlusFalso();
  deps = {
    db: banco.db,
    gateways: { simulado: new GatewaySimulado(), nao_configurado: new GatewayNaoConfigurado() },
    push: new PushNaoConfigurado(),
    cfcPlus: cfc,
    log: logSilencioso,
  };
});

const sistema = <T>(fn: Parameters<typeof comAtor<T>>[2]) => comAtor(banco.db, ATOR_SISTEMA, fn);
const CONEXAO = {
  url: 'https://cfcplus.teste',
  chave: 'cfcp_abc123_segredo-de-teste-bem-comprido',
};

async function autoescolaConectando() {
  const { autoescola } = await fabricarAutoescola(banco.db);
  await sistema(async (tx) => {
    await tx.insert(integracoesAutoescola).values({
      autoescolaId: autoescola.id,
      sistema: 'cfc_plus',
      status: 'testando',
      url: CONEXAO.url,
      configuracaoCifrada: Buffer.from(cifrar(JSON.stringify(CONEXAO))),
    });
    await publicarEvento(tx, {
      tipo: 'integracao.testar',
      agregadoTipo: 'integracao',
      agregadoId: autoescola.id,
      autoescolaId: autoescola.id,
      payload: { autoescolaId: autoescola.id },
    });
  });
  return autoescola;
}

const integracao = async (autoescolaId: string) =>
  (
    await sistema((tx) =>
      tx
        .select()
        .from(integracoesAutoescola)
        .where(eq(integracoesAutoescola.autoescolaId, autoescolaId)),
    )
  )[0]!;

async function venderPacote(autoescolaId: string) {
  const { aluno } = await fabricarAluno(banco.db);
  const [p] = await sistema((tx) =>
    tx
      .insert(pacotes)
      .values({
        vendedorTipo: 'autoescola',
        autoescolaId,
        nome: 'Primeira habilitação B',
        categorias: ['B'],
        quantidadeAulas: 20,
        duracaoAulaMin: 50,
        precoCentavos: 180000,
        publicado: true,
      })
      .returning(),
  );
  const r = await comAtor(banco.db, { tipo: 'aluno', alunoId: aluno.id }, (tx) =>
    comprarPacote(tx, {
      alunoId: aluno.id,
      pacoteId: p!.id,
      gateway: 'simulado',
      chaveIdempotencia: crypto.randomUUID(),
    }),
  );
  await sistema((tx) => confirmarPagamento(tx, r.cobranca.id));
  return { ...r, aluno };
}

describe('conexão com o CFC Plus', () => {
  it('teste com sucesso marca como conectada e guarda o nome do CFC', async () => {
    const autoescola = await autoescolaConectando();
    await processarTudo(deps, CONSUMIDORES);
    expect(await integracao(autoescola.id)).toMatchObject({
      status: 'conectada',
      nomeNoSistema: 'Auto Escola Albatroz',
      ultimoErro: null,
    });
  });

  it('chave recusada marca como erro com a explicação', async () => {
    cfc.respostaTeste = {
      status: 'erro',
      motivo: 'O CFC Plus recusou a chave.',
      reprocessar: false,
      credencialInvalida: true,
    };
    const autoescola = await autoescolaConectando();
    await processarTudo(deps, CONSUMIDORES);
    expect(await integracao(autoescola.id)).toMatchObject({
      status: 'erro',
      ultimoErro: 'O CFC Plus recusou a chave.',
    });
  });
});

describe('envio das vendas', () => {
  it('pedido pago de autoescola conectada vai ao CFC Plus com aluno e valores', async () => {
    const autoescola = await autoescolaConectando();
    await processarTudo(deps, CONSUMIDORES);
    const { pedido, aluno } = await venderPacote(autoescola.id);
    await processarTudo(deps, CONSUMIDORES);
    const pago = cfc.recebidos.find((r) => r.evento.tipo === 'pedido.pago');
    expect(pago?.conexao).toEqual(CONEXAO);
    expect(pago?.evento).toMatchObject({
      versao: 1,
      pedido: {
        id: pedido.id,
        codigo: pedido.codigo,
        status: 'pago',
        statusAtendimento: 'novo',
        valorPagoCentavos: 180000,
        quantidadeAulas: 20,
        metodoPagamento: 'pix',
      },
      aluno: { id: aluno.id, categoriaDesejada: 'B' },
    });
    expect(pago!.evento.aluno.cpf).toMatch(/^\d{11}$/);
    const ops = await sistema((tx) =>
      tx.select().from(operacoesIntegracao).where(eq(operacoesIntegracao.idInterno, pedido.id)),
    );
    expect(ops.map((o) => o.status)).toContain('sucesso');
  });

  it('falha passageira fica registrada e o evento é reprocessado depois', async () => {
    const autoescola = await autoescolaConectando();
    await processarTudo(deps, CONSUMIDORES);
    cfc.respostaEnvio = {
      status: 'erro',
      motivo: 'HTTP 503 do CFC Plus',
      reprocessar: true,
      httpStatus: 503,
    };
    const { pedido } = await venderPacote(autoescola.id);
    await processarTudo(deps, CONSUMIDORES);
    const [op] = await sistema((tx) =>
      tx.select().from(operacoesIntegracao).where(eq(operacoesIntegracao.idInterno, pedido.id)),
    );
    expect(op).toMatchObject({ status: 'aguardando_reprocessamento', httpStatus: 503 });
    const pendentes = await sistema((tx) =>
      tx.select().from(outboxEventos).where(eq(outboxEventos.agregadoId, pedido.id)),
    );
    expect(pendentes.find((e) => e.tipo === 'pedido.pago')?.status).toBe('falhou');
  });

  it('autoescola sem integração não envia nada; sincronizar reenvia os pedidos pagos', async () => {
    const { autoescola } = await fabricarAutoescola(banco.db);
    await venderPacote(autoescola.id);
    await processarTudo(deps, CONSUMIDORES);
    expect(cfc.recebidos).toHaveLength(0);

    const conectada = await autoescolaConectando();
    await processarTudo(deps, CONSUMIDORES);
    await venderPacote(conectada.id);
    await venderPacote(conectada.id);
    await processarTudo(deps, CONSUMIDORES);
    cfc.recebidos = [];
    await sistema((tx) =>
      publicarEvento(tx, {
        tipo: 'integracao.sincronizar',
        agregadoTipo: 'integracao',
        agregadoId: conectada.id,
        autoescolaId: conectada.id,
        payload: { autoescolaId: conectada.id },
      }),
    );
    await processarTudo(deps, CONSUMIDORES);
    expect(cfc.recebidos.map((r) => r.evento.tipo)).toEqual([
      'pedido.sincronizado',
      'pedido.sincronizado',
    ]);
    expect(cfc.recebidos[0]!.evento.id).toMatch(/^sync:/);
  });
});

/** Aula concluída (47 min reais de 50 agendados) de um pacote da autoescola, já com o evento no outbox. */
async function aulaConcluida(autoescolaId: string) {
  const { pedido, aluno } = await venderPacote(autoescolaId);
  const { instrutor } = await fabricarInstrutorAprovado(banco.db);
  const inicio = new Date(Date.now() - 2 * 3600_000);
  const aula = await sistema(async (tx) => {
    const [credito] = await tx
      .select()
      .from(creditosAula)
      .where(eq(creditosAula.pedidoId, pedido.id));
    const [a] = await tx
      .insert(aulas)
      .values({
        alunoId: aluno.id,
        instrutorId: instrutor.id,
        autoescolaId,
        pedidoId: pedido.id,
        creditoId: credito!.id,
        categoria: 'B',
        inicio,
        fim: new Date(inicio.getTime() + 50 * 60_000),
        valorCentavos: 9000,
        pontoEncontro: { lat: -23.56, lng: -46.65 },
        pontoEncontroEndereco: 'Av. Paulista, 1000',
        status: 'concluida',
        codigoCheckin: '1234',
        checkinEm: new Date(inicio.getTime() + 2 * 60_000),
        checkoutEm: new Date(inicio.getTime() + 49 * 60_000),
        minutosRealizados: 47,
        politicaCancelamento: { gratisAteHoras: 24, multaBp: 5000 },
      })
      .returning();
    await publicarEvento(tx, {
      tipo: 'aula.concluida',
      agregadoTipo: 'aula',
      agregadoId: a!.id,
      autoescolaId,
      payload: { aulaId: a!.id, alunoId: aluno.id, instrutorId: instrutor.id },
    });
    return a!;
  });
  return { aula, pedido, aluno };
}

describe('envio das aulas para a agenda do CFC Plus', () => {
  it('aula concluída vai com horários reais, minutos e instrutor; evolução depois reenvia', async () => {
    const autoescola = await autoescolaConectando();
    await processarTudo(deps, CONSUMIDORES);
    const { aula, pedido, aluno } = await aulaConcluida(autoescola.id);
    await processarTudo(deps, CONSUMIDORES);
    expect(cfc.aulas).toHaveLength(1);
    expect(cfc.aulas[0]).toMatchObject({
      versao: 1,
      tipo: 'aula.concluida',
      aula: {
        id: aula.id,
        pedidoCodigo: pedido.codigo,
        categoria: 'B',
        minutosAgendados: 50,
        minutosRealizados: 47,
        minutosContados: 47,
        veiculo: null,
        pontoEncontro: 'Av. Paulista, 1000',
      },
      aluno: { id: aluno.id },
    });
    expect(cfc.aulas[0]!.aula.instrutor.cpf).toMatch(/^\d{11}$/);
    const [op] = await sistema((tx) =>
      tx.select().from(operacoesIntegracao).where(eq(operacoesIntegracao.idInterno, aula.id)),
    );
    expect(op).toMatchObject({ tipoRegistro: 'aula', status: 'sucesso' });

    await sistema((tx) =>
      publicarEvento(tx, {
        tipo: 'aula.evolucao_registrada',
        agregadoTipo: 'aula',
        agregadoId: aula.id,
        autoescolaId: autoescola.id,
        payload: { aulaId: aula.id, alunoId: aluno.id, instrutorId: aula.instrutorId },
      }),
    );
    await processarTudo(deps, CONSUMIDORES);
    expect(cfc.aulas.map((a) => a.tipo)).toEqual(['aula.concluida', 'aula.atualizada']);
  });

  it('reenviar vendas e aulas inclui as aulas concluídas; autoescola sem integração não envia', async () => {
    const { autoescola: semIntegracao } = await fabricarAutoescola(banco.db);
    await aulaConcluida(semIntegracao.id);
    await processarTudo(deps, CONSUMIDORES);
    expect(cfc.aulas).toHaveLength(0);

    const conectada = await autoescolaConectando();
    await processarTudo(deps, CONSUMIDORES);
    await aulaConcluida(conectada.id);
    await processarTudo(deps, CONSUMIDORES);
    cfc.aulas = [];
    await sistema((tx) =>
      publicarEvento(tx, {
        tipo: 'integracao.sincronizar',
        agregadoTipo: 'integracao',
        agregadoId: conectada.id,
        autoescolaId: conectada.id,
        payload: { autoescolaId: conectada.id },
      }),
    );
    await processarTudo(deps, CONSUMIDORES);
    expect(cfc.aulas).toHaveLength(1);
    expect(cfc.aulas[0]!.id).toMatch(/^sync:/);
  });
});

describe('adaptador HTTP', () => {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  const responder = (status: number, corpo: unknown) =>
    (async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify(corpo), { status });
    }) as typeof fetch;

  it('monta a URL com ou sem /api e envia a chave como Bearer', async () => {
    expect(baseIntegracao('https://x.com/')).toBe('https://x.com/api/integracoes/volante/v1');
    expect(baseIntegracao('https://x.com/api')).toBe('https://x.com/api/integracoes/volante/v1');
    const r = await new CfcPlusHttp(responder(200, { cfc: { nome: 'CFC' } })).testar(CONEXAO);
    expect(r.status).toBe('sucesso');
    const ultima = chamadas.at(-1)!;
    expect(ultima.url).toBe('https://cfcplus.teste/api/integracoes/volante/v1/status');
    expect((ultima.init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${CONEXAO.chave}`,
    );
  });

  it('401 é credencial inválida; 409 (já recebido) conta como sucesso; 500 é passageiro', async () => {
    const evento = {} as EventoCfcPlus;
    expect(await new CfcPlusHttp(responder(401, {})).enviarEvento(CONEXAO, evento)).toMatchObject({
      status: 'erro',
      credencialInvalida: true,
      reprocessar: false,
    });
    expect((await new CfcPlusHttp(responder(409, {})).enviarEvento(CONEXAO, evento)).status).toBe(
      'sucesso',
    );
    expect(
      await new CfcPlusHttp(responder(500, { mensagem: 'falhou' })).enviarEvento(CONEXAO, evento),
    ).toMatchObject({
      status: 'erro',
      reprocessar: true,
      motivo: 'falhou',
    });
    // 404 na rota de aulas = CFC Plus desatualizado: tenta de novo, sem derrubar a conexão
    const desatualizado = await new CfcPlusHttp(responder(404, {})).enviarAula(
      CONEXAO,
      {} as AulaCfcPlus,
    );
    expect(desatualizado).toMatchObject({ status: 'erro', reprocessar: true });
    expect(desatualizado).not.toHaveProperty('credencialInvalida');
    const semRede = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await new CfcPlusHttp(semRede).testar(CONEXAO)).toMatchObject({
      status: 'erro',
      reprocessar: true,
    });
  });
});
