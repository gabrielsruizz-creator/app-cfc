import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  comAtor,
  conectarAplicacao,
  fabricarAluno,
  fabricarAutoescola,
  migrar,
  semearBase,
  type ConexaoBanco,
  autoescolas,
} from '../src';

/**
 * Simula um Postgres gerenciado (ex.: Render) em que o usuário do banco não pode criar papéis:
 * as migrações devem forçar o RLS para o dono das tabelas e a aplicação conectar sem SET ROLE.
 */
const urlAdmin =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const nome = `volante_sem_papel_${Date.now()}`;
const usuario = `dono_sem_papel_${Date.now()}`;
let conexao: ConexaoBanco & { usandoPapel: boolean };

async function comoAdmin(sql: string, banco?: string) {
  const url = new URL(urlAdmin);
  if (banco) url.pathname = `/${banco}`;
  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  await comoAdmin(`CREATE ROLE ${usuario} LOGIN PASSWORD 'senha' NOCREATEROLE`);
  await comoAdmin(`CREATE DATABASE ${nome} OWNER ${usuario}`);
  await comoAdmin('CREATE EXTENSION postgis; CREATE EXTENSION btree_gist;', nome);
  const url = new URL(urlAdmin);
  url.username = usuario;
  url.password = 'senha';
  url.pathname = `/${nome}`;
  await migrar(url.toString());
  conexao = await conectarAplicacao(url.toString());
  await semearBase(conexao.db);
});

afterAll(async () => {
  await conexao?.encerrar();
  await comoAdmin(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
  await comoAdmin(`DROP ROLE IF EXISTS ${usuario}`);
});

describe('banco sem permissão para criar papéis', () => {
  it('conecta sem o papel e mantém o isolamento entre autoescolas', async () => {
    expect(conexao.usandoPapel).toBe(false);
    const { autoescola: a } = await fabricarAutoescola(conexao.db, { status: 'em_analise' });
    const { autoescola: b } = await fabricarAutoescola(conexao.db, { status: 'em_analise' });
    await fabricarAluno(conexao.db);

    // sem contexto, nada aparece (mesmo sendo o dono das tabelas)
    expect(await conexao.db.select().from(autoescolas)).toHaveLength(0);

    const vistas = await comAtor(conexao.db, { tipo: 'autoescola', autoescolaId: a.id }, (tx) =>
      tx.select({ id: autoescolas.id }).from(autoescolas),
    );
    expect(vistas.map((v) => v.id)).toEqual([a.id]);
    expect(vistas.map((v) => v.id)).not.toContain(b.id);
  });
});
