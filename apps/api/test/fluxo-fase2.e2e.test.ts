import { ATOR_SISTEMA, aulas, comAtor, eq } from '@volante/db';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  alunoCompleto,
  autoescolaAprovada,
  auth,
  BASE,
  cadastrar,
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

const PACOTE = {
  nome: 'Pacote 10 aulas',
  descricao: 'Ideal para quem está começando',
  categorias: ['B'],
  quantidadeAulas: 10,
  duracaoAulaMin: 50,
  precoCentavos: 100000,
  parcelasMax: 1,
  publicado: true,
};

describe('Fase 2 — autoescola, pacotes, chat, financeiro e moderação', () => {
  let admin: Awaited<ReturnType<typeof criarAdmin>>;
  let instrutor: Awaited<ReturnType<typeof instrutorAprovado>>;
  let cfc: Awaited<ReturnType<typeof autoescolaAprovada>>;

  beforeAll(async () => {
    admin = await criarAdmin(ctx);
    instrutor = await instrutorAprovado(ctx, admin.token);
    cfc = await autoescolaAprovada(ctx, 'Autoescola Fila');
  });

  it('vitrine, pacote, convite de instrutor e busca pública', async () => {
    await ctx
      .http()
      .put('/autoescola/vitrine')
      .set(cfc.h)
      .send({
        descricao: 'A melhor autoescola do bairro.',
        mensagemWhatsappPadrao: 'Olá {aluno}! Aqui é da {autoescola}, sobre o {pacote}.',
        horarios: [{ diaSemana: 1, abre: '08:00', fecha: '18:00' }],
      })
      .expect(200);
    const p = await ctx.http().post('/autoescola/pacotes').set(cfc.h).send(PACOTE).expect(201);
    expect(p.body[0].precoPorAulaCentavos).toBe(10000);

    await ctx
      .http()
      .post('/autoescola/instrutores/convites')
      .set(cfc.h)
      .send({ cpfOuEmail: instrutor.eu.email })
      .expect(201);
    const convites = await ctx
      .http()
      .get('/instrutor/vinculos')
      .set(auth(instrutor.token))
      .expect(200);
    const convite = convites.body.find(
      (v: { autoescolaId: string }) => v.autoescolaId === cfc.autoescolaId,
    );
    expect(convite.status).toBe('convidado');
    await ctx
      .http()
      .post(`/instrutor/vinculos/${convite.id}/aceitar`)
      .set(auth(instrutor.token))
      .expect(201);

    const busca = await ctx.http().get('/publico/autoescolas').query(BASE).expect(200);
    const card = busca.body.find((c: { id: string }) => c.id === cfc.autoescolaId);
    expect(card.aPartirDeCentavos).toBe(100000);
    const perfil = await ctx.http().get(`/publico/autoescolas/${cfc.autoescolaId}`).expect(200);
    expect(perfil.body.pacotes).toHaveLength(1);
    expect(perfil.body.horarios).toHaveLength(1);
    expect(perfil.body.instrutores.map((i: { id: string }) => i.id)).toContain(
      instrutor.instrutorId,
    );
  });

  it('compra de pacote → fila → em contato → confirmado → aula com crédito', async () => {
    const aluno = await alunoCompleto(ctx);
    const ha = auth(aluno.token);
    const perfil = await ctx.http().get(`/publico/autoescolas/${cfc.autoescolaId}`).expect(200);
    const pacoteId = perfil.body.pacotes[0].id as string;

    const pedido = await ctx
      .http()
      .post('/aluno/pedidos')
      .set(ha)
      .set('idempotency-key', 'pedido-1')
      .send({ pacoteId })
      .expect(201);
    const repetido = await ctx
      .http()
      .post('/aluno/pedidos')
      .set(ha)
      .set('idempotency-key', 'pedido-1')
      .send({ pacoteId })
      .expect(201);
    expect(repetido.body.id).toBe(pedido.body.id);
    expect(pedido.body.status).toBe('aguardando_pagamento');

    // ainda não pago: não aparece na fila
    let fila = await ctx.http().get('/autoescola/fila').set(cfc.h).expect(200);
    expect(
      fila.body.find((i: { pedidoId: string }) => i.pedidoId === pedido.body.id),
    ).toBeUndefined();

    await pagar(ctx, pedido.body.cobranca.id);
    const pago = await ctx.http().get(`/aluno/pedidos/${pedido.body.id}`).set(ha).expect(200);
    expect(pago.body.status).toBe('pago');
    expect(pago.body.statusAtendimento).toBe('novo');

    fila = await ctx.http().get('/autoescola/fila').set(cfc.h).expect(200);
    const item = fila.body.find((i: { pedidoId: string }) => i.pedidoId === pedido.body.id);
    expect(item.statusAtendimento).toBe('novo');
    expect(item.linkWhatsapp).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(item.linkWhatsapp)).toContain('Autoescola Fila');
    expect(item.valorLiquidoCentavos).toBeLessThan(100000);

    // outra autoescola não vê o pedido
    const outra = await autoescolaAprovada(ctx, 'Outra Autoescola');
    const filaOutra = await ctx.http().get('/autoescola/fila').set(outra.h).expect(200);
    expect(filaOutra.body).toHaveLength(0);
    await ctx.http().post(`/autoescola/fila/${pedido.body.id}/confirmar`).set(outra.h).expect(404);

    await ctx.http().post(`/autoescola/fila/${pedido.body.id}/em-contato`).set(cfc.h).expect(201);
    await ctx.http().post(`/autoescola/fila/${pedido.body.id}/confirmar`).set(cfc.h).expect(201);
    const confirmado = await ctx.http().get(`/aluno/pedidos/${pedido.body.id}`).set(ha).expect(200);
    expect(confirmado.body.statusAtendimento).toBe('confirmado');

    const alunosCfc = await ctx.http().get('/autoescola/alunos').set(cfc.h).expect(200);
    expect(alunosCfc.body.map((a: { alunoId: string }) => a.alunoId)).toContain(aluno.alunoId);

    const creditos = await ctx.http().get('/aluno/creditos').set(ha).expect(200);
    expect(creditos.body).toHaveLength(1);
    expect(creditos.body[0].disponiveis).toBe(10);

    const aula = await ctx
      .http()
      .post('/aluno/aulas/com-credito')
      .set(ha)
      .send({
        creditoId: creditos.body[0].id,
        instrutorId: instrutor.instrutorId,
        inicio: horario(4, 9),
        categoria: 'B',
        pontoEncontro: BASE,
        pontoEncontroEndereco: 'Av. Paulista, 100',
      })
      .expect(201);
    expect(aula.body.status).toBe('solicitada');
    const depois = await ctx.http().get('/aluno/creditos').set(ha).expect(200);
    expect(depois.body[0].disponiveis).toBe(9);

    // avaliação da autoescola e resposta
    await ctx
      .http()
      .post(`/aluno/pedidos/${pedido.body.id}/avaliacao`)
      .set(ha)
      .send({ nota: 4, comentario: 'Atendimento rápido' })
      .expect(201);
    const avaliacoes = await ctx.http().get('/autoescola/avaliacoes').set(cfc.h).expect(200);
    expect(avaliacoes.body).toHaveLength(1);
    await ctx
      .http()
      .post(`/autoescola/avaliacoes/${avaliacoes.body[0].id}/resposta`)
      .set(cfc.h)
      .send({ resposta: 'Obrigado pela confiança!' })
      .expect(201);
    const publico = await ctx.http().get(`/publico/autoescolas/${cfc.autoescolaId}`).expect(200);
    expect(publico.body.notaMedia).toBe(4);
    expect(publico.body.avaliacoes[0].resposta).toBe('Obrigado pela confiança!');
  });

  it('autoescola recusa pedido e o aluno vê o motivo', async () => {
    const aluno = await alunoCompleto(ctx);
    const ha = auth(aluno.token);
    const perfil = await ctx.http().get(`/publico/autoescolas/${cfc.autoescolaId}`).expect(200);
    const pedido = await ctx
      .http()
      .post('/aluno/pedidos')
      .set(ha)
      .set('idempotency-key', 'pedido-recusa')
      .send({ pacoteId: perfil.body.pacotes[0].id })
      .expect(201);
    await pagar(ctx, pedido.body.cobranca.id);
    await ctx
      .http()
      .post(`/autoescola/fila/${pedido.body.id}/recusar`)
      .set(cfc.h)
      .send({ motivo: 'Sem vagas para este mês' })
      .expect(201);
    const visto = await ctx.http().get(`/aluno/pedidos/${pedido.body.id}`).set(ha).expect(200);
    expect(visto.body.statusAtendimento).toBe('recusado');
    expect(visto.body.motivoRecusa).toBe('Sem vagas para este mês');
    expect(visto.body.credito?.status ?? 'cancelado').not.toBe('ativo');
  });

  it('aluno cancela pacote ainda não pago; pago não pode ser cancelado assim', async () => {
    const aluno = await alunoCompleto(ctx);
    const ha = auth(aluno.token);
    const perfil = await ctx.http().get(`/publico/autoescolas/${cfc.autoescolaId}`).expect(200);
    const pedido = await ctx
      .http()
      .post('/aluno/pedidos')
      .set(ha)
      .set('idempotency-key', 'pedido-desistencia')
      .send({ pacoteId: perfil.body.pacotes[0].id })
      .expect(201);
    const cancelado = await ctx
      .http()
      .post(`/aluno/pedidos/${pedido.body.id}/cancelar`)
      .set(ha)
      .expect(201);
    expect(cancelado.body.status).toBe('cancelado');
    expect(cancelado.body.cobranca.status).toBe('expirada');
    await ctx.http().post(`/aluno/pedidos/${pedido.body.id}/cancelar`).set(ha).expect(409);
    // outro aluno não cancela o pedido de ninguém
    const outro = await alunoCompleto(ctx);
    await ctx
      .http()
      .post(`/aluno/pedidos/${pedido.body.id}/cancelar`)
      .set(auth(outro.token))
      .expect(404);
  });

  it('chat aluno ↔ autoescola com contagem de não lidas e isolamento', async () => {
    const aluno = await alunoCompleto(ctx);
    const ha = auth(aluno.token);
    // sem relação prévia o aluno ainda pode iniciar conversa com uma autoescola
    const conversa = await ctx
      .http()
      .post('/conversas')
      .set(ha)
      .send({ autoescolaId: cfc.autoescolaId })
      .expect(201);
    await ctx
      .http()
      .post(`/conversas/${conversa.body.id}/mensagens`)
      .set(ha)
      .send({ texto: 'Olá! Vocês têm horário aos sábados?' })
      .expect(201);
    const lista = await ctx
      .http()
      .get('/conversas')
      .query({ como: 'autoescola' })
      .set(cfc.h)
      .expect(200);
    const resumo = lista.body.find((c: { id: string }) => c.id === conversa.body.id);
    expect(resumo.naoLidas).toBe(1);
    const msgs = await ctx
      .http()
      .get(`/conversas/${conversa.body.id}/mensagens`)
      .query({ como: 'autoescola' })
      .set(cfc.h)
      .expect(200);
    expect(msgs.body[0].minha).toBe(false);
    const relida = await ctx
      .http()
      .get('/conversas')
      .query({ como: 'autoescola' })
      .set(cfc.h)
      .expect(200);
    expect(relida.body.find((c: { id: string }) => c.id === conversa.body.id).naoLidas).toBe(0);

    // terceiros não leem a conversa
    const intruso = await alunoCompleto(ctx);
    await ctx
      .http()
      .get(`/conversas/${conversa.body.id}/mensagens`)
      .set(auth(intruso.token))
      .expect(404);
  });

  it('pacote do instrutor libera valor por aula, disputa negada e saque', async () => {
    const hi = auth(instrutor.token);
    const pac = await ctx
      .http()
      .post('/instrutor/pacotes')
      .set(hi)
      .send({ ...PACOTE, nome: 'Pacote instrutor', quantidadeAulas: 2, precoCentavos: 20000 })
      .expect(201);
    const publicos = await ctx
      .http()
      .get(`/publico/instrutores/${instrutor.instrutorId}/pacotes`)
      .expect(200);
    const pacoteId = (pac.body as { id: string; nome: string }[]).find(
      (p) => p.nome === 'Pacote instrutor',
    )!.id;
    expect(publicos.body.map((p: { id: string }) => p.id)).toContain(pacoteId);

    const aluno = await alunoCompleto(ctx);
    const ha = auth(aluno.token);
    const pedido = await ctx
      .http()
      .post('/aluno/pedidos')
      .set(ha)
      .set('idempotency-key', 'pedido-instrutor')
      .send({ pacoteId })
      .expect(201);
    await pagar(ctx, pedido.body.cobranca.id);
    const creditos = await ctx.http().get('/aluno/creditos').set(ha).expect(200);
    const aula = await ctx
      .http()
      .post('/aluno/aulas/com-credito')
      .set(ha)
      .send({
        creditoId: creditos.body[0].id,
        instrutorId: instrutor.instrutorId,
        inicio: horario(6, 11),
        categoria: 'B',
        pontoEncontro: BASE,
        pontoEncontroEndereco: 'Av. Paulista, 100',
      })
      .expect(201);
    const aulaId = aula.body.id as string;
    await ctx.http().post(`/instrutor/aulas/${aulaId}/aceitar`).set(hi).expect(201);

    const agora = Date.now();
    await comAtor(ctx.banco.db, ATOR_SISTEMA, (tx) =>
      tx
        .update(aulas)
        .set({ inicio: new Date(agora + 5 * 60_000), fim: new Date(agora + 55 * 60_000) })
        .where(eq(aulas.id, aulaId)),
    );
    const detalhe = await ctx.http().get(`/aluno/aulas/${aulaId}`).set(ha).expect(200);
    await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/checkin`)
      .set(hi)
      .send({ codigo: detalhe.body.codigoCheckin, local: BASE })
      .expect(201);
    await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/checkout`)
      .set(hi)
      .send({ local: BASE })
      .expect(201);

    // aluno relata problema antes de confirmar
    await ctx
      .http()
      .post(`/aluno/aulas/${aulaId}/disputa`)
      .set(ha)
      .send({ motivo: 'Aula encurtada', descricao: 'O instrutor encerrou 20 minutos antes.' })
      .expect(201);
    await ctx
      .http()
      .post(`/aluno/aulas/${aulaId}/disputa`)
      .set(ha)
      .send({ motivo: 'De novo', descricao: 'Tentando abrir outra disputa.' })
      .expect(409);

    const hadm = auth(admin.token);
    const disputas = await ctx
      .http()
      .get('/admin/disputas')
      .query({ status: 'aberta' })
      .set(hadm)
      .expect(200);
    const disputa = disputas.body.find((d: { d: { aulaId: string } }) => d.d.aulaId === aulaId);
    expect(disputa).toBeDefined();
    // estorno parcial não vale para pacote
    await ctx
      .http()
      .post(`/admin/disputas/${disputa.d.id}/decidir`)
      .set(hadm)
      .send({ decisao: 'estorno_parcial', valorEstornoCentavos: 1000, resolucao: 'Tentativa' })
      .expect(422);
    await ctx
      .http()
      .post(`/admin/disputas/${disputa.d.id}/decidir`)
      .set(hadm)
      .send({ decisao: 'negada', resolucao: 'Registros de check-in/out mostram aula completa' })
      .expect(204);
    const concluida = await ctx.http().get(`/aluno/aulas/${aulaId}`).set(ha).expect(200);
    expect(concluida.body.status).toBe('concluida');

    // 1 de 2 aulas: metade de R$ 200 liberada (menos comissão), metade segue retida
    const fin = await ctx.http().get('/instrutor/financeiro').set(hi).expect(200);
    expect(fin.body.disponivelCentavos).toBeGreaterThan(0);
    expect(fin.body.disponivelCentavos).toBeLessThan(10000);
    expect(fin.body.retidoCentavos).toBeGreaterThanOrEqual(10000);

    await ctx
      .http()
      .post('/instrutor/saques')
      .set(hi)
      .send({ valorCentavos: fin.body.disponivelCentavos })
      .expect(422); // sem chave Pix cadastrada
    await ctx
      .http()
      .put('/instrutor/conta-recebimento')
      .set(hi)
      .send({
        tipoChave: 'email',
        chave: 'instrutor.pix@exemplo.com',
        titularNome: 'Instrutor Teste',
        titularDocumento: instrutor.eu.cpf,
      })
      .expect(200);
    await ctx
      .http()
      .post('/instrutor/saques')
      .set(hi)
      .send({ valorCentavos: fin.body.disponivelCentavos + 100 })
      .expect(422); // acima do saldo
    await ctx
      .http()
      .post('/instrutor/saques')
      .set(hi)
      .send({ valorCentavos: fin.body.disponivelCentavos })
      .expect(201);
    const depois = await ctx.http().get('/instrutor/financeiro').set(hi).expect(200);
    expect(depois.body.disponivelCentavos).toBe(0);
    expect(depois.body.saques[0].status).toBe('solicitado');
    expect(depois.body.contaRecebimento.chaveMascarada).not.toContain('instrutor.pix');
  });

  it('admin: denúncias, bloqueio de usuário e dashboard', async () => {
    const aluno = await alunoCompleto(ctx);
    await ctx
      .http()
      .post('/denuncias')
      .set(auth(aluno.token))
      .send({
        alvoTipo: 'instrutor',
        alvoId: instrutor.instrutorId,
        motivo: 'Comportamento',
        descricao: 'Teste de denúncia',
      })
      .expect(201);
    const hadm = auth(admin.token);
    await ctx.http().get('/admin/denuncias').set(auth(aluno.token)).expect(403);
    const den = await ctx.http().get('/admin/denuncias').set(hadm).expect(200);
    expect(den.body).toHaveLength(1);
    await ctx
      .http()
      .post(`/admin/denuncias/${den.body[0].d.id}/resolver`)
      .set(hadm)
      .send({ status: 'descartada', resolucao: 'Sem evidências' })
      .expect(204);

    const busca = await ctx
      .http()
      .get('/admin/usuarios')
      .query({ busca: aluno.eu.email })
      .set(hadm)
      .expect(200);
    expect(busca.body[0].id).toBe(aluno.eu.id);
    await ctx
      .http()
      .post(`/admin/usuarios/${aluno.eu.id}/bloquear`)
      .set(hadm)
      .send({ motivo: 'Fraude confirmada' })
      .expect(204);
    await ctx
      .http()
      .post('/auth/entrar')
      .send({ login: aluno.eu.email, senha: 'senha-forte-1' })
      .expect((r) => expect([401, 403]).toContain(r.status));
    await ctx
      .http()
      .post(`/admin/usuarios/${aluno.eu.id}/desbloquear`)
      .set(hadm)
      .send({ motivo: 'Revisão do caso' })
      .expect(204);
    await ctx
      .http()
      .post('/auth/entrar')
      .send({ login: aluno.eu.email, senha: 'senha-forte-1' })
      .expect(200);

    const dash = await ctx.http().get('/admin/dashboard').set(hadm).expect(200);
    expect(dash.body.aulasRealizadasMes).toBeGreaterThanOrEqual(1);
    expect(dash.body.faturamentoMesCentavos).toBeGreaterThanOrEqual(100000);
    expect(dash.body.receitaPlataformaMesCentavos).toBeGreaterThan(0);
    expect(dash.body.autoescolasAprovadas).toBeGreaterThanOrEqual(2);

    const audit = await ctx.http().get('/admin/auditoria').set(hadm).expect(200);
    expect(audit.body.cadeiaIntegra).toBe(true);
  });
});
