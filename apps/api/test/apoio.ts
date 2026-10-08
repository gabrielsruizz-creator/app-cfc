import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  adminsPlataforma,
  ATOR_SISTEMA,
  autoescolas,
  cobrancas,
  comAtor,
  criarBancoTeste,
  eq,
  semearBase,
  type BancoTeste,
} from '@volante/db';
import { confirmarPagamento } from '@volante/dominio';
import { expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, lerConfig } from '../src/config';
import { configurarApp } from '../src/configurar-app';

export type Contexto = {
  app: INestApplication;
  banco: BancoTeste;
  http: () => ReturnType<typeof request>;
};

export async function iniciarApp(): Promise<Contexto> {
  const banco = await criarBancoTeste();
  await semearBase(banco.db);
  const dir = await mkdtemp(path.join(tmpdir(), 'volante-arquivos-'));
  const config = lerConfig({
    NODE_ENV: 'test',
    DATABASE_URL: banco.url,
    PAGAMENTO_GATEWAY: 'simulado',
    ARMAZENAMENTO_DIR: dir,
  } as NodeJS.ProcessEnv);
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIG)
    .useValue(config)
    .compile();
  const app = modulo.createNestApplication({ bodyParser: false });
  configurarApp(app);
  await app.init();
  return { app, banco, http: () => request(app.getHttpServer()) };
}

let contador = 0;

/** CPF válido aleatório para cadastros de teste. */
export function cpfValidoAleatorio(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (nums: number[], peso: number) => {
    const r = (nums.reduce((acc, n, i) => acc + n * (peso - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base, 10);
  return [...base, d1, dv([...base, d1], 11)].join('');
}

export async function cadastrar(ctx: Contexto, nome = 'Pessoa') {
  contador++;
  const sufixo = `${Date.now()}${contador}`;
  const r = await ctx
    .http()
    .post('/auth/cadastro')
    .send({
      nome: `${nome} Teste`,
      cpf: cpfValidoAleatorio(),
      email: `${nome.toLowerCase()}${sufixo}@teste.com`,
      telefone: `11${String(900000000 + Number(sufixo.slice(-8))).slice(0, 9)}`,
      senha: 'senha-forte-1',
      aceitouTermos: true,
      aceitouPrivacidade: true,
    })
    .expect(201);
  return {
    token: r.body.tokens.accessToken as string,
    refresh: r.body.tokens.refreshToken as string,
    eu: r.body.eu,
  };
}

export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export async function enviarArquivo(ctx: Contexto, token: string, finalidade: string) {
  const r = await ctx
    .http()
    .post('/arquivos')
    .set('authorization', `Bearer ${token}`)
    .field('finalidade', finalidade)
    .attach('arquivo', PNG_1PX, { filename: 'foto.png', contentType: 'image/png' })
    .expect(201);
  return r.body.id as string;
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export const BASE = { lat: -23.5614, lng: -46.6559 };

export async function criarAdmin(ctx: Contexto) {
  const admin = await cadastrar(ctx, 'Admin');
  await ctx.banco.db.insert(adminsPlataforma).values({ usuarioId: admin.eu.id });
  return admin;
}

/** Cadastro completo de instrutor pelo app + aprovação pelo admin. */
export async function instrutorAprovado(ctx: Contexto, adminToken: string) {
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

export async function alunoCompleto(ctx: Contexto) {
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

/** Simula o webhook do gateway (o worker faria isso). */
export async function pagar(ctx: Contexto, cobrancaId: string) {
  await comAtor(ctx.banco.db, ATOR_SISTEMA, async (tx) => {
    await tx
      .update(cobrancas)
      .set({ gatewayCobrancaId: `sim_${cobrancaId}` })
      .where(eq(cobrancas.id, cobrancaId));
    await confirmarPagamento(tx, cobrancaId);
  });
}

let cnpjSeq = 0;
function cnpjValido() {
  cnpjSeq++;
  const base = `${String(Date.now()).slice(-8)}000${cnpjSeq}`.slice(-12).split('').map(Number);
  const dv = (nums: number[]) => {
    const pesos =
      nums.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = nums.reduce((acc, n, i) => acc + n * pesos[i]!, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join('');
}

export async function autoescolaAprovada(ctx: Contexto, nome: string) {
  const dono = await cadastrar(ctx, 'Dono');
  const r = await ctx
    .http()
    .post('/autoescolas')
    .set(auth(dono.token))
    .send({
      razaoSocial: `${nome} LTDA`,
      nomeFantasia: nome,
      cnpj: cnpjValido(),
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
  await comAtor(ctx.banco.db, ATOR_SISTEMA, (tx) =>
    tx.update(autoescolas).set({ status: 'aprovada' }).where(eq(autoescolas.id, autoescolaId)),
  );
  const h = { ...auth(dono.token), 'x-autoescola-id': autoescolaId };
  return { ...dono, autoescolaId, h };
}
