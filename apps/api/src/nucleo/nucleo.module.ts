import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { conectarAplicacao } from '@volante/db';
import { CONFIG, lerConfig, type Config } from '../config';
import { ArmazenamentoLocal } from './armazenamento';
import { AutenticacaoGuard } from './auth/autenticacao.guard';
import { TokensService } from './auth/tokens.service';
import { BancoService } from './banco.service';
import { ARMAZENAMENTO, BANCO } from './tokens';

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => lerConfig() },
    {
      provide: BANCO,
      inject: [CONFIG],
      useFactory: (c: Config) => conectarAplicacao(c.DATABASE_URL),
    },
    {
      provide: ARMAZENAMENTO,
      inject: [CONFIG],
      useFactory: (c: Config) => new ArmazenamentoLocal(c.ARMAZENAMENTO_DIR),
    },
    BancoService,
    TokensService,
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
  ],
  exports: [CONFIG, BANCO, ARMAZENAMENTO, BancoService, TokensService],
})
export class NucleoModule {}
