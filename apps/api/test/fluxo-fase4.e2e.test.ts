import { ATOR_SISTEMA, comAtor, eq, integracoesAutoescola, outboxEventos } from '@volante/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { autoescolaAprovada, cadastrar, iniciarApp, type Contexto } from './apoio';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await iniciarApp();
});
afterAll(async () => {
  await ctx?.app.close();
  await ctx?.banco.destruir();
});

const CHAVE = 'cfcp_ab12cd_K7xP2mQ9vR4sT8wY1zA3bC5dE6fG';

describe('Fase 4 — conexão com o CFC Plus', () => {
  it('conecta, guarda a chave cifrada, pede o teste e desconecta', async () => {
    const cfc = await autoescolaAprovada(ctx, 'Autoescola Integrada');
    const inicial = await ctx.http().get('/autoescola/integracoes/cfc-plus').set(cfc.h).expect(200);
    expect(inicial.body.status).toBe('nao_conectada');

    await ctx
      .http()
      .put('/autoescola/integracoes/cfc-plus')
      .set(cfc.h)
      .send({ url: 'https://cfcplus.teste', chave: 'chave-qualquer' })
      .expect(400);
    // sincronizar só depois de conectada
    await ctx.http().post('/autoescola/integracoes/cfc-plus/sincronizar').set(cfc.h).expect(422);

    const r = await ctx
      .http()
      .put('/autoescola/integracoes/cfc-plus')
      .set(cfc.h)
      .send({ url: 'https://cfcplus.teste/', chave: CHAVE })
      .expect(200);
    expect(r.body).toMatchObject({
      status: 'testando',
      url: 'https://cfcplus.teste',
      chaveMascarada: 'cfcp_ab12cd_••••E6fG',
    });
    expect(JSON.stringify(r.body)).not.toContain('K7xP2mQ9');

    const [linha] = await comAtor(ctx.banco.db, ATOR_SISTEMA, (tx) =>
      tx
        .select()
        .from(integracoesAutoescola)
        .where(eq(integracoesAutoescola.autoescolaId, cfc.autoescolaId)),
    );
    expect(Buffer.from(linha!.configuracaoCifrada!).toString('utf8')).not.toContain(CHAVE);
    const eventos = await comAtor(ctx.banco.db, ATOR_SISTEMA, (tx) =>
      tx.select().from(outboxEventos).where(eq(outboxEventos.tipo, 'integracao.testar')),
    );
    expect(eventos.some((e) => e.autoescolaId === cfc.autoescolaId)).toBe(true);

    const resumo = await ctx.http().get('/autoescola/integracoes').set(cfc.h).expect(200);
    expect(resumo.body[0]).toMatchObject({ sistema: 'cfc_plus', status: 'testando' });

    const desligada = await ctx
      .http()
      .delete('/autoescola/integracoes/cfc-plus')
      .set(cfc.h)
      .expect(200);
    expect(desligada.body).toMatchObject({ status: 'desativada', chaveMascarada: null });
  });

  it('quem não é dono nem gerente não configura; outra autoescola não vê', async () => {
    const cfc = await autoescolaAprovada(ctx, 'Autoescola Restrita');
    const intruso = await cadastrar(ctx, 'Intruso');
    await ctx
      .http()
      .put('/autoescola/integracoes/cfc-plus')
      .set({ authorization: `Bearer ${intruso.token}`, 'x-autoescola-id': cfc.autoescolaId })
      .send({ url: 'https://cfcplus.teste', chave: CHAVE })
      .expect(403);
    const outra = await autoescolaAprovada(ctx, 'Outra Autoescola F4');
    await ctx
      .http()
      .put('/autoescola/integracoes/cfc-plus')
      .set(cfc.h)
      .send({ url: 'https://cfcplus.teste', chave: CHAVE })
      .expect(200);
    const vista = await ctx.http().get('/autoescola/integracoes/cfc-plus').set(outra.h).expect(200);
    expect(vista.body.status).toBe('nao_conectada');
  });
});
