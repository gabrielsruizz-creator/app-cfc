import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { FiltroErros } from './nucleo/filtro-erros';

/**
 * Serve o painel web já compilado em /painel (usado no ambiente de testes do Render,
 * para painel e API ficarem no mesmo endereço).
 */
function servirPainel(app: NestExpressApplication, pasta: string) {
  const dir = path.resolve(pasta);
  if (!existsSync(path.join(dir, 'index.html'))) return;
  const servidor = app.getHttpAdapter().getInstance() as express.Express;
  servidor.use('/painel', express.static(dir, { index: false, maxAge: '1h' }));
  servidor.get(/^\/painel(\/.*)?$/, (_req, res) => res.sendFile(path.join(dir, 'index.html')));
  servidor.get('/', (_req, res) => res.redirect('/painel/'));
}

/** Configuração compartilhada entre main.ts e os testes e2e. */
export function configurarApp(app: INestApplication, origensCors = '*', pastaPainel?: string) {
  const expressApp = app as NestExpressApplication;
  expressApp.set('trust proxy', 1);
  expressApp.useBodyParser('json', { limit: '1mb' });
  if (pastaPainel) servirPainel(expressApp, pastaPainel);
  app.useGlobalFilters(new FiltroErros());
  app.enableCors({ origin: origensCors === '*' ? true : origensCors.split(',') });
  app.enableShutdownHooks();
}
