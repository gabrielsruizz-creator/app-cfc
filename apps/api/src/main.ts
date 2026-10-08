import 'reflect-metadata';
import { carregarEnv } from './carregar-env';
carregarEnv();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { lerConfig } from './config';
import { configurarApp } from './configurar-app';

async function iniciar() {
  const config = lerConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configurarApp(app, config.CORS_ORIGENS, config.PAINEL_DIR);
  // 0.0.0.0 para o celular (Expo Go) conseguir acessar a API pela rede local.
  const porta = config.PORT ?? config.PORTA;
  await app.listen(porta, '0.0.0.0');
  Logger.log(`API ouvindo na porta ${porta} (pagamentos: ${config.PAGAMENTO_GATEWAY})`, 'Volante');
}

void iniciar();
