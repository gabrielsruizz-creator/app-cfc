import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { lerConfig } from './config';
import { configurarApp } from './configurar-app';

async function iniciar() {
  const config = lerConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configurarApp(app, config.CORS_ORIGENS);
  // 0.0.0.0 para o celular (Expo Go) conseguir acessar a API pela rede local.
  await app.listen(config.PORTA, '0.0.0.0');
  Logger.log(`API ouvindo na porta ${config.PORTA} (pagamentos: ${config.PAGAMENTO_GATEWAY})`, 'Volante');
}

void iniciar();
