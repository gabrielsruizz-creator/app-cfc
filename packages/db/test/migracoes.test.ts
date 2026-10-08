import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBancoTeste, type BancoTeste } from '../src';

let banco: BancoTeste;
beforeAll(async () => {
  banco = await criarBancoTeste();
});
afterAll(async () => banco?.destruir());

describe('migrações', () => {
  it('cria as tabelas e conecta com o papel da aplicação', async () => {
    const r = await banco.pool.query('select current_user as usuario');
    expect(r.rows[0].usuario).toBe('volante_app');
    const t = await banco.pool.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    expect(t.rows[0].n).toBeGreaterThan(30);
  });
});
