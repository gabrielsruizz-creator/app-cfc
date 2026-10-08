import {
  ATOR_SISTEMA,
  autoescolas,
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
  instrutorVinculos,
  lancamentos,
  matriculas,
  pacotes,
  pedidos,
  semearBase,
  sql,
  type BancoTeste,
} from '@volante/db';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirDisputa,
  carregarAulaParaAlterar,
  comprarPacote,
  concluirAula,
  confirmarPagamento,
  confirmarPedidoAutoescola,
  decidirDisputa,
  expirarPedidoAutoescola,
  mudarStatusAula,
  recusarPedidoAutoescola,
  reverterSaque,
  saldosConta,
  solicitarAulaAvulsa,
  solicitarAulaComCredito,
  solicitarSaque,
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

async function criarPacote(
  dono: { instrutorId?: string; autoescolaId?: string },
  qtd = 2,
  preco = 20000,
) {
  const [p] = await sistema((tx) =>
    tx
      .insert(pacotes)
      .values({
        vendedorTipo: dono.instrutorId ? 'instrutor' : 'autoescola',
        instrutorId: dono.instrutorId ?? null,
        autoescolaId: dono.autoescolaId ?? null,
        nome: `${qtd} aulas categoria B`,
        categorias: ['B'],
        quantidadeAulas: qtd,
        duracaoAulaMin: 50,
        precoCentavos: preco,
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
  await sistema((tx) => confirmarPagamento(tx, r.cobranca.id));
  return r;
}

const credito = async (pedidoId: string) =>
  (
    await sistema((tx) => tx.select().from(creditosAula).where(eq(creditosAula.pedidoId, pedidoId)))
  )[0]!;

async function saldos(dono: { instrutorId?: string; autoescolaId?: string }) {
  return sistema(async (tx) => {
    const [c] = await tx
      .select()
      .from(contasFinanceiras)
      .where(
        dono.instrutorId
          ? eq(contasFinanceiras.instrutorId, dono.instrutorId)
          : eq(contasFinanceiras.autoescolaId, dono.autoescolaId!),
      );
    return c ? saldosConta(tx, c.id) : { retido: 0, disponivel: 0 };
  });
}

const somaGeral = async () =>
  Number(
    (
      await sistema((tx) =>
        tx.select({ s: sql<string>`coalesce(sum(valor_centavos),0)` }).from(lancamentos),
      )
    )[0]!.s,
  );

async function agendarComCredito(
  alunoId: string,
  creditoId: string,
  instrutorId: string,
  dias: number,
) {
  return comAtor(banco.db, { tipo: 'aluno', alunoId }, (tx) =>
    solicitarAulaComCredito(tx, {
      alunoId,
      creditoId,
      instrutorId,
      inicio: horario(dias),
      categoria: 'B',
      pontoEncontro: { lat: -23.55, lng: -46.63 },
      pontoEncontroEndereco: 'Praça da Sé',
    }),
  );
}

async function darAula(aulaId: string) {
  await sistema(async (tx) => {
    let a = await carregarAulaParaAlterar(tx, aulaId);
    a = await mudarStatusAula(tx, a, 'confirmada');
    a = await mudarStatusAula(tx, a, 'em_andamento');
    await mudarStatusAula(tx, a, 'aguardando_confirmacao', { extras: { checkoutEm: new Date() } });
  });
}

describe('pacote de instrutor', () => {
  it('libera o valor aula a aula e zera o retido na última', async () => {
    const { instrutor } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const pacote = await criarPacote({ instrutorId: instrutor.id }, 3, 20000);
    const { pedido } = await comprarEPagar(aluno.id, pacote.id);
    expect((await credito(pedido.id)).status).toBe('ativo');
    expect(await saldos({ instrutorId: instrutor.id })).toEqual({ retido: 20000, disponivel: 0 });

    for (const [i, dias] of [5, 6, 7].entries()) {
      const aula = await agendarComCredito(
        aluno.id,
        (await credito(pedido.id)).id,
        instrutor.id,
        dias,
      );
      expect(aula.status).toBe('solicitada');
      await darAula(aula.id);
      await sistema((tx) => concluirAula(tx, aula.id, 'aluno'));
      if (i === 0) expect((await saldos({ instrutorId: instrutor.id })).retido).toBe(20000 - 6667);
    }
    // 12% de comissão sobre R$ 200 = R$ 24
    expect(await saldos({ instrutorId: instrutor.id })).toEqual({ retido: 0, disponivel: 17600 });
    expect((await credito(pedido.id)).status).toBe('esgotado');
    expect(await somaGeral()).toBe(0);
  });
});

describe('pacote de autoescola e fila', () => {
  it('fica retido até a autoescola confirmar; depois libera e o aluno agenda com instrutor vinculado', async () => {
    const { autoescola } = await fabricarAutoescola(banco.db);
    const { instrutor } = await fabricarInstrutorAprovado(banco.db);
    const { instrutor: outro } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const pacote = await criarPacote({ autoescolaId: autoescola.id }, 10, 100000);
    const { pedido } = await comprarEPagar(aluno.id, pacote.id);

    const [p1] = await sistema((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedido.id)));
    expect(p1!.statusAtendimento).toBe('novo');
    expect(p1!.prazoRespostaEm).not.toBeNull();
    expect((await credito(pedido.id)).status).toBe('bloqueado');
    await expect(
      agendarComCredito(aluno.id, (await credito(pedido.id)).id, instrutor.id, 5),
    ).rejects.toMatchObject({
      codigo: 'credito_indisponivel',
    });

    await sistema((tx) => confirmarPedidoAutoescola(tx, pedido.id, autoescola.id, null));
    // 10% de comissão
    expect(await saldos({ autoescolaId: autoescola.id })).toEqual({ retido: 0, disponivel: 90000 });
    const ms = await sistema((tx) =>
      tx.select().from(matriculas).where(eq(matriculas.pedidoId, pedido.id)),
    );
    expect(ms).toHaveLength(1);

    await sistema((tx) =>
      tx
        .insert(instrutorVinculos)
        .values({ instrutorId: instrutor.id, autoescolaId: autoescola.id, status: 'ativo' }),
    );
    const c = await credito(pedido.id);
    await expect(agendarComCredito(aluno.id, c.id, outro.id, 5)).rejects.toMatchObject({
      codigo: 'instrutor_invalido',
    });
    const aula = await agendarComCredito(aluno.id, c.id, instrutor.id, 5);
    expect(aula.autoescolaId).toBe(autoescola.id);

    // A autoescola enxerga a aula; outra autoescola não.
    const { autoescola: outraAutoescola } = await fabricarAutoescola(banco.db);
    const vista = await comAtor(
      banco.db,
      { tipo: 'autoescola', autoescolaId: autoescola.id },
      (tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedido.id)),
    );
    const naoVista = await comAtor(
      banco.db,
      { tipo: 'autoescola', autoescolaId: outraAutoescola.id },
      (tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedido.id)),
    );
    expect(vista).toHaveLength(1);
    expect(naoVista).toHaveLength(0);
    expect(await somaGeral()).toBe(0);
  });

  it('recusa exige motivo e estorna; expiração também estorna', async () => {
    const { autoescola } = await fabricarAutoescola(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const pacote = await criarPacote({ autoescolaId: autoescola.id }, 5, 50000);

    const { pedido: p1 } = await comprarEPagar(aluno.id, pacote.id);
    await sistema((tx) =>
      recusarPedidoAutoescola(
        tx,
        p1.id,
        autoescola.id,
        'Sem vagas para esta categoria',
        crypto.randomUUID(),
      ),
    );
    const [r1] = await sistema((tx) => tx.select().from(pedidos).where(eq(pedidos.id, p1.id)));
    expect(r1).toMatchObject({
      status: 'estornado',
      statusAtendimento: 'recusado',
      motivoRecusa: 'Sem vagas para esta categoria',
    });
    const e1 = await sistema((tx) =>
      tx.select().from(estornos).where(eq(estornos.pedidoId, p1.id)),
    );
    expect(e1[0]!.valorCentavos).toBe(50000);

    const { pedido: p2 } = await comprarEPagar(aluno.id, pacote.id);
    expect(await sistema((tx) => expirarPedidoAutoescola(tx, p2.id))).toBe(true);
    const [r2] = await sistema((tx) => tx.select().from(pedidos).where(eq(pedidos.id, p2.id)));
    expect(r2).toMatchObject({ status: 'estornado', statusAtendimento: 'expirado' });
    expect((await credito(p2.id)).status).toBe('estornado');
    expect(await saldos({ autoescolaId: autoescola.id })).toEqual({ retido: 0, disponivel: 0 });
    expect(await somaGeral()).toBe(0);
  });

  it('autoescola suspensa não vende', async () => {
    const { autoescola } = await fabricarAutoescola(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const pacote = await criarPacote({ autoescolaId: autoescola.id });
    await sistema((tx) =>
      tx.update(autoescolas).set({ status: 'suspensa' }).where(eq(autoescolas.id, autoescola.id)),
    );
    await expect(
      comAtor(banco.db, { tipo: 'aluno', alunoId: aluno.id }, (tx) =>
        comprarPacote(tx, {
          alunoId: aluno.id,
          pacoteId: pacote.id,
          gateway: 'simulado',
          chaveIdempotencia: crypto.randomUUID(),
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'vendedor_indisponivel' });
  });
});

describe('saque e disputa', () => {
  async function aulaAvulsaPaga(dias: number) {
    const { instrutor, usuario } = await fabricarInstrutorAprovado(banco.db, {
      precoAulaCentavos: 10000,
    });
    const { aluno } = await fabricarAluno(banco.db);
    const r = await comAtor(banco.db, { tipo: 'aluno', alunoId: aluno.id }, (tx) =>
      solicitarAulaAvulsa(tx, {
        alunoId: aluno.id,
        instrutorId: instrutor.id,
        inicio: horario(dias),
        categoria: 'B',
        pontoEncontro: { lat: -23.55, lng: -46.63 },
        pontoEncontroEndereco: 'Rua A',
        gateway: 'simulado',
        chaveIdempotencia: crypto.randomUUID(),
      }),
    );
    await sistema((tx) => confirmarPagamento(tx, r.cobranca.id));
    await darAula(r.aula.id);
    return { ...r, instrutor, usuario, aluno };
  }

  it('saque debita o disponível; falha devolve; não permite sacar mais que o saldo', async () => {
    const { aula, instrutor } = await aulaAvulsaPaga(8);
    await sistema((tx) => concluirAula(tx, aula.id, 'aluno'));
    const titular = { tipo: 'instrutor' as const, instrutorId: instrutor.id };
    await expect(
      sistema((tx) =>
        solicitarSaque(tx, {
          titular,
          valorCentavos: 5000,
          gateway: 'simulado',
          solicitadoPor: null,
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'sem_conta_recebimento' });
    await sistema((tx) =>
      tx.insert(contasRecebimento).values({
        titularTipo: 'instrutor',
        instrutorId: instrutor.id,
        tipoChavePix: 'cpf',
        chavePixCifrada: 'x',
        chavePixMascarada: '***',
        titularNome: 'Teste',
        titularDocumento: '00000000000',
      }),
    );
    await expect(
      sistema((tx) =>
        solicitarSaque(tx, {
          titular,
          valorCentavos: 9000,
          gateway: 'simulado',
          solicitadoPor: null,
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'saldo_insuficiente' });
    const saque = await sistema((tx) =>
      solicitarSaque(tx, {
        titular,
        valorCentavos: 8000,
        gateway: 'simulado',
        solicitadoPor: null,
      }),
    );
    expect((await saldos({ instrutorId: instrutor.id })).disponivel).toBe(500);
    await sistema((tx) => reverterSaque(tx, saque.id, 'Chave Pix inválida'));
    expect((await saldos({ instrutorId: instrutor.id })).disponivel).toBe(8500);
    expect(await somaGeral()).toBe(0);
  });

  it('disputa com estorno parcial devolve parte ao aluno e libera o restante ao instrutor', async () => {
    const { aula, instrutor, aluno } = await aulaAvulsaPaga(9);
    const disputa = await sistema((tx) =>
      abrirDisputa(tx, {
        aulaId: aula.id,
        usuarioId: aluno.usuarioId,
        papel: 'aluno',
        motivo: 'Aula mais curta',
        descricao: 'A aula durou só 20 minutos.',
      }),
    );
    await sistema((tx) =>
      decidirDisputa(tx, {
        disputaId: disputa.id,
        ator: { tipo: 'admin', usuarioId: null },
        decisao: 'estorno_parcial',
        valorEstornoCentavos: 4000,
        resolucao: 'Aula reduzida comprovada',
      }),
    );
    // R$ 60 restantes liberados com 15% de comissão = R$ 51
    expect(await saldos({ instrutorId: instrutor.id })).toEqual({ retido: 0, disponivel: 5100 });
    expect((await sistema((tx) => carregarAulaParaAlterar(tx, aula.id))).status).toBe('concluida');
    expect(await somaGeral()).toBe(0);
  });

  it('disputa com estorno total cancela a aula e devolve tudo', async () => {
    const { aula, instrutor, aluno } = await aulaAvulsaPaga(10);
    const disputa = await sistema((tx) =>
      abrirDisputa(tx, {
        aulaId: aula.id,
        usuarioId: aluno.usuarioId,
        papel: 'aluno',
        motivo: 'Aula não aconteceu',
        descricao: 'O instrutor não apareceu.',
      }),
    );
    await sistema((tx) =>
      decidirDisputa(tx, {
        disputaId: disputa.id,
        ator: { tipo: 'admin', usuarioId: null },
        decisao: 'estorno_total',
        resolucao: 'Instrutor não compareceu',
      }),
    );
    expect(await saldos({ instrutorId: instrutor.id })).toEqual({ retido: 0, disponivel: 0 });
    expect((await sistema((tx) => carregarAulaParaAlterar(tx, aula.id))).status).toBe('cancelada');
    expect(await somaGeral()).toBe(0);
  });
});
