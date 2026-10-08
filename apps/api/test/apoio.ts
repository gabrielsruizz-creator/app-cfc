import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { criarBancoTeste, semearBase, type BancoTeste } from '@volante/db';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, lerConfig } from '../src/config';
import { configurarApp } from '../src/configurar-app';

export type Contexto = { app: INestApplication; banco: BancoTeste; http: () => ReturnType<typeof request> };

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
  return { token: r.body.tokens.accessToken as string, refresh: r.body.tokens.refreshToken as string, eu: r.body.eu };
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
