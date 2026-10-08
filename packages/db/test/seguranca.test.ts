import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ATOR_SISTEMA,
  auditar,
  aulas,
  autoescolaDocumentos,
  autoescolas,
  comAtor,
  creditosAula,
  criarBancoTeste,
  fabricarAluno,
  fabricarArquivo,
  fabricarAutoescola,
  fabricarInstrutorAprovado,
  lancamentos,
  pedidos,
  regrasComissao,
  semearBase,
  type Ator,
  type BancoTeste,
  contasFinanceiras,
} from '../src';

let banco: BancoTeste;

beforeAll(async () => {
  banco = await criarBancoTeste();
  await semearBase(banco.db);
});
afterAll(async () => banco?.destruir());

async function regraAutoescolaPacote() {
  return comAtor(banco.db, ATOR_SISTEMA, async (tx) => {
    const [r] = await tx
      .select()
      .from(regrasComissao)
      .where(
        and(
          eq(regrasComissao.vendedorTipo, 'autoescola'),
          eq(regrasComissao.produtoTipo, 'pacote'),
          isNull(regrasComissao.vigenteAte),
        ),
      );
    return r!;
  });
}

async function criarPedidoAutoescola(autoescolaId: string, alunoId: string) {
  const regra = await regraAutoescolaPacote();
  return comAtor(banco.db, ATOR_SISTEMA, async (tx) => {
    const [p] = await tx
      .insert(pedidos)
      .values({
        codigo: `PD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        alunoId,
        vendedorTipo: 'autoescola',
        autoescolaId,
        tipo: 'pacote',
        snapshot: {
          descricao: '10 aulas B',
          categorias: ['B'],
          quantidadeAulas: 10,
          duracaoAulaMin: 50,
          precoUnitarioCentavos: 10000,
          vendedorNome: 'Teste',
        },
        quantidadeAulas: 10,
        valorBrutoCentavos: 100000,
        valorTotalCentavos: 100000,
        comissaoBp: regra.percentualBp,
        comissaoCentavos: 10000,
        valorLiquidoVendedorCentavos: 90000,
        regraComissaoId: regra.id,
        status: 'pago',
        statusAtendimento: 'novo',
      })
      .returning();
    return p!;
  });
}

describe('isolamento entre autoescolas (RLS)', () => {
  it('uma autoescola não lê, não altera e não descobre por ID os pedidos de outra', async () => {
    const { autoescola: a } = await fabricarAutoescola(banco.db);
    const { autoescola: b } = await fabricarAutoescola(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const pedidoA = await criarPedidoAutoescola(a.id, aluno.id);
    const pedidoB = await criarPedidoAutoescola(b.id, aluno.id);

    const atorA: Ator = { tipo: 'autoescola', autoescolaId: a.id };

    const visiveis = await comAtor(banco.db, atorA, (tx) => tx.select().from(pedidos));
    expect(visiveis.map((p) => p.id)).toEqual([pedidoA.id]);

    const porId = await comAtor(banco.db, atorA, (tx) =>
      tx.select().from(pedidos).where(eq(pedidos.id, pedidoB.id)),
    );
    expect(porId).toHaveLength(0);

    const alterados = await comAtor(banco.db, atorA, (tx) =>
      tx
        .update(pedidos)
        .set({ statusAtendimento: 'em_contato' })
        .where(eq(pedidos.id, pedidoB.id))
        .returning(),
    );
    expect(alterados).toHaveLength(0);

    // tentar inserir dados em nome de outra autoescola é bloqueado pelo WITH CHECK
    const arquivo = await fabricarArquivo(banco.db, aluno.usuarioId, 'documento');
    await expect(
      comAtor(banco.db, atorA, (tx) =>
        tx
          .insert(autoescolaDocumentos)
          .values({ autoescolaId: b.id, tipo: 'alvara', arquivoId: arquivo.id }),
      ),
    ).rejects.toSatisfy((e: { cause?: Error }) =>
      /row-level security/.test(e.cause?.message ?? ''),
    );
  });

  it('o aluno só vê os próprios pedidos', async () => {
    const { autoescola } = await fabricarAutoescola(banco.db);
    const { aluno: aluno1 } = await fabricarAluno(banco.db);
    const { aluno: aluno2 } = await fabricarAluno(banco.db);
    const p1 = await criarPedidoAutoescola(autoescola.id, aluno1.id);
    await criarPedidoAutoescola(autoescola.id, aluno2.id);

    const vistos = await comAtor(banco.db, { tipo: 'aluno', alunoId: aluno1.id }, (tx) =>
      tx.select({ id: pedidos.id }).from(pedidos),
    );
    expect(vistos.map((p) => p.id)).toEqual([p1.id]);
  });

  it('sem contexto definido, nada é retornado das tabelas protegidas', async () => {
    const { autoescola } = await fabricarAutoescola(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    await criarPedidoAutoescola(autoescola.id, aluno.id);
    const linhas = await banco.db.select().from(pedidos);
    expect(linhas).toHaveLength(0);
  });

  it('a vitrine pública mostra apenas autoescolas aprovadas', async () => {
    const { autoescola: aprovada } = await fabricarAutoescola(banco.db);
    const { autoescola: emAnalise } = await fabricarAutoescola(banco.db, { status: 'em_analise' });
    const vistas = await comAtor(banco.db, { tipo: 'anonimo' }, (tx) =>
      tx.select({ id: autoescolas.id }).from(autoescolas),
    );
    const ids = vistas.map((v) => v.id);
    expect(ids).toContain(aprovada.id);
    expect(ids).not.toContain(emAnalise.id);
  });
});

describe('agenda sem conflito', () => {
  async function prepararAula(instrutorId: string, alunoId: string, inicio: Date) {
    const regra = await comAtor(banco.db, ATOR_SISTEMA, async (tx) => {
      const [r] = await tx.select().from(regrasComissao).limit(1);
      return r!;
    });
    return comAtor(banco.db, ATOR_SISTEMA, async (tx) => {
      const [pedido] = await tx
        .insert(pedidos)
        .values({
          codigo: `PD-${Math.random().toString(36).slice(2, 9)}`,
          alunoId,
          vendedorTipo: 'instrutor',
          instrutorId,
          tipo: 'aula_avulsa',
          snapshot: {
            descricao: 'Aula',
            categorias: ['B'],
            quantidadeAulas: 1,
            duracaoAulaMin: 50,
            precoUnitarioCentavos: 10000,
            vendedorNome: 'X',
          },
          quantidadeAulas: 1,
          valorBrutoCentavos: 10000,
          valorTotalCentavos: 10000,
          comissaoBp: 1500,
          comissaoCentavos: 1500,
          valorLiquidoVendedorCentavos: 8500,
          regraComissaoId: regra.id,
        })
        .returning();
      const [credito] = await tx
        .insert(creditosAula)
        .values({
          pedidoId: pedido!.id,
          alunoId,
          instrutorId,
          categorias: ['B'],
          duracaoAulaMin: 50,
          quantidadeTotal: 1,
          status: 'aguardando_pagamento',
        })
        .returning();
      return { pedido: pedido!, credito: credito! };
    });
  }

  it('o banco recusa duas aulas sobrepostas para o mesmo instrutor, mesmo em paralelo', async () => {
    const { instrutor } = await fabricarInstrutorAprovado(banco.db);
    const { aluno: aluno1 } = await fabricarAluno(banco.db);
    const { aluno: aluno2 } = await fabricarAluno(banco.db);
    const inicio = new Date(Date.now() + 3 * 86400_000);
    inicio.setUTCHours(13, 0, 0, 0);
    const p1 = await prepararAula(instrutor.id, aluno1.id, inicio);
    const p2 = await prepararAula(instrutor.id, aluno2.id, inicio);

    const inserir = (
      alunoId: string,
      pedidoId: string,
      creditoId: string,
      deslocamentoMin: number,
    ) =>
      comAtor(banco.db, ATOR_SISTEMA, (tx) =>
        tx.insert(aulas).values({
          alunoId,
          instrutorId: instrutor.id,
          pedidoId,
          creditoId,
          categoria: 'B',
          inicio: new Date(inicio.getTime() + deslocamentoMin * 60_000),
          fim: new Date(inicio.getTime() + (deslocamentoMin + 50) * 60_000),
          valorCentavos: 10000,
          pontoEncontro: { lat: -23.55, lng: -46.63 },
          pontoEncontroEndereco: 'Rua A',
          status: 'solicitada',
          codigoCheckin: '1234',
          politicaCancelamento: { gratisAteHoras: 24, multaBp: 5000 },
        }),
      );

    const resultados = await Promise.allSettled([
      inserir(aluno1.id, p1.pedido.id, p1.credito.id, 0),
      inserir(aluno2.id, p2.pedido.id, p2.credito.id, 30),
    ]);
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const falhas = resultados.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    expect(String(falhas[0]!.reason?.cause?.message ?? falhas[0]!.reason)).toMatch(
      /aulas_sem_conflito_instrutor/,
    );
  });

  it('aula cancelada libera o horário', async () => {
    const { instrutor } = await fabricarInstrutorAprovado(banco.db);
    const { aluno } = await fabricarAluno(banco.db);
    const inicio = new Date(Date.now() + 4 * 86400_000);
    const p1 = await prepararAula(instrutor.id, aluno.id, inicio);
    const p2 = await prepararAula(instrutor.id, aluno.id, inicio);
    const base = {
      alunoId: aluno.id,
      instrutorId: instrutor.id,
      categoria: 'B',
      inicio,
      fim: new Date(inicio.getTime() + 50 * 60_000),
      valorCentavos: 10000,
      pontoEncontro: { lat: -23.55, lng: -46.63 },
      pontoEncontroEndereco: 'Rua A',
      codigoCheckin: '1234',
      politicaCancelamento: { gratisAteHoras: 24, multaBp: 5000 },
    };
    await comAtor(banco.db, ATOR_SISTEMA, (tx) =>
      tx
        .insert(aulas)
        .values({ ...base, pedidoId: p1.pedido.id, creditoId: p1.credito.id, status: 'cancelada' }),
    );
    await expect(
      comAtor(banco.db, ATOR_SISTEMA, (tx) =>
        tx.insert(aulas).values({
          ...base,
          pedidoId: p2.pedido.id,
          creditoId: p2.credito.id,
          status: 'solicitada',
        }),
      ),
    ).resolves.toBeDefined();
  });
});

describe('auditoria imutável', () => {
  it('encadeia hashes e recusa alteração ou exclusão', async () => {
    const ator: Ator = { tipo: 'admin', usuarioId: null };
    for (let i = 0; i < 3; i++) {
      await comAtor(banco.db, ator, (tx) =>
        auditar(tx, {
          ator,
          entidadeTipo: 'regra_comissao',
          entidadeId: '0190f5a0-0000-7000-8000-000000000000',
          acao: 'comissao.alterada',
          antes: { percentualBp: 1500 + i },
          depois: { percentualBp: 1600 + i },
        }),
      );
    }
    const integra = await banco.pool.query('select auditoria.verificar_cadeia() as quebra');
    expect(integra.rows[0].quebra).toBeNull();

    await expect(banco.pool.query("update auditoria.registros set motivo = 'x'")).rejects.toThrow();
    await expect(banco.pool.query('delete from auditoria.registros')).rejects.toThrow();
  });

  it('lançamentos financeiros não podem ser alterados', async () => {
    const conta = await comAtor(banco.db, ATOR_SISTEMA, async (tx) => {
      const [c] = await tx
        .select()
        .from(contasFinanceiras)
        .where(eq(contasFinanceiras.titularTipo, 'plataforma'));
      const [l] = await tx
        .insert(lancamentos)
        .values({
          operacaoId: '0190f5a0-0000-7000-8000-000000000001',
          contaId: c!.id,
          tipo: 'ajuste',
          bucket: 'disponivel',
          valorCentavos: 100,
          descricao: 'teste',
        })
        .returning();
      return l!;
    });
    await expect(
      comAtor(banco.db, ATOR_SISTEMA, (tx) =>
        tx.execute(sql`update lancamentos set valor_centavos = 1 where id = ${conta.id}`),
      ),
    ).rejects.toThrow();
  });
});
