import { sql, type SQL } from 'drizzle-orm';
import { check, type AnyPgColumn } from 'drizzle-orm/pg-core';

/** CHECK que restringe uma coluna text aos valores de um enum dos contratos. */
export function checkValores(nome: string, coluna: AnyPgColumn, valores: readonly string[]) {
  const lista = sql.join(
    valores.map((v) => sql.raw(`'${v.replace(/'/g, "''")}'`)),
    sql.raw(', '),
  );
  return check(nome, sql`${coluna} in (${lista})` as SQL);
}
