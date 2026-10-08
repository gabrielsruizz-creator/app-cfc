import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Qualquer coisa que execute consultas: o banco ou uma transação aberta. */
export type Executor = Db | Tx;

export const PAPEL_APLICACAO = 'volante_app';

export type ConexaoBanco = { pool: Pool; db: Db; encerrar: () => Promise<void> };

/**
 * Cria o pool da aplicação. Toda conexão assume o papel volante_app ao abrir, então
 * as políticas de Row Level Security valem para qualquer consulta, mesmo que alguém
 * esqueça de definir o contexto (nesse caso as tabelas protegidas simplesmente não retornam nada).
 */
export function conectar(urlBanco: string, opcoes: PoolConfig = {}): ConexaoBanco {
  // "-c role=..." aplica o SET ROLE já na abertura da sessão, antes de qualquer consulta.
  const pool = new Pool({
    connectionString: urlBanco,
    max: 10,
    ...opcoes,
    options: `-c role=${PAPEL_APLICACAO}`,
  });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { pool, db, encerrar: () => pool.end() };
}
