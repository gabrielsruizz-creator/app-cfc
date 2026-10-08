import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC é necessário para os metadados de decorators usados pela injeção de dependências do NestJS.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { testTimeout: 30000, hookTimeout: 60000, fileParallelism: true },
});
