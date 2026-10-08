import { Module } from '@nestjs/common';
import { PrivacidadeController } from './privacidade.controller';
import { PrivacidadeService } from './privacidade.service';

@Module({ controllers: [PrivacidadeController], providers: [PrivacidadeService] })
export class PrivacidadeModule {}
