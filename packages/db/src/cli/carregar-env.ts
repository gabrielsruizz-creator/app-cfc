import { existsSync } from 'node:fs';
import path from 'node:path';

/** Carrega o .env da raiz do monorepo, se existir (variáveis já definidas no ambiente têm prioridade). */
export function carregarEnv(): void {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const arquivo = path.join(dir, '.env');
    if (existsSync(arquivo) && existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      process.loadEnvFile(arquivo);
      return;
    }
    dir = path.dirname(dir);
  }
}
