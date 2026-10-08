import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './modulos/admin/admin.module';
import { ArquivosModule } from './modulos/arquivos/arquivos.module';
import { AulasModule } from './modulos/aulas/aulas.module';
import { AutoescolasModule } from './modulos/autoescolas/autoescolas.module';
import { IdentidadeModule } from './modulos/identidade/identidade.module';
import { InstrutoresModule } from './modulos/instrutores/instrutores.module';
import { NotificacoesModule } from './modulos/notificacoes/notificacoes.module';
import { PagamentosModule } from './modulos/pagamentos/pagamentos.module';
import { PrivacidadeModule } from './modulos/privacidade/privacidade.module';
import { PublicoModule } from './modulos/publico/publico.module';
import { NucleoModule } from './nucleo/nucleo.module';
import { SaudeController } from './saude.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    NucleoModule,
    ArquivosModule,
    IdentidadeModule,
    PublicoModule,
    InstrutoresModule,
    AulasModule,
    PagamentosModule,
    AutoescolasModule,
    AdminModule,
    PrivacidadeModule,
    NotificacoesModule,
  ],
  controllers: [SaudeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
