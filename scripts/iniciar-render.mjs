// Ambiente de testes no Render (plano gratuito): um único serviço roda migrações,
// sementes de demonstração, a API e o worker. API e worker continuam processos separados.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const env = {
  ...process.env,
  // Mesma pasta para a API e para os arquivos de demonstração criados pela semente.
  ARMAZENAMENTO_DIR: process.env.ARMAZENAMENTO_DIR ?? path.join(raiz, 'apps/api/.armazenamento'),
};

function etapa(nome, args) {
  console.log(`[render] ${nome}...`);
  const r = spawnSync('pnpm', args, { cwd: raiz, env, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[render] falhou: ${nome}`);
    process.exit(r.status ?? 1);
  }
}

etapa('migrações', ['db:migrar']);
etapa('dados de demonstração', ['db:semear', '--', '--demo']);

const processos = [
  spawn('node', ['--enable-source-maps', 'apps/api/dist/main.js'], {
    cwd: raiz,
    env,
    stdio: 'inherit',
  }),
  spawn('node', ['--enable-source-maps', 'apps/worker/dist/main.js'], {
    cwd: raiz,
    env,
    stdio: 'inherit',
  }),
];

for (const p of processos) {
  p.on('exit', (codigo) => {
    console.error(
      `[render] processo ${p.spawnargs.join(' ')} terminou (${codigo}); encerrando o serviço`,
    );
    for (const outro of processos) outro.kill('SIGTERM');
    process.exit(codigo ?? 1);
  });
}
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => processos.forEach((p) => p.kill(sinal)));
}
