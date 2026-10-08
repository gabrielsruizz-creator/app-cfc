import {
  ATOR_SISTEMA,
  adminsPlataforma,
  aulas,
  cobrancas,
  comAtor,
  eq,
  instrutores,
  registrosAuditoria,
} from '@volante/db';
import { confirmarPagamento } from '@volante/dominio';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, cadastrar, enviarArquivo, iniciarApp, type Contexto } from './apoio';

let ctx: Contexto;
beforeAll(async () => {
  ctx = await iniciarApp();
});
afterAll(async () => {
  await ctx?.app.close();
  await ctx?.banco.destruir();
});

const BASE = { lat: -23.5614, lng: -46.6559 };

async function criarAdmin() {
  const admin = await cadastrar(ctx, 'Admin');
  await ctx.banco.db.insert(adminsPlataforma).values({ usuarioId: admin.eu.id });
  return admin;
}

/** Cadastro completo de instrutor pelo app + aprovação pelo admin. */
async function instrutorAprovado(adminToken: string) {
  const u = await cadastrar(ctx, 'Instrutor');
  const h = auth(u.token);
  const foto = await enviarArquivo(ctx, u.token, 'foto_perfil');
  await ctx
    .http()
    .post('/instrutor/perfil')
    .set(h)
    .send({
      bio: 'Instrutor com 10 anos de experiência em direção defensiva.',
      atuaDesde: 2014,
      categorias: ['B'],
      fotoArquivoId: foto,
    })
    .expect(201);
  await ctx
    .http()
    .put('/instrutor/atendimento')
    .set(h)
    .send({
      precoAulaCentavos: 10000,
      duracaoAulaMin: 50,
      raioAtendimentoKm: 10,
      baseLocalizacao: BASE,
      forneceVeiculo: true,
      aceitaVeiculoAluno: false,
    })
    .expect(200);
  for (const tipo of [
    'cnh',
    'credencial_detran',
    'documento_veiculo',
    'comprovante_residencia',
    'selfie',
  ]) {
    const arquivoId = await enviarArquivo(ctx, u.token, tipo === 'selfie' ? 'selfie' : 'documento');
    await ctx
      .http()
      .post('/instrutor/documentos')
      .set(h)
      .send({
        tipo,
        arquivoId,
        validade: tipo === 'selfie' || tipo === 'comprovante_residencia' ? undefined : '2031-01-01',
      })
      .expect(201);
  }
  await ctx
    .http()
    .post('/instrutor/veiculos')
    .set(h)
    .send({
      placa: `ABC1D${Math.floor(10 + Math.random() * 89)}`,
      marca: 'Fiat',
      modelo: 'Argo',
      ano: 2022,
      cambio: 'manual',
      adaptadoPcd: false,
      categoria: 'B',
    })
    .expect(201);
  await ctx
    .http()
    .put('/instrutor/jornada')
    .set(h)
    .send({
      faixas: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        diaSemana: d,
        horaInicio: '06:00',
        horaFim: '22:00',
      })),
    })
    .expect(200);

  // Disponível antes da aprovação é recusado
  await ctx.http().put('/instrutor/disponibilidade').set(h).send({ disponivel: true }).expect(422);

  const enviado = await ctx.http().post('/instrutor/enviar-analise').set(h).expect(201);
  expect(enviado.body.status).toBe('em_analise');
  const instrutorId = enviado.body.id as string;

  const ha = auth(adminToken);
  // Aprovar sem aprovar documentos é bloqueado
  await ctx.http().post(`/admin/instrutores/${instrutorId}/aprovar`).set(ha).expect(422);
  const det = await ctx.http().get(`/admin/instrutores/${instrutorId}`).set(ha).expect(200);
  for (const d of det.body.documentos) {
    await ctx
      .http()
      .post(`/admin/instrutores/${instrutorId}/documentos/${d.id}/aprovar`)
      .set(ha)
      .expect(201);
  }
  await ctx.http().post(`/admin/instrutores/${instrutorId}/aprovar`).set(ha).expect(201);
  await ctx.http().put('/instrutor/disponibilidade').set(h).send({ disponivel: true }).expect(200);
  return { ...u, instrutorId };
}

async function alunoCompleto() {
  const u = await cadastrar(ctx, 'Aluno');
  const selfie = await enviarArquivo(ctx, u.token, 'selfie');
  const r = await ctx
    .http()
    .post('/aluno/perfil')
    .set(auth(u.token))
    .send({ categoriaDesejada: 'B', selfieArquivoId: selfie })
    .expect(201);
  return { ...u, alunoId: r.body.id as string };
}

function proximoHorario(dias: number, hora: number) {
  return DateTime.now()
    .setZone('America/Sao_Paulo')
    .plus({ days: dias })
    .set({ hour: hora, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toISO();
}

describe('Fase 1 — fluxo completo pela API', () => {
  let admin: Awaited<ReturnType<typeof criarAdmin>>;
  let instrutor: Awaited<ReturnType<typeof instrutorAprovado>>;

  beforeAll(async () => {
    admin = await criarAdmin();
    instrutor = await instrutorAprovado(admin.token);
  });

  it('login por e-mail ou CPF, renovação de sessão e reuso de refresh token bloqueado', async () => {
    const u = await cadastrar(ctx, 'Login');
    const porCpf = await ctx
      .http()
      .post('/auth/entrar')
      .send({ login: u.eu.cpf, senha: 'senha-forte-1' })
      .expect(200);
    expect(porCpf.body.eu.id).toBe(u.eu.id);
    await ctx.http().post('/auth/entrar').send({ login: u.eu.email, senha: 'errada' }).expect(401);

    const renovada = await ctx
      .http()
      .post('/auth/renovar')
      .send({ refreshToken: u.refresh })
      .expect(200);
    // reusar o token antigo derruba a família inteira de sessões
    await ctx.http().post('/auth/renovar').send({ refreshToken: u.refresh }).expect(401);
    await ctx
      .http()
      .post('/auth/renovar')
      .send({ refreshToken: renovada.body.tokens.refreshToken })
      .expect(401);
  });

  it('busca no mapa encontra o instrutor aprovado com filtros', async () => {
    const r = await ctx
      .http()
      .get('/publico/instrutores')
      .query({ ...BASE, categoria: 'B', cambio: 'manual' })
      .expect(200);
    const card = r.body.find((c: { id: string }) => c.id === instrutor.instrutorId);
    expect(card).toBeDefined();
    expect(card.credencialVerificada).toBe(true);
    const automatico = await ctx
      .http()
      .get('/publico/instrutores')
      .query({ ...BASE, cambio: 'automatico' })
      .expect(200);
    expect(
      automatico.body.find((c: { id: string }) => c.id === instrutor.instrutorId),
    ).toBeUndefined();
    const longe = await ctx
      .http()
      .get('/publico/instrutores')
      .query({ lat: -22.9, lng: -43.2 })
      .expect(200);
    expect(longe.body.find((c: { id: string }) => c.id === instrutor.instrutorId)).toBeUndefined();
  });

  it('agenda, paga, aceita, faz check-in/out, confirma e avalia', async () => {
    const aluno = await alunoCompleto();
    const ha = auth(aluno.token);
    const hi = auth(instrutor.token);
    const inicio = proximoHorario(3, 10);

    const horarios = await ctx
      .http()
      .get(`/publico/instrutores/${instrutor.instrutorId}/horarios`)
      .query({ data: DateTime.fromISO(inicio!).setZone('America/Sao_Paulo').toISODate() })
      .expect(200);
    expect(
      horarios.body.map((h: { inicio: string }) => new Date(h.inicio).toISOString()),
    ).toContain(new Date(inicio!).toISOString());

    const pedido = {
      instrutorId: instrutor.instrutorId,
      inicio,
      categoria: 'B',
      pontoEncontro: { lat: -23.56, lng: -46.65 },
      pontoEncontroEndereco: 'Av. Paulista, 1000',
    };
    await ctx.http().post('/aluno/aulas').set(ha).send(pedido).expect(400); // sem Idempotency-Key
    const criada = await ctx
      .http()
      .post('/aluno/aulas')
      .set(ha)
      .set('idempotency-key', 'chave-aula-1')
      .send(pedido)
      .expect(201);
    // repetir com a mesma chave devolve a mesma aula (sem cobrar duas vezes)
    const repetida = await ctx
      .http()
      .post('/aluno/aulas')
      .set(ha)
      .set('idempotency-key', 'chave-aula-1')
      .send(pedido)
      .expect(201);
    expect(repetida.body.id).toBe(criada.body.id);
    const aulaId = criada.body.id as string;
    expect(criada.body.status).toBe('aguardando_pagamento');
    expect(criada.body.codigoCheckin).toMatch(/^\d{4}$/);

    // outro aluno não consegue o mesmo horário
    const outro = await alunoCompleto();
    await ctx
      .http()
      .post('/aluno/aulas')
      .set(auth(outro.token))
      .set('idempotency-key', 'chave-outro-1')
      .send(pedido)
      .expect(409);
    // nem ver a aula de outra pessoa
    await ctx.http().get(`/aluno/aulas/${aulaId}`).set(auth(outro.token)).expect(404);

    // pagamento (o worker faria isso ao receber o webhook)
    await comAtor(ctx.banco.db, ATOR_SISTEMA, async (tx) => {
      await tx
        .update(cobrancas)
        .set({ gatewayCobrancaId: `sim_${aulaId}`, status: 'aguardando_pagamento' })
        .where(eq(cobrancas.id, criada.body.cobranca.id));
      await confirmarPagamento(tx, criada.body.cobranca.id);
    });

    const solicitacoes = await ctx.http().get('/instrutor/solicitacoes').set(hi).expect(200);
    expect(solicitacoes.body.map((s: { id: string }) => s.id)).toContain(aulaId);
    const vistaInstrutor = await ctx.http().get(`/instrutor/aulas/${aulaId}`).set(hi).expect(200);
    expect(vistaInstrutor.body.codigoCheckin).toBeNull(); // o código é só do aluno

    await ctx.http().post(`/instrutor/aulas/${aulaId}/aceitar`).set(hi).expect(201);

    // trazemos a aula para "agora" para testar o check-in
    const agora = new Date();
    await comAtor(ctx.banco.db, ATOR_SISTEMA, (tx) =>
      tx
        .update(aulas)
        .set({
          inicio: new Date(agora.getTime() + 5 * 60_000),
          fim: new Date(agora.getTime() + 55 * 60_000),
        })
        .where(eq(aulas.id, aulaId)),
    );
    await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/checkin`)
      .set(hi)
      .send({
        codigo: criada.body.codigoCheckin === '0000' ? '1111' : '0000',
        local: { lat: -23.56, lng: -46.65 },
      })
      .expect(400);
    const longe = await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/checkin`)
      .set(hi)
      .send({ codigo: criada.body.codigoCheckin, local: { lat: -23.6, lng: -46.7 } })
      .expect(422);
    expect(longe.body.codigo).toBe('longe_do_ponto');
    const emAndamento = await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/checkin`)
      .set(hi)
      .send({ codigo: criada.body.codigoCheckin, local: { lat: -23.5601, lng: -46.6501 } })
      .expect(201);
    expect(emAndamento.body.status).toBe('em_andamento');

    const habilidades = await ctx.http().get('/publico/habilidades').expect(200);
    await ctx
      .http()
      .put(`/instrutor/aulas/${aulaId}/evolucao`)
      .set(hi)
      .send({
        registros: [{ habilidadeId: habilidades.body[3].id, nivel: 3 }],
        anotacao: 'Boa evolução na baliza.',
      })
      .expect(200);

    await ctx
      .http()
      .post(`/instrutor/aulas/${aulaId}/checkout`)
      .set(hi)
      .send({ local: { lat: -23.57, lng: -46.66 } })
      .expect(201);
    const concluida = await ctx
      .http()
      .post(`/aluno/aulas/${aulaId}/confirmar-fim`)
      .set(ha)
      .expect(201);
    expect(concluida.body.status).toBe('concluida');

    await ctx
      .http()
      .post(`/aluno/aulas/${aulaId}/avaliacao`)
      .set(ha)
      .send({ nota: 5, comentario: 'Excelente!' })
      .expect(201);
    await ctx.http().post(`/aluno/aulas/${aulaId}/avaliacao`).set(ha).send({ nota: 1 }).expect(409);

    const perfil = await ctx
      .http()
      .get(`/publico/instrutores/${instrutor.instrutorId}`)
      .expect(200);
    expect(perfil.body.notaMedia).toBe(5);
    expect(perfil.body.avaliacoes[0].comentario).toBe('Excelente!');

    const evolucao = await ctx.http().get('/aluno/evolucao').set(ha).expect(200);
    expect(evolucao.body.aulasConcluidas).toBe(1);
    expect(evolucao.body.horasAcumuladasMin).toBe(50);
    expect(evolucao.body.habilidades[0].nivelAtual).toBe(3);

    const recibos = await ctx.http().get('/aluno/recibos').set(ha).expect(200);
    expect(recibos.body).toHaveLength(1);
  });

  it('cancelamento grátis antes do prazo e prévia da regra', async () => {
    const aluno = await alunoCompleto();
    const ha = auth(aluno.token);
    const criada = await ctx
      .http()
      .post('/aluno/aulas')
      .set(ha)
      .set('idempotency-key', 'chave-cancelar-1')
      .send({
        instrutorId: instrutor.instrutorId,
        inicio: proximoHorario(5, 15),
        categoria: 'B',
        pontoEncontro: BASE,
        pontoEncontroEndereco: 'Rua A',
      })
      .expect(201);
    await comAtor(ctx.banco.db, ATOR_SISTEMA, async (tx) => {
      await tx
        .update(cobrancas)
        .set({ gatewayCobrancaId: `sim_${criada.body.id}` })
        .where(eq(cobrancas.id, criada.body.cobranca.id));
      await confirmarPagamento(tx, criada.body.cobranca.id);
    });
    const previa = await ctx
      .http()
      .get(`/aluno/aulas/${criada.body.id}/cancelamento`)
      .set(ha)
      .expect(200);
    expect(previa.body).toMatchObject({
      gratuito: true,
      multaCentavos: 0,
      reembolsoCentavos: 10000,
    });
    const cancelada = await ctx
      .http()
      .post(`/aluno/aulas/${criada.body.id}/cancelar`)
      .set(ha)
      .send({ motivo: 'Imprevisto' })
      .expect(201);
    expect(cancelada.body.status).toBe('cancelada');
  });

  it('admin altera comissão com auditoria; usuário comum não acessa o admin', async () => {
    const comum = await cadastrar(ctx, 'Comum');
    await ctx.http().get('/admin/comissoes').set(auth(comum.token)).expect(403);
    await ctx
      .http()
      .post('/admin/comissoes')
      .set(auth(admin.token))
      .send({
        vendedorTipo: 'instrutor',
        produtoTipo: 'aula_avulsa',
        percentualBp: 1800,
        motivo: 'Reajuste de teste',
      })
      .expect(201);
    const registros = await ctx.banco.db
      .select()
      .from(registrosAuditoria)
      .where(eq(registrosAuditoria.acao, 'comissao.alterada'));
    expect(registros.length).toBeGreaterThan(0);
    const audit = await ctx.http().get('/admin/auditoria').set(auth(admin.token)).expect(200);
    expect(audit.body.cadeiaIntegra).toBe(true);
  });

  it('autoescola: cadastro, isolamento e integração CFC Plus "em breve"', async () => {
    const dono = await cadastrar(ctx, 'Dono');
    const r = await ctx
      .http()
      .post('/autoescolas')
      .set(auth(dono.token))
      .send({
        razaoSocial: 'Autoescola Exemplo LTDA',
        nomeFantasia: 'Autoescola Exemplo',
        cnpj: '11.222.333/0001-81',
        credenciamentoDetran: 'CFC-123',
        telefone: '11999990000',
        whatsapp: '11999990000',
        email: 'contato@exemplo.com',
        cep: '01310-100',
        logradouro: 'Av. Paulista',
        numero: '100',
        bairro: 'Bela Vista',
        municipio: 'São Paulo',
        uf: 'SP',
        localizacao: BASE,
        aceitouTermoAutoescola: true,
      })
      .expect(201);
    const autoescolaId = r.body.autoescola.id as string;
    expect(r.body.autoescola.status).toBe('rascunho');
    expect(r.body.pendencias.length).toBe(4);

    const integracoes = await ctx
      .http()
      .get('/autoescola/integracoes')
      .set(auth(dono.token))
      .set('x-autoescola-id', autoescolaId)
      .expect(200);
    expect(integracoes.body).toEqual([
      expect.objectContaining({ sistema: 'cfc_plus', status: 'em_breve' }),
    ]);

    const intruso = await cadastrar(ctx, 'Intruso');
    await ctx
      .http()
      .get('/autoescola/painel')
      .set(auth(intruso.token))
      .set('x-autoescola-id', autoescolaId)
      .expect(403);
  });

  it('exclusão de conta anonimiza os dados (LGPD)', async () => {
    const u = await cadastrar(ctx, 'Saindo');
    await ctx
      .http()
      .post('/privacidade/exclusao')
      .set(auth(u.token))
      .send({ confirmacao: 'EXCLUIR' })
      .expect(201);
    await ctx.http().get('/eu').set(auth(u.token)).expect(401);
    await ctx
      .http()
      .post('/auth/entrar')
      .send({ login: u.eu.email, senha: 'senha-forte-1' })
      .expect(401);
  });

  it('instrutor suspenso some da busca', async () => {
    await ctx.banco.db
      .update(instrutores)
      .set({ status: 'suspenso_documento' })
      .where(eq(instrutores.id, instrutor.instrutorId));
    const r = await ctx.http().get('/publico/instrutores').query(BASE).expect(200);
    expect(r.body.find((c: { id: string }) => c.id === instrutor.instrutorId)).toBeUndefined();
    await ctx.banco.db
      .update(instrutores)
      .set({ status: 'aprovado' })
      .where(eq(instrutores.id, instrutor.instrutorId));
  });
});
