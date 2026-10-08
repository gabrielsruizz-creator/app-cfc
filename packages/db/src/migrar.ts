import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { Client } from 'pg';

/** Extensões que precisam existir antes das migrações (tipos usados nas tabelas). */
const PRE_MIGRACAO = `
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS btree_gist;
`;

export function pastaMigracoes(): string {
  // Funciona tanto a partir de src/ (tsx, vitest) quanto de dist/ (build).
  return path.resolve(__dirname, '..', 'migracoes');
}

/**
 * Aplica as migrações usando uma conexão de dono (sem SET ROLE).
 * Não use a conexão da aplicação para isso.
 */
export async function migrar(urlBanco: string): Promise<void> {
  const cliente = new Client({ connectionString: urlBanco });
  await cliente.connect();
  try {
    await cliente.query(PRE_MIGRACAO);
    await migrate(drizzle(cliente), { migrationsFolder: pastaMigracoes() });
  } finally {
    await cliente.end();
  }
}
