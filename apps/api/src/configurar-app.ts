import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { FiltroErros } from './nucleo/filtro-erros';

/** Configuração compartilhada entre main.ts e os testes e2e. */
export function configurarApp(app: INestApplication, origensCors = '*') {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1);
  express.useBodyParser('json', { limit: '1mb' });
  app.useGlobalFilters(new FiltroErros());
  app.enableCors({ origin: origensCors === '*' ? true : origensCors.split(',') });
  app.enableShutdownHooks();
}
