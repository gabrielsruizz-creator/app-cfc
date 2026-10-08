import {
  ATOR_SISTEMA,
  aulas,
  cobrancas,
  comAtor,
  contasFinanceiras,
  creditosAula,
  criarBancoTeste,
  cupomUsos,
  cupons,
  eq,
  fabricarAluno,
  fabricarAutoescola,
  fabricarInstrutorAprovado,
  lancamentos,
  pacotes,
  pedidos,
  semearBase,
  sql,
  type BancoTeste,
} from '@volante/db';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acompanharPorToken,
  calcularDesconto,
  cancelarPedidoNaoPago,
  carregarAulaParaAlterar,
  comprarPacote,
  concluirAula,
  confirmarPagamento,
  criarCompartilhamento,
  expurgarPosicoes,
  iniciarACaminho,
  mudarStatusAula,
  rastreamentoDaAula,
  registrarPosicao,
  revogarCompartilhamento,
  saldosConta,
  solicitarAulaAvulsa,
} from '../src';

let banco: BancoTeste;
beforeAll(async () => {
  banco = await criarBancoTeste();
  await semearBase(banco.db);
});
afterAll(async () => banco?.destruir());

const sistema = <T>(fn: Parameters<typeof comAtor<T>>[2]) => comAtor(banco.db, ATOR_SISTEMA, fn);

const horario = (dias: number, hora = 10) =>
  DateTime.now()
    .setZone('America/Sao_Paulo')
    .plus({ days: dias })
    .set({ hour: hora, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();

let seq = 0;
async function criarCupom(dados: Partial<typeof cupons.$inferInsert> = {}) {
  seq++;
  const [c] = await sistema((tx) =>
    tx
      .insert(cupons)
      .values({
        codigo: `TESTE${seq}${Date.now().toString().slice(-5)}`,
        tipo: 'percentual',
        valor: 2000,
        bancadoPor: 'plataforma',
        ...dados,
      })
      .returning(),
  );
  return c!;
}

const somaGeral = async () =>
  Number(
    (
      await sistema((tx) =>
        tx.select({ s: sql<string>`coalesce(sum(valor_centavos),0)` }).from(lancamentos),
      )
    )[0]!.s,
  );

async function saldos(dono: { instrutorId?: string; autoescolaId?: string } | 'plataforma') {
  return sistema(async (tx) => {
    const [c] = await tx
      .select()
      .from(contasFinanceiras)
      .where(
        dono === 'plataforma'
          ? eq(contasFinanceiras.titularTipo, 'plataforma')
          : dono.instrutorId
            ? eq(contasFinanceiras.instrutorId, dono.instrutorId)
            : eq(contasFinanceiras.autoescolaId, dono.autoescolaId!),
      );
    return c ? saldosConta(tx, c.id) : { retido: 0, disponivel: 0 };
  });
}

function aulaAvulsa(alunoId: string, instrutorId: string, dias: number, cupom?: string) {
  return comAtor(banco.db, { tipo: 'aluno', alunoId }, (tx) =>
    solicitarAulaAvulsa(tx, {
      alunoId,
      instrutorId,
      inicio: horario(dias),
      categoria: 'B',
      pontoEncontro: { lat: -23.55, lng: -46.63 },
      pontoEncontroEndereco: 'Rua A',
      gateway: 'simulado',
      chaveIdempotencia: crypto.randomUUID(),
      cupom,
    }),
  );
}

async function darAula(aulaId: string) {
  await sistema(async (tx) => {
    let a = await carregarAulaParaAlterar(tx, aulaId);
    a = await mudarStatusAula(tx, a, 'confirmada');
    a = await mudarStatusAula(tx, a, 'em_andamento');
    a = await mudarStatusAula(tx, a, 'aguardando_confirmacao', {
      extras: { checkoutEm: new Date() },
    });
    await concluirAula(tx, a.id, 'aluno');
  });
}

describe('cupons', () => {
  it('calcula o desconto respeitando teto e valor mínimo da cobrança', () => {
    expect(
      calcularDesconto({ tipo: 'percentual', valor: 1000, descontoMaximoCentavos: null }, 10000),
    ).toBe(1000);
    expect(
      calcularDesconto({ tipo: 'percentual', valor: 5000, descontoMaximoCentavos: 2000 }, 10000),
    ).toBe(2000);
    expect(
      calcularDesconto({ tipo: 'valor_fixo', valor: 9900, descontoMaximoCentavos: null }, 10000),
    ).toBe(9500);
  });

  it('bancado pela plataforma: aluno paga menos e o instrutor recebe o mesmo líquido', async () => {
    const { instrutor } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const c = await criarCupom({ valor: 2000 }); // 20%
    const r = await aulaAvulsa(aluno.id, instrutor.id, 5, c.codigo.toLowerCase());
    expect(r.pedido).toMatchObject({
      valorBrutoCentavos: 10000,
      descontoCentavos: 2000,
      valorTotalCentavos: 8000,
      comissaoCentavos: -500, // 15% de R$ 100 = R$ 15, menos R$ 20 de desconto
      valorLiquidoVendedorCentavos: 8500,
      cupomId: c.id,
    });
    expect(r.cobranca.valorCentavos).toBe(8000);
    const antesPlataforma = (await saldos('plataforma')).disponivel;
    await sistema((tx) => confirmarPagamento(tx, r.cobranca.id));
    const [uso] = await sistema((tx) =>
      tx.select().from(cupomUsos).where(eq(cupomUsos.pedidoId, r.pedido.id)),
    );
    expect(uso!.status).toBe('confirmado');
    await darAula(r.aula.id);
    expect(await saldos({ instrutorId: instrutor.id })).toEqual({ retido: 0, disponivel: 8500 });
    expect((await saldos('plataforma')).disponivel - antesPlataforma).toBe(-500);
    expect(await somaGeral()).toBe(0);
  });

  it('bancado pela autoescola: comissão sobre o valor com desconto', async () => {
    const { autoescola } = await fabricarAutoescola(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const [p] = await sistema((tx) =>
      tx
        .insert(pacotes)
        .values({
          vendedorTipo: 'autoescola',
          autoescolaId: autoescola.id,
          nome: '10 aulas',
          categorias: ['B'],
          quantidadeAulas: 10,
          duracaoAulaMin: 50,
          precoCentavos: 100000,
          parcelasMax: 6,
          publicado: true,
        })
        .returning(),
    );
    const c = await criarCupom({
      tipo: 'valor_fixo',
      valor: 10000,
      bancadoPor: 'vendedor',
      autoescolaId: autoescola.id,
      produtoTipo: 'pacote',
    });
    const r = await comAtor(banco.db, { tipo: 'aluno', alunoId: aluno.id }, (tx) =>
      comprarPacote(tx, {
        alunoId: aluno.id,
        pacoteId: p!.id,
        gateway: 'simulado',
        chaveIdempotencia: crypto.randomUUID(),
        cupom: c.codigo,
        metodo: 'cartao',
        parcelas: 6,
      }),
    );
    expect(r.pedido).toMatchObject({
      valorTotalCentavos: 90000,
      comissaoCentavos: 9000,
      valorLiquidoVendedorCentavos: 81000,
    });
    expect(r.cobranca).toMatchObject({ metodo: 'cartao', parcelas: 6, valorCentavos: 90000 });

    // o mesmo cupom não vale para outra autoescola
    const { autoescola: outra } = await fabricarAutoescola(banco.db);
    const [p2] = await sistema((tx) =>
      tx
        .insert(pacotes)
        .values({
          vendedorTipo: 'autoescola',
          autoescolaId: outra.id,
          nome: '5 aulas',
          categorias: ['B'],
          quantidadeAulas: 5,
          duracaoAulaMin: 50,
          precoCentavos: 50000,
          publicado: true,
        })
        .returning(),
    );
    const { aluno: aluno2 } = await fabricarAluno(banco.db);
    await expect(
      comAtor(banco.db, { tipo: 'aluno', alunoId: aluno2.id }, (tx) =>
        comprarPacote(tx, {
          alunoId: aluno2.id,
          pacoteId: p2!.id,
          gateway: 'simulado',
          chaveIdempotencia: crypto.randomUUID(),
          cupom: c.codigo,
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'cupom_nao_aplicavel' });
    // parcelamento acima do permitido
    await expect(
      comAtor(banco.db, { tipo: 'aluno', alunoId: aluno2.id }, (tx) =>
        comprarPacote(tx, {
          alunoId: aluno2.id,
          pacoteId: p2!.id,
          gateway: 'simulado',
          chaveIdempotencia: crypto.randomUUID(),
          metodo: 'cartao',
          parcelas: 3,
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'parcelas_invalidas' });
  });

  it('limites: por aluno, total, primeira compra e validade; pedido não pago libera o cupom', async () => {
    const { instrutor } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const c = await criarCupom({ limitePorAluno: 1, limiteTotal: 2 });

    const r1 = await aulaAvulsa(aluno.id, instrutor.id, 5, c.codigo);
    await expect(aulaAvulsa(aluno.id, instrutor.id, 6, c.codigo)).rejects.toMatchObject({
      codigo: 'cupom_ja_usado',
    });
    // desistiu antes de pagar: o cupom volta a valer
    await sistema(async (tx) => {
      const [aula] = await tx.select().from(aulas).where(eq(aulas.id, r1.aula.id));
      const { expirarAulaNaoPaga } = await import('../src');
      await expirarAulaNaoPaga(tx, aula!.id);
    });
    const r2 = await aulaAvulsa(aluno.id, instrutor.id, 6, c.codigo);
    await sistema((tx) => confirmarPagamento(tx, r2.cobranca.id));

    const { aluno: outro } = await fabricarAluno(banco.db);
    await aulaAvulsa(outro.id, instrutor.id, 7, c.codigo); // 2º uso (reservado)
    const { aluno: terceiro } = await fabricarAluno(banco.db);
    await expect(aulaAvulsa(terceiro.id, instrutor.id, 8, c.codigo)).rejects.toMatchObject({
      codigo: 'cupom_esgotado',
    });

    const primeira = await criarCupom({ apenasPrimeiraCompra: true });
    await expect(aulaAvulsa(aluno.id, instrutor.id, 9, primeira.codigo)).rejects.toMatchObject({
      codigo: 'cupom_primeira_compra',
    });
    const vencido = await criarCupom({ fimEm: new Date(Date.now() - 1000) });
    await expect(aulaAvulsa(terceiro.id, instrutor.id, 9, vencido.codigo)).rejects.toMatchObject({
      codigo: 'cupom_fora_do_prazo',
    });
    await expect(aulaAvulsa(terceiro.id, instrutor.id, 9, 'NAOEXISTE')).rejects.toMatchObject({
      codigo: 'cupom_invalido',
    });
  });

  it('pacote não pago cancelado devolve o cupom', async () => {
    const { instrutor } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const [p] = await sistema((tx) =>
      tx
        .insert(pacotes)
        .values({
          vendedorTipo: 'instrutor',
          instrutorId: instrutor.id,
          nome: '3 aulas',
          categorias: ['B'],
          quantidadeAulas: 3,
          duracaoAulaMin: 50,
          precoCentavos: 27000,
          publicado: true,
        })
        .returning(),
    );
    const c = await criarCupom({ produtoTipo: 'pacote' });
    const comprar = () =>
      comAtor(banco.db, { tipo: 'aluno', alunoId: aluno.id }, (tx) =>
        comprarPacote(tx, {
          alunoId: aluno.id,
          pacoteId: p!.id,
          gateway: 'simulado',
          chaveIdempotencia: crypto.randomUUID(),
          cupom: c.codigo,
        }),
      );
    const r = await comprar();
    await sistema((tx) => cancelarPedidoNaoPago(tx, r.pedido.id, 'Desistiu'));
    const r2 = await comprar();
    expect(r2.pedido.descontoCentavos).toBe(5400);
    const [credito] = await sistema((tx) =>
      tx.select().from(creditosAula).where(eq(creditosAula.pedidoId, r2.pedido.id)),
    );
    expect(credito).toBeDefined();
  });
});

describe('rastreamento', () => {
  async function aulaConfirmada(diasOuInicio: Date) {
    const { instrutor, usuario } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const r = await aulaAvulsa(aluno.id, instrutor.id, 4);
    await sistema(async (tx) => {
      await confirmarPagamento(tx, r.cobranca.id);
      const a = await carregarAulaParaAlterar(tx, r.aula.id);
      await mudarStatusAula(tx, a, 'confirmada');
      await tx
        .update(aulas)
        .set({ inicio: diasOuInicio, fim: new Date(diasOuInicio.getTime() + 50 * 60_000) })
        .where(eq(aulas.id, r.aula.id));
    });
    return { ...r, instrutor, usuario, aluno };
  }

  it('a caminho só perto do horário; posições com intervalo mínimo; estimativa de chegada', async () => {
    const longe = await aulaConfirmada(new Date(Date.now() + 5 * 3600_000));
    await expect(
      sistema((tx) =>
        iniciarACaminho(tx, {
          aulaId: longe.aula.id,
          instrutorId: longe.instrutor.id,
          usuarioId: longe.usuario.id,
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'cedo_demais' });

    const { aula, instrutor, usuario } = await aulaConfirmada(new Date(Date.now() + 30 * 60_000));
    await expect(
      sistema((tx) =>
        registrarPosicao(tx, {
          aulaId: aula.id,
          instrutorId: instrutor.id,
          posicao: { lat: -23.56, lng: -46.64 },
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'status_invalido' });

    const agora = new Date();
    await sistema((tx) =>
      iniciarACaminho(tx, {
        aulaId: aula.id,
        instrutorId: instrutor.id,
        usuarioId: usuario.id,
        posicao: { lat: -23.6, lng: -46.63 },
        agora,
      }),
    );
    // menos de 5 s depois: ignorada
    const ignorada = await sistema((tx) =>
      registrarPosicao(tx, {
        aulaId: aula.id,
        instrutorId: instrutor.id,
        posicao: { lat: -23.58, lng: -46.63 },
        agora: new Date(agora.getTime() + 2000),
      }),
    );
    expect(ignorada.registrada).toBe(false);
    await sistema((tx) =>
      registrarPosicao(tx, {
        aulaId: aula.id,
        instrutorId: instrutor.id,
        posicao: { lat: -23.56, lng: -46.63 },
        agora: new Date(agora.getTime() + 10_000),
      }),
    );
    const r = await sistema((tx) => rastreamentoDaAula(tx, aula.id));
    expect(r.status).toBe('a_caminho');
    expect(r.posicao).toMatchObject({ lat: -23.56, lng: -46.63 });
    expect(r.distanciaMetros).toBeGreaterThan(900);
    expect(r.distanciaMetros).toBeLessThan(1300);
    expect(r.chegadaEstimadaMin).toBe(3);

    // outro instrutor não envia posição desta aula
    const { instrutor: outro } = await fabricarInstrutorAprovado(banco.db);
    await expect(
      sistema((tx) =>
        registrarPosicao(tx, {
          aulaId: aula.id,
          instrutorId: outro.id,
          posicao: { lat: 0, lng: 0 },
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'aula_nao_encontrado' });

    expect(await sistema((tx) => expurgarPosicoes(tx, new Date(Date.now() + 60_000)))).toBe(2);
  });

  it('link do contato de confiança: funciona, mostra o mínimo e pode ser revogado', async () => {
    const { aula, aluno } = await aulaConfirmada(new Date(Date.now() + 30 * 60_000));
    const { compartilhamento, token } = await sistema((tx) =>
      criarCompartilhamento(tx, { aulaId: aula.id, alunoId: aluno.id, contatoNome: 'Mãe' }),
    );
    const visto = await sistema((tx) => acompanharPorToken(tx, token));
    expect(visto).not.toBeNull();
    expect(visto!.status).toBe('confirmada');
    expect(visto).not.toHaveProperty('aulaId');
    expect(await sistema((tx) => acompanharPorToken(tx, `${token}x`))).toBeNull();
    await sistema((tx) =>
      revogarCompartilhamento(tx, { compartilhamentoId: compartilhamento.id, alunoId: aluno.id }),
    );
    expect(await sistema((tx) => acompanharPorToken(tx, token))).toBeNull();
    const [p] = await sistema((tx) =>
      tx.select().from(pedidos).where(eq(pedidos.id, aula.pedidoId)),
    );
    expect(p).toBeDefined();
    const [c] = await sistema((tx) =>
      tx.select().from(cobrancas).where(eq(cobrancas.pedidoId, aula.pedidoId)),
    );
    expect(c!.metodo).toBe('pix');
  });
});
