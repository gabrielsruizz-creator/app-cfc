import { Module } from '@nestjs/common';
import { PromocoesController } from './promocoes.controller';
import { PromocoesService } from './promocoes.service';

@Module({ controllers: [PromocoesController], providers: [PromocoesService] })
export class PromocoesModule {}
