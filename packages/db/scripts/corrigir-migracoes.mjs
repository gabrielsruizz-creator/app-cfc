// O drizzle-kit coloca aspas em tipos personalizados com parâmetros ("geography(Point,4326)"),
// o que o Postgres não aceita. Este script corrige as migrações geradas.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../migracoes/', import.meta.url).pathname;
for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
  const caminho = join(dir, arquivo);
  const original = readFileSync(caminho, 'utf8');
  const corrigido = original.replaceAll('"geography(Point,4326)"', 'geography(Point,4326)');
  if (corrigido !== original) {
    writeFileSync(caminho, corrigido);
    console.log(`corrigido: ${arquivo}`);
  }
}
