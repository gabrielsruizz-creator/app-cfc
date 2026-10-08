import {
  ATOR_SISTEMA,
  aulas,
  comAtor,
  contasFinanceiras,
  contasRecebimento,
  creditosAula,
  criarBancoTeste,
  eq,
  estornos,
  fabricarAluno,
  fabricarAutoescola,
  fabricarInstrutorAprovado,
  notificacoes,
  pacotes,
  pedidos,
  saques,
  semearBase,
  type BancoTeste,
} from '@volante/db';
import {
  abrirDisputa,
  carregarAulaParaAlterar,
  cifrar,
  comprarPacote,
  confirmarPagamento,
  mudarStatusAula,
  saldosConta,
  solicitarAulaComCredito,
  solicitarSaque,
} from '@volante/dominio';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CfcPlusNaoConfigurado } from '../src/adaptadores/cfc-plus-nao-configurado';
import { GatewayNaoConfigurado } from '../src/adaptadores/gateway-nao-configurado';
import { GatewaySimulado } from '../src/adaptadores/gateway-simulado';
import { PushNaoConfigurado } from '../src/adaptadores/push';
import { CONSUMIDORES } from '../src/consumidores';
import { logSilencioso, type Dependencias } from '../src/dependencias';
import { processarTudo } from '../src/outbox';
import type { GatewayPagamentoPort } from '../src/portas/gateway-pagamento';
import {
  acompanharPedidosAutoescola,
  autoConfirmarFimDeAula,
  expirarCreditosVencidos,
} from '../src/rotinas';

/** Gateway que recusa transferências Pix de forma definitiva (ex.: chave inexistente). */
function gatewayRecusaPix(): GatewayPagamentoPort {
  const base = new GatewaySimulado();
  return {
    nome: 'recusa_pix',
    criarCobrancaPix: (d) => base.criarCobrancaPix(d),
    cancelarCobranca: () => base.cancelarCobranca(),
    estornar: (d) => base.estornar(d),
    transferir: (d) => base.transferir(d),
    interpretarWebhook: (w) => base.interpretarWebhook(w),
    pagarPix: async () => ({
      status: 'erro',
      motivo: 'Chave Pix não encontrada',
      reprocessar: false,
    }),
  };
}

let banco: BancoTeste;
let deps: Dependencias;

beforeAll(async () => {
  banco = await criarBancoTeste();
  await semearBase(banco.db);
  const gateways: Record<string, GatewayPagamentoPort> = {
    simulado: new GatewaySimulado(),
    nao_configurado: new GatewayNaoConfigurado(),
    recusa_pix: gatewayRecusaPix(),
  };
  deps = {
    db: banco.db,
    gateways,
    push: new PushNaoConfigurado(),
    cfcPlus: new CfcPlusNaoConfigurado(),
    log: logSilencioso,
  };
});
afterAll(async () => banco?.destruir());

const sistema = <T>(fn: Parameters<typeof comAtor<T>>[2]) => comAtor(banco.db, ATOR_SISTEMA, fn);

const titulos = async (usuarioId: string) =>
  (await banco.db.select().from(notificacoes).where(eq(notificacoes.usuarioId, usuarioId))).map(
    (n) => n.titulo,
  );

async function criarPacote(dono: { instrutorId?: string; autoescolaId?: string }, qtd: number) {
  const [p] = await sistema((tx) =>
    tx
      .insert(pacotes)
      .values({
        vendedorTipo: dono.instrutorId ? 'instrutor' : 'autoescola',
        instrutorId: dono.instrutorId ?? null,
        autoescolaId: dono.autoescolaId ?? null,
        nome: `${qtd} aulas`,
        categorias: ['B'],
        quantidadeAulas: qtd,
        duracaoAulaMin: 50,
        precoCentavos: qtd * 10000,
        publicado: true,
      })
      .returning(),
  );
  return p!;
}

async function comprarEPagar(alunoId: string, pacoteId: string) {
  const r = await comAtor(banco.db, { tipo: 'aluno', alunoId }, (tx) =>
    comprarPacote(tx, {
      alunoId,
      pacoteId,
      gateway: 'simulado',
      chaveIdempotencia: crypto.randomUUID(),
    }),
  );
  await processarTudo(deps, CONSUMIDORES);
  await sistema((tx) => confirmarPagamento(tx, r.cobranca.id));
  await processarTudo(deps, CONSUMIDORES);
  return r;
}

async function saldosInstrutor(instrutorId: string) {
  return sistema(async (tx) => {
    const [c] = await tx
      .select()
      .from(contasFinanceiras)
      .where(eq(contasFinanceiras.instrutorId, instrutorId));
    return c ? saldosConta(tx, c.id) : { retido: 0, disponivel: 0 };
  });
}

describe('fila da autoescola', () => {
  it('avisa a autoescola, lembra depois de X horas e expira com estorno', async () => {
    const { autoescola, dono } = await fabricarAutoescola(banco.db);
    const { aluno, usuario } = await fabricarAluno(banco.db);
    const pacote = await criarPacote({ autoescolaId: autoescola.id }, 10);
    const { pedido } = await comprarEPagar(aluno.id, pacote.id);
    expect(await titulos(dono.id)).toContain('Novo aluno do app! 🎉');
    expect(await titulos(usuario.id)).toContain('Pagamento confirmado');

    // 49h depois do pagamento: lembrete (padrão 48h), ainda dentro do prazo
    const depois = new Date(Date.now() + 49 * 3600_000);
    expect(await acompanharPedidosAutoescola(deps, depois)).toEqual({ lembretes: 1, expirados: 0 });
    expect(await acompanharPedidosAutoescola(deps, depois)).toEqual({ lembretes: 0, expirados: 0 });
    await processarTudo(deps, CONSUMIDORES);
    expect(await titulos(dono.id)).toContain('Aluno aguardando contato');

    // passado o prazo de resposta: expira e devolve o valor
    const [p] = await sistema((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedido.id)));
    const vencido = new Date(p!.prazoRespostaEm!.getTime() + 60_000);
    expect((await acompanharPedidosAutoescola(deps, vencido)).expirados).toBe(1);
    await processarTudo(deps, CONSUMIDORES);
    const [p2] = await sistema((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedido.id)));
    expect(p2!.statusAtendimento).toBe('expirado');
    const [e] = await sistema((tx) =>
      tx.select().from(estornos).where(eq(estornos.pedidoId, pedido.id)),
    );
    expect(e!.status).toBe('concluido');
    expect(await titulos(usuario.id)).toContain('Pedido expirou');
  });
});

describe('créditos e saques', () => {
  it('crédito vencido libera o valor ao instrutor; saque Pix conclui e notifica', async () => {
    const { instrutor, usuario } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const pacote = await criarPacote({ instrutorId: instrutor.id }, 2);
    const { pedido } = await comprarEPagar(aluno.id, pacote.id);
    expect(await titulos(usuario.id)).toContain('Pacote vendido');
    await sistema((tx) =>
      tx
        .update(creditosAula)
        .set({ validoAte: new Date(Date.now() - 60_000) })
        .where(eq(creditosAula.pedidoId, pedido.id)),
    );
    expect(await expirarCreditosVencidos(deps)).toBe(1);
    const [c] = await sistema((tx) =>
      tx.select().from(creditosAula).where(eq(creditosAula.pedidoId, pedido.id)),
    );
    expect(c!.status).toBe('expirado');
    const saldo = await saldosInstrutor(instrutor.id);
    expect(saldo.retido).toBe(0);
    expect(saldo.disponivel).toBeGreaterThan(15000);

    await sistema((tx) =>
      tx.insert(contasRecebimento).values({
        titularTipo: 'instrutor',
        instrutorId: instrutor.id,
        tipoChavePix: 'email',
        chavePixCifrada: cifrar('pix@exemplo.com'),
        chavePixMascarada: 'pi***@exemplo.com',
        titularNome: 'Instrutor',
        titularDocumento: '00000000000',
      }),
    );
    const titular = { tipo: 'instrutor' as const, instrutorId: instrutor.id };
    const ok = await sistema((tx) =>
      solicitarSaque(tx, {
        titular,
        valorCentavos: 5000,
        gateway: 'simulado',
        solicitadoPor: null,
      }),
    );
    const pendente = await sistema((tx) =>
      solicitarSaque(tx, {
        titular,
        valorCentavos: 3000,
        gateway: 'nao_configurado',
        solicitadoPor: null,
      }),
    );
    const recusado = await sistema((tx) =>
      solicitarSaque(tx, {
        titular,
        valorCentavos: 2000,
        gateway: 'recusa_pix',
        solicitadoPor: null,
      }),
    );
    await processarTudo(deps, CONSUMIDORES);
    const status = async (id: string) =>
      (await sistema((tx) => tx.select().from(saques).where(eq(saques.id, id))))[0]!;
    expect((await status(ok.id)).status).toBe('concluido');
    expect((await status(ok.id)).gatewayRef).toBe(`sim_pix_${ok.id}`);
    expect((await status(pendente.id)).status).toBe('pendente_configuracao');
    expect((await status(recusado.id)).status).toBe('falhou');
    // o recusado volta ao saldo; o pendente continua reservado (nunca finge sucesso)
    expect((await saldosInstrutor(instrutor.id)).disponivel).toBe(saldo.disponivel - 5000 - 3000);
    expect(await titulos(usuario.id)).toContain('Saque enviado 💸');
  });
});

describe('disputas', () => {
  it('aula com problema relatado não é auto-confirmada', async () => {
    const { instrutor, usuario: usuarioInstrutor } = await fabricarInstrutorAprovado(banco.db);
    const { aluno, usuario } = await fabricarAluno(banco.db);
    const pacote = await criarPacote({ instrutorId: instrutor.id }, 2);
    const { pedido } = await comprarEPagar(aluno.id, pacote.id);
    const [credito] = await sistema((tx) =>
      tx.select().from(creditosAula).where(eq(creditosAula.pedidoId, pedido.id)),
    );
    const aula = await comAtor(banco.db, { tipo: 'aluno', alunoId: aluno.id }, (tx) =>
      solicitarAulaComCredito(tx, {
        alunoId: aluno.id,
        creditoId: credito!.id,
        instrutorId: instrutor.id,
        inicio: DateTime.now()
          .setZone('America/Sao_Paulo')
          .plus({ days: 5 })
          .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
          .toJSDate(),
        categoria: 'B',
        pontoEncontro: { lat: -23.55, lng: -46.63 },
        pontoEncontroEndereco: 'Rua A',
      }),
    );
    const checkout = new Date(Date.now() - 48 * 3600_000);
    await sistema(async (tx) => {
      let a = await carregarAulaParaAlterar(tx, aula.id);
      a = await mudarStatusAula(tx, a, 'confirmada');
      a = await mudarStatusAula(tx, a, 'em_andamento');
      await mudarStatusAula(tx, a, 'aguardando_confirmacao', { extras: { checkoutEm: checkout } });
      await abrirDisputa(tx, {
        aulaId: aula.id,
        usuarioId: usuario.id,
        papel: 'aluno',
        motivo: 'Aula encurtada',
        descricao: 'Durou metade do tempo.',
      });
    });
    await autoConfirmarFimDeAula(deps);
    const [a] = await sistema((tx) => tx.select().from(aulas).where(eq(aulas.id, aula.id)));
    expect(a!.status).toBe('aguardando_confirmacao');
    await processarTudo(deps, CONSUMIDORES);
    expect(await titulos(usuarioInstrutor.id)).toContain('Problema relatado');
  });
});
