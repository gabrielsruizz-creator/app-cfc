import { ATOR_SISTEMA, aulas, comAtor, eq } from '@volante/db';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  alunoCompleto,
  auth,
  autoescolaAprovada,
  BASE,
  criarAdmin,
  iniciarApp,
  instrutorAprovado,
  pagar,
  type Contexto,
} from './apoio';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await iniciarApp();
});
afterAll(async () => {
  await ctx?.app.close();
  await ctx?.banco.destruir();
});

function horario(dias: number, hora: number) {
  return DateTime.now()
    .setZone('America/Sao_Paulo')
    .plus({ days: dias })
    .set({ hour: hora, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}

const hoje = () => DateTime.now().setZone('America/Sao_Paulo').toISODate()!;

describe('Fase 3 — cupons, cartão, rastreamento e relatórios', () => {
  let admin: Awaited<ReturnType<typeof criarAdmin>>;
  let instrutor: Awaited<ReturnType<typeof instrutorAprovado>>;
  let cfc: Awaited<ReturnType<typeof autoescolaAprovada>>;

  beforeAll(async () => {
    admin = await criarAdmin(ctx);
    instrutor = await instrutorAprovado(ctx, admin.token);
    cfc = await autoescolaAprovada(ctx, 'Autoescola Relatorios');
  });

  it('admin cria cupom; aluno confere e agenda aula com desconto', async () => {
    const ha = auth(admin.token);
    const cupom = {
      codigo: 'boasvindas',
      campanha: 'Lançamento',
      tipo: 'percentual',
      valor: 2000,
      bancadoPor: 'plataforma',
      produtoTipo: 'aula_avulsa',
    };
    const criados = await ctx.http().post('/admin/cupons').set(ha).send(cupom).expect(201);
    expect(criados.body[0]).toMatchObject({ codigo: 'BOASVINDAS', usos: 0 });
    await ctx.http().post('/admin/cupons').set(ha).send(cupom).expect(409);

    const aluno = await alunoCompleto(ctx);
    const hal = auth(aluno.token);
    await ctx.http().get('/admin/cupons').set(hal).expect(403);
    const previa = await ctx
      .http()
      .post('/aluno/cupons/validar')
      .set(hal)
      .send({ codigo: 'BoasVindas', instrutorId: instrutor.instrutorId })
      .expect(201);
    expect(previa.body).toMatchObject({
      valorBrutoCentavos: 10000,
      descontoCentavos: 2000,
      valorFinalCentavos: 8000,
    });
    await ctx
      .http()
      .post('/aluno/cupons/validar')
      .set(hal)
      .send({ codigo: 'NADA', instrutorId: instrutor.instrutorId })
      .expect(422);

    const aula = await ctx
      .http()
      .post('/aluno/aulas')
      .set(hal)
      .set('idempotency-key', 'aula-cupom')
      .send({
        instrutorId: instrutor.instrutorId,
        inicio: horario(3, 9),
        categoria: 'B',
        pontoEncontro: BASE,
        pontoEncontroEndereco: 'Av. Paulista, 1000',
        cupom: 'boasvindas',
      })
      .expect(201);
    expect(aula.body.cobranca.valorCentavos).toBe(8000);
    const lista = await ctx.http().get('/admin/cupons').set(ha).expect(200);
    expect(lista.body[0].usos).toBe(1);
  });

  it('autoescola cria o próprio cupom; não vê nem altera os de outros', async () => {
    const criado = await ctx
      .http()
      .post('/autoescola/cupons')
      .set(cfc.h)
      .send({ codigo: 'AUTO10', tipo: 'percentual', valor: 1000 })
      .expect(201);
    expect(criado.body).toHaveLength(1);
    expect(criado.body[0]).toMatchObject({
      bancadoPor: 'vendedor',
      autoescolaId: cfc.autoescolaId,
    });
    const outra = await autoescolaAprovada(ctx, 'Outra Autoescola F3');
    const vistos = await ctx.http().get('/autoescola/cupons').set(outra.h).expect(200);
    expect(vistos.body).toHaveLength(0);
    await ctx
      .http()
      .put(`/autoescola/cupons/${criado.body[0].id}`)
      .set(outra.h)
      .send({ codigo: 'AUTO10', tipo: 'percentual', valor: 5000 })
      .expect(404);
    // cupom da plataforma para esta autoescola: ela vê, mas não altera
    const plat = await ctx
      .http()
      .post('/admin/cupons')
      .set(auth(admin.token))
      .send({
        codigo: 'PLATAE',
        tipo: 'valor_fixo',
        valor: 5000,
        bancadoPor: 'plataforma',
        autoescolaId: cfc.autoescolaId,
      })
      .expect(201);
    const idPlat = plat.body.find((c: { codigo: string }) => c.codigo === 'PLATAE').id;
    await ctx
      .http()
      .put(`/autoescola/cupons/${idPlat}`)
      .set(cfc.h)
      .send({ codigo: 'PLATAE', tipo: 'valor_fixo', valor: 9000 })
      .expect(404);
  });

  it('pacote no cartão parcelado com cupom da autoescola; acima do permitido é recusado', async () => {
    const pacote = await ctx
      .http()
      .post('/autoescola/pacotes')
      .set(cfc.h)
      .send({
        nome: 'Pacote 10 aulas',
        categorias: ['B'],
        quantidadeAulas: 10,
        duracaoAulaMin: 50,
        precoCentavos: 100000,
        parcelasMax: 6,
        publicado: true,
      })
      .expect(201);
    const pacoteId = pacote.body[0].id as string;
    const aluno = await alunoCompleto(ctx);
    const hal = auth(aluno.token);
    await ctx
      .http()
      .post('/aluno/pedidos')
      .set(hal)
      .set('idempotency-key', 'cartao-7x')
      .send({ pacoteId, metodo: 'cartao', parcelas: 7 })
      .expect(422);
    const pedido = await ctx
      .http()
      .post('/aluno/pedidos')
      .set(hal)
      .set('idempotency-key', 'cartao-6x')
      .send({ pacoteId, metodo: 'cartao', parcelas: 6, cupom: 'auto10' })
      .expect(201);
    expect(pedido.body).toMatchObject({
      valorBrutoCentavos: 100000,
      descontoCentavos: 10000,
      valorTotalCentavos: 90000,
      cupomCodigo: 'AUTO10',
      cobranca: { metodo: 'cartao', parcelas: 6, valorCentavos: 90000 },
    });
    await pagar(ctx, pedido.body.cobranca.id);

    const rel = await ctx
      .http()
      .get('/autoescola/relatorios')
      .query({ de: hoje(), ate: hoje() })
      .set(cfc.h)
      .expect(200);
    expect(rel.body.vendas).toMatchObject({
      pedidos: 1,
      pagoCentavos: 90000,
      descontoCentavos: 10000,
    });
    expect(rel.body.fila.recebidos).toBe(1);
    expect(rel.body.cupons[0]).toMatchObject({ codigo: 'AUTO10', usos: 1 });

    const csv = await ctx
      .http()
      .get('/autoescola/relatorios/vendas.csv')
      .query({ de: hoje(), ate: hoje() })
      .set(cfc.h)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Valor pago');
    expect(csv.text).toContain('900,00');
    expect(csv.text).toContain('AUTO10');

    const adm = await ctx
      .http()
      .get('/admin/relatorios')
      .query({ de: hoje(), ate: hoje() })
      .set(auth(admin.token))
      .expect(200);
    expect(adm.body.porMetodo).toContainEqual(
      expect.objectContaining({ metodo: 'cartao', parcelas: 6, pedidos: 1 }),
    );
    await ctx
      .http()
      .get('/admin/relatorios')
      .query({ de: 'ontem', ate: hoje() })
      .set(auth(admin.token))
      .expect(400);
  });

  it('a caminho, posição ao vivo e link para o contato de confiança', async () => {
    const aluno = await alunoCompleto(ctx);
    const hal = auth(aluno.token);
    const hi = auth(instrutor.token);
    const criada = await ctx
      .http()
      .post('/aluno/aulas')
      .set(hal)
      .set('idempotency-key', 'aula-rastreio')
      .send({
        instrutorId: instrutor.instrutorId,
        inicio: horario(4, 15),
        categoria: 'B',
        pontoEncontro: BASE,
        pontoEncontroEndereco: 'Av. Paulista, 1000',
      })
      .expect(201);
    const aulaId = criada.body.id as string;
    await pagar(ctx, criada.body.cobranca.id);
    await ctx.http().post(`/instrutor/aulas/${aulaId}/aceitar`).set(hi).expect(201);

    // longe do horário: ainda não pode
    await ctx.http().post(`/instrutor/aulas/${aulaId}/a-caminho`).set(hi).send({}).expect(422);
    const agora = Date.now();
    await comAtor(ctx.banco.db, ATOR_SISTEMA, (tx) =>
      tx
        .update(aulas)
        .set({ inicio: new Date(agora + 30 * 60_000), fim: new Date(agora + 80 * 60_000) })
        .where(eq(aulas.id, aulaId)),
    );
    const caminho = await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/a-caminho`)
      .set(hi)
      .send({ posicao: { lat: -23.58, lng: -46.66 } })
      .expect(201);
    expect(caminho.body.status).toBe('a_caminho');

    const r = await ctx.http().get(`/aluno/aulas/${aulaId}/rastreamento`).set(hal).expect(200);
    expect(r.body.posicao).toMatchObject({ lat: -23.58, lng: -46.66 });
    expect(r.body.chegadaEstimadaMin).toBeGreaterThan(0);
    const intruso = await alunoCompleto(ctx);
    await ctx
      .http()
      .get(`/aluno/aulas/${aulaId}/rastreamento`)
      .set(auth(intruso.token))
      .expect(404);

    const link = await ctx
      .http()
      .post(`/aluno/aulas/${aulaId}/compartilhamentos`)
      .set(hal)
      .send({ contatoNome: 'Mãe' })
      .expect(201);
    expect(link.body.url).toMatch(/\/acompanhar\/[\w-]{20,}$/);
    const token = link.body.url.split('/').pop();
    const publico = await ctx.http().get(`/publico/acompanhar/${token}`).expect(200);
    expect(publico.body).toMatchObject({ status: 'a_caminho', alunoPrimeiroNome: 'Aluno' });
    expect(publico.body.posicao).not.toBeNull();
    const ativos = await ctx
      .http()
      .get(`/aluno/aulas/${aulaId}/compartilhamentos`)
      .set(hal)
      .expect(200);
    expect(ativos.body).toHaveLength(1);
    await ctx
      .http()
      .delete(`/aluno/aulas/${aulaId}/compartilhamentos/${link.body.id}`)
      .set(hal)
      .expect(204);
    await ctx.http().get(`/publico/acompanhar/${token}`).expect(404);

    // posição só do instrutor da aula
    const detalhe = await ctx.http().get(`/aluno/aulas/${aulaId}`).set(hal).expect(200);
    await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/checkin`)
      .set(hi)
      .send({ codigo: detalhe.body.codigoCheckin, local: BASE })
      .expect(201);
    await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/posicao`)
      .set(hi)
      .send({ lat: -23.5615, lng: -46.656 })
      .expect(200);
  });
});
