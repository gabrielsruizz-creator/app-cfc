import { Client } from 'pg';
import { conectar, type ConexaoBanco } from './cliente';
import { migrar } from './migrar';

export type BancoTeste = ConexaoBanco & { url: string; destruir: () => Promise<void> };

/**
 * Cria um banco PostgreSQL novo e migrado para um arquivo de teste.
 * Usa TEST_DATABASE_URL (padrão: postgres://postgres:postgres@localhost:5432/postgres).
 */
export async function criarBancoTeste(): Promise<BancoTeste> {
  const urlAdmin =
    process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
  const nome = `volante_teste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new Client({ connectionString: urlAdmin });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nome}`);
  await admin.end();

  const url = new URL(urlAdmin);
  url.pathname = `/${nome}`;
  await migrar(url.toString());
  const conexao = conectar(url.toString(), { max: 5 });

  return {
    ...conexao,
    url: url.toString(),
    destruir: async () => {
      await conexao.encerrar();
      const c = new Client({ connectionString: urlAdmin });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      await c.end();
    },
  };
}
