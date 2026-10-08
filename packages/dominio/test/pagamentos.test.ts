import {
  ATOR_SISTEMA,
  aulas,
  cobrancas,
  comAtor,
  contasFinanceiras,
  criarBancoTeste,
  eq,
  estornos,
  fabricarAluno,
  fabricarInstrutorAprovado,
  lancamentos,
  outboxEventos,
  pedidos,
  semearBase,
  sql,
  type Ator,
  type BancoTeste,
} from '@volante/db';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cancelarAula,
  carregarAulaParaAlterar,
  concluirAula,
  confirmarPagamento,
  encerrarComEstornoTotal,
  expirarAulaNaoPaga,
  mudarStatusAula,
  saldosConta,
  solicitarAulaAvulsa,
} from '../src';

let banco: BancoTeste;
beforeAll(async () => {
  banco = await criarBancoTeste();
  await semearBase(banco.db);
});
afterAll(async () => banco?.destruir());

/** Próximo horário cheio daqui a `dias` dias, às 10h de São Paulo. */
function horario(dias: number, hora = 10) {
  return DateTime.now()
    .setZone('America/Sao_Paulo')
    .plus({ days: dias })
    .set({ hour: hora, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
}

async function cenario(dias = 5, hora = 10) {
  const { instrutor } = await fabricarInstrutorAprovado(banco.db, { precoAulaCentavos: 10000 });
  const { aluno } = await fabricarAluno(banco.db);
  const atorAluno: Ator = { tipo: 'aluno', alunoId: aluno.id };
  const r = await comAtor(banco.db, atorAluno, (tx) =>
    solicitarAulaAvulsa(tx, {
      alunoId: aluno.id,
      instrutorId: instrutor.id,
      inicio: horario(dias, hora),
      categoria: 'B',
      pontoEncontro: { lat: -23.55, lng: -46.63 },
      pontoEncontroEndereco: 'Praça da Sé',
      gateway: 'simulado',
      chaveIdempotencia: crypto.randomUUID(),
    }),
  );
  return { instrutor, aluno, atorAluno, ...r };
}

const sistema = <T>(fn: Parameters<typeof comAtor<T>>[2]) => comAtor(banco.db, ATOR_SISTEMA, fn);

async function somaGeralLancamentos() {
  const r = await sistema((tx) =>
    tx.select({ s: sql<string>`coalesce(sum(valor_centavos), 0)` }).from(lancamentos),
  );
  return Number(r[0]!.s);
}

async function saldosInstrutor(instrutorId: string) {
  return sistema(async (tx) => {
    const [conta] = await tx
      .select()
      .from(contasFinanceiras)
      .where(eq(contasFinanceiras.instrutorId, instrutorId));
    return conta ? saldosConta(tx, conta.id) : { retido: 0, disponivel: 0 };
  });
}

describe('fluxo de aula avulsa com Pix', () => {
  it('solicitação segura o horário, cria cobrança e evento para o worker', async () => {
    const { aula, cobranca, pedido } = await cenario();
    expect(aula.status).toBe('aguardando_pagamento');
    expect(cobranca.status).toBe('pendente_envio');
    expect(pedido.comissaoCentavos).toBe(1500); // 15% de R$ 100
    expect(pedido.valorLiquidoVendedorCentavos).toBe(8500);
    const eventos = await sistema((tx) =>
      tx.select().from(outboxEventos).where(eq(outboxEventos.agregadoId, cobranca.id)),
    );
    expect(eventos.map((e) => e.tipo)).toContain('cobranca.solicitada');
  });

  it('não permite reservar um horário já ocupado', async () => {
    const { instrutor, aula } = await cenario(6);
    const { aluno: outro } = await fabricarAluno(banco.db);
    await expect(
      comAtor(banco.db, { tipo: 'aluno', alunoId: outro.id }, (tx) =>
        solicitarAulaAvulsa(tx, {
          alunoId: outro.id,
          instrutorId: instrutor.id,
          inicio: aula.inicio,
          categoria: 'B',
          pontoEncontro: { lat: -23.55, lng: -46.63 },
          pontoEncontroEndereco: 'Rua B',
          gateway: 'simulado',
          chaveIdempotencia: crypto.randomUUID(),
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'horario_indisponivel' });
  });

  it('pagamento retém o valor; conclusão libera ao instrutor descontando a comissão', async () => {
    const { aula, cobranca, instrutor } = await cenario(7);
    await sistema((tx) => confirmarPagamento(tx, cobranca.id));
    // idempotente
    await sistema((tx) => confirmarPagamento(tx, cobranca.id));

    let atual = await sistema((tx) => carregarAulaParaAlterar(tx, aula.id));
    expect(atual.status).toBe('solicitada');
    expect(atual.aceiteAte).not.toBeNull();
    expect(await saldosInstrutor(instrutor.id)).toEqual({ retido: 10000, disponivel: 0 });

    await sistema(async (tx) => {
      let a = await carregarAulaParaAlterar(tx, aula.id);
      a = await mudarStatusAula(tx, a, 'confirmada');
      a = await mudarStatusAula(tx, a, 'em_andamento', { extras: { checkinEm: new Date() } });
      await mudarStatusAula(tx, a, 'aguardando_confirmacao', {
        extras: { checkoutEm: new Date() },
      });
    });
    await sistema((tx) => concluirAula(tx, aula.id, 'aluno'));

    atual = await sistema((tx) => carregarAulaParaAlterar(tx, aula.id));
    expect(atual.status).toBe('concluida');
    expect(await saldosInstrutor(instrutor.id)).toEqual({ retido: 0, disponivel: 8500 });
    expect(await somaGeralLancamentos()).toBe(0);
  });

  it('recusa do instrutor estorna o valor integral', async () => {
    const { aula, cobranca, instrutor, pedido } = await cenario(8);
    await sistema((tx) => confirmarPagamento(tx, cobranca.id));
    await sistema(async (tx) => {
      const a = await carregarAulaParaAlterar(tx, aula.id);
      await encerrarComEstornoTotal(tx, a, 'recusada', { motivo: 'Imprevisto' });
    });
    expect(await saldosInstrutor(instrutor.id)).toEqual({ retido: 0, disponivel: 0 });
    const [e] = await sistema((tx) =>
      tx.select().from(estornos).where(eq(estornos.pedidoId, pedido.id)),
    );
    expect(e!.valorCentavos).toBe(10000);
    const [p] = await sistema((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedido.id)));
    expect(p!.status).toBe('estornado');
    expect(await somaGeralLancamentos()).toBe(0);
  });

  it('cancelamento tardio do aluno cobra multa e devolve o restante', async () => {
    const { aula, cobranca, instrutor, pedido } = await cenario(3, 20);
    await sistema((tx) => confirmarPagamento(tx, cobranca.id));
    await sistema(async (tx) => {
      const a = await carregarAulaParaAlterar(tx, aula.id);
      await mudarStatusAula(tx, a, 'confirmada');
    });
    // Cancelamento 10 h antes; grátis só até 24 h antes → multa de 50%.
    const agora = new Date(aula.inicio.getTime() - 10 * 3600_000);
    await sistema(async (tx) => {
      const a = await carregarAulaParaAlterar(tx, aula.id);
      await cancelarAula(tx, a, { por: 'aluno', motivo: 'Não poderei ir', agora });
    });
    const [e] = await sistema((tx) =>
      tx.select().from(estornos).where(eq(estornos.pedidoId, pedido.id)),
    );
    expect(e!.valorCentavos).toBe(5000);
    // multa de R$ 50 liberada ao instrutor com 15% de comissão
    expect(await saldosInstrutor(instrutor.id)).toEqual({ retido: 0, disponivel: 4250 });
    expect(await somaGeralLancamentos()).toBe(0);
  });

  it('Pix não pago expira e libera o horário; pagamento tardio é estornado', async () => {
    const { aula, cobranca, pedido } = await cenario(9);
    await sistema((tx) => expirarAulaNaoPaga(tx, aula.id));
    const [a] = await sistema((tx) => tx.select().from(aulas).where(eq(aulas.id, aula.id)));
    expect(a!.status).toBe('expirada');

    await sistema((tx) => confirmarPagamento(tx, cobranca.id));
    const [p] = await sistema((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedido.id)));
    expect(p!.status).toBe('estornado');
    const [c] = await sistema((tx) =>
      tx.select().from(cobrancas).where(eq(cobrancas.id, cobranca.id)),
    );
    expect(c!.status).toBe('estornada');
    expect(await somaGeralLancamentos()).toBe(0);
  });
});
