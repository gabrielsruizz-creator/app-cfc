import { ATOR_SISTEMA, comAtor, contratos, eq, outboxEventos } from '@volante/db';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  alunoCompleto,
  autoescolaAprovada,
  auth,
  criarAdmin,
  iniciarApp,
  instrutorAprovado,
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

const horario = (dias: number, hora: number) =>
  DateTime.now()
    .setZone('America/Sao_Paulo')
    .plus({ days: dias })
    .set({ hour: hora, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;

describe('contrato de prestação de serviços', () => {
  let cfc: Awaited<ReturnType<typeof autoescolaAprovada>>;
  let pacoteId: string;
  let aluno: Awaited<ReturnType<typeof alunoCompleto>>;
  let pedidoId: string;
  let previa: { versao: string; corpoMd: string; hash: string };

  beforeAll(async () => {
    cfc = await autoescolaAprovada(ctx, 'Autoescola Contratos');
    const p = await ctx
      .http()
      .post('/autoescola/pacotes')
      .set(cfc.h)
      .send({
        nome: 'Pacote 10 aulas',
        categorias: ['B'],
        quantidadeAulas: 10,
        duracaoAulaMin: 50,
        precoCentavos: 100000,
        parcelasMax: 1,
        validadeDias: 90,
        publicado: true,
      })
      .expect(201);
    pacoteId = p.body[0].id;
    aluno = await alunoCompleto(ctx);
  });

  it('a prévia traz o texto exato preenchido com as partes e as condições', async () => {
    const r = await ctx
      .http()
      .post('/aluno/contratos/previa')
      .set(auth(aluno.token))
      .send({ tipo: 'pacote', pacoteId })
      .expect(200);
    previa = r.body;
    expect(previa.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(previa.versao).toBe('0.1');
    expect(previa.corpoMd).toContain('# Contrato de prestação de serviços');
    expect(previa.corpoMd).toContain('Pacote "Pacote 10 aulas": 10 aulas práticas');
    expect(previa.corpoMd).toContain('para uso em até 90 dias');
    expect(previa.corpoMd).toMatch(/Total: \*\*R\$\s1\.000,00\*\*/);
    expect(previa.corpoMd).toContain('CNPJ');
    expect(previa.corpoMd).toContain('não confirmar a matrícula em até 5 dias');
    expect(previa.corpoMd).not.toContain('{{');
    // a prévia não deixa nada para trás
    const pedidos = await ctx.http().get('/aluno/pedidos').set(auth(aluno.token)).expect(200);
    expect(pedidos.body).toHaveLength(0);
  });

  it('compra sem o texto aceito igual é recusada; com o hash certo grava o contrato', async () => {
    const ha = auth(aluno.token);
    const errado = await ctx
      .http()
      .post('/aluno/pedidos')
      .set(ha)
      .set('idempotency-key', 'contrato-errado')
      .send({ pacoteId, aceiteContrato: { hash: 'a'.repeat(64) } })
      .expect(409);
    expect(errado.body.codigo).toBe('contrato_alterado');
    await ctx
      .http()
      .post('/aluno/pedidos')
      .set(ha)
      .set('idempotency-key', 'contrato-sem')
      .send({ pacoteId })
      .expect(400);

    const ok = await ctx
      .http()
      .post('/aluno/pedidos')
      .set(ha)
      .set('idempotency-key', 'contrato-ok')
      .set('user-agent', 'Volante/1 (iPhone; iOS 18)')
      .send({ pacoteId, aceiteContrato: { hash: previa.hash } })
      .expect(201);
    pedidoId = ok.body.id;

    const c = await ctx.http().get(`/aluno/contratos/${pedidoId}`).set(ha).expect(200);
    expect(c.body).toMatchObject({ hash: previa.hash, corpoMd: previa.corpoMd, versao: '0.1' });
    expect(c.body.aceites).toHaveLength(2);
    const contratado = c.body.aceites.find((a: { parte: string }) => a.parte === 'contratado');
    const contratante = c.body.aceites.find((a: { parte: string }) => a.parte === 'contratante');
    expect(contratado).toMatchObject({ forma: 'oferta' });
    expect(contratado.detalhe).toContain('Termo da autoescola parceira');
    expect(contratante).toMatchObject({ forma: 'clique', dispositivo: 'iPhone/iPad' });
    expect(contratante.documento).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    expect(contratante.ip).toMatch(/x\.x$|…$/);
  });

  it('as partes veem o mesmo contrato; outro aluno não', async () => {
    const daAutoescola = await ctx
      .http()
      .get(`/autoescola/contratos/${pedidoId}`)
      .set(cfc.h)
      .expect(200);
    expect(daAutoescola.body.hash).toBe(previa.hash);
    const outro = await alunoCompleto(ctx);
    await ctx.http().get(`/aluno/contratos/${pedidoId}`).set(auth(outro.token)).expect(404);
  });

  it('o contrato gravado não pode ser alterado', async () => {
    await expect(
      comAtor(ctx.banco.db, ATOR_SISTEMA, (tx) =>
        tx
          .update(contratos)
          .set({ corpoMd: 'outro texto' })
          .where(eq(contratos.pedidoId, pedidoId)),
      ),
    ).rejects.toThrow();
  });

  it('pedir nova cópia por e-mail gera o evento para o worker', async () => {
    await ctx
      .http()
      .post(`/aluno/contratos/${pedidoId}/reenviar`)
      .set(auth(aluno.token))
      .expect(200);
    const eventos = await comAtor(ctx.banco.db, ATOR_SISTEMA, (tx) =>
      tx.select().from(outboxEventos).where(eq(outboxEventos.tipo, 'contrato.reenviar')),
    );
    expect(eventos.map((e) => e.payload)).toContainEqual(
      expect.objectContaining({ parte: 'contratante' }),
    );
  });

  it('aula avulsa exige o aceite; com ele, o contrato traz data, horário e local', async () => {
    const admin = await criarAdmin(ctx);
    const instrutor = await instrutorAprovado(ctx, admin.token);
    const ha = auth(aluno.token);
    const pedido = {
      instrutorId: instrutor.instrutorId,
      inicio: horario(3, 10),
      categoria: 'B',
      pontoEncontro: { lat: -23.56, lng: -46.65 },
      pontoEncontroEndereco: 'Av. Paulista, 1000',
    };
    const sem = await ctx
      .http()
      .post('/aluno/aulas')
      .set(ha)
      .set('idempotency-key', 'avulsa-sem-contrato')
      .send(pedido)
      .expect(422);
    expect(sem.body.codigo).toBe('contrato_obrigatorio');
    const p = await ctx
      .http()
      .post('/aluno/contratos/previa')
      .set(ha)
      .send({ tipo: 'aula_avulsa', ...pedido })
      .expect(200);
    expect(p.body.corpoMd).toContain('Uma aula prática de direção, categoria B, de 50 minutos');
    expect(p.body.corpoMd).toContain('das 10:00 às 10:50, com encontro em Av. Paulista, 1000');
    expect(p.body.corpoMd).toContain('CPF');
    // a prévia não segurou o horário
    const aula = await ctx
      .http()
      .post('/aluno/aulas')
      .set(ha)
      .set('idempotency-key', 'avulsa-com-contrato')
      .send({ ...pedido, aceiteContrato: { hash: p.body.hash } })
      .expect(201);
    const c = await ctx.http().get(`/aluno/contratos/${aula.body.pedidoId}`).set(ha).expect(200);
    expect(c.body.hash).toBe(p.body.hash);
    const doInstrutor = await ctx
      .http()
      .get(`/instrutor/contratos/${aula.body.pedidoId}`)
      .set(auth(instrutor.token))
      .expect(200);
    expect(doInstrutor.body.aceites.map((a: { parte: string }) => a.parte).sort()).toEqual([
      'contratado',
      'contratante',
    ]);
  });
});
