import { Module } from '@nestjs/common';
import { AutoescolasController } from './autoescolas.controller';
import { AutoescolasService } from './autoescolas.service';

@Module({ controllers: [AutoescolasController], providers: [AutoescolasService] })
export class AutoescolasModule {}
