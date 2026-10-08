import { sql } from 'drizzle-orm';
import type { Db, Tx } from './cliente';

export type TipoAtor = 'aluno' | 'instrutor' | 'autoescola' | 'admin' | 'sistema' | 'anonimo';

export type Ator = {
  tipo: TipoAtor;
  usuarioId?: string | null;
  alunoId?: string | null;
  instrutorId?: string | null;
  autoescolaId?: string | null;
};

export const ATOR_SISTEMA: Ator = { tipo: 'sistema' };
export const ATOR_ANONIMO: Ator = { tipo: 'anonimo' };

/** Define o contexto usado pelas políticas de RLS. Vale só até o fim da transação. */
export async function definirContexto(tx: Tx, ator: Ator): Promise<void> {
  await tx.execute(sql`
    select
      set_config('app.ator_tipo', ${ator.tipo}, true),
      set_config('app.usuario_id', ${ator.usuarioId ?? ''}, true),
      set_config('app.aluno_id', ${ator.alunoId ?? ''}, true),
      set_config('app.instrutor_id', ${ator.instrutorId ?? ''}, true),
      set_config('app.autoescola_id', ${ator.autoescolaId ?? ''}, true)
  `);
}

/**
 * Executa `fn` numa transação com o contexto do ator. É a única forma correta de
 * acessar tabelas protegidas por RLS.
 */
export async function comAtor<T>(db: Db, ator: Ator, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await definirContexto(tx, ator);
    return fn(tx);
  });
}

/**
 * Executa `fn` como sistema dentro da transação atual e depois restaura o ator anterior.
 * Para regras de domínio que precisam ler dados que o ator não vê (ex.: validar um cupom),
 * sempre depois de a autorização já ter sido verificada.
 */
export async function comoSistema<T>(tx: Tx, fn: () => Promise<T>): Promise<T> {
  const chaves = ['ator_tipo', 'usuario_id', 'aluno_id', 'instrutor_id', 'autoescola_id'] as const;
  const resultado = await tx.execute(sql`
    select ${sql.join(
      chaves.map((c) => sql`coalesce(current_setting(${'app.' + c}, true), '') as ${sql.raw(c)}`),
      sql`, `,
    )}
  `);
  const antes = (resultado.rows[0] ?? {}) as Record<(typeof chaves)[number], string>;
  await definirContexto(tx, ATOR_SISTEMA);
  try {
    return await fn();
  } finally {
    await tx.execute(sql`
      select ${sql.join(
        chaves.map((c) => sql`set_config(${'app.' + c}, ${antes[c] ?? ''}, true)`),
        sql`, `,
      )}
    `);
  }
}
