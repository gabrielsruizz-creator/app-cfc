import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Em produção de testes o painel é servido pela API em /painel/.
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: 5173,
    // Acessível na rede local: o link "acompanhar aula" abre no celular do contato.
    host: true,
    // Em desenvolvimento, /api é encaminhado para a API local.
    proxy: { '/api': { target: 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
