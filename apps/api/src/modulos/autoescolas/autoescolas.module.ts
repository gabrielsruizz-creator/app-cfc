import { Module } from '@nestjs/common';
import { AulasModule } from '../aulas/aulas.module';
import { ComercialModule } from '../comercial/comercial.module';
import { AutoescolasController } from './autoescolas.controller';
import { AutoescolasService } from './autoescolas.service';
import { PainelAutoescolaController } from './painel.controller';
import { PainelAutoescolaService } from './painel.service';

@Module({
  imports: [AulasModule, ComercialModule],
  controllers: [AutoescolasController, PainelAutoescolaController],
  providers: [AutoescolasService, PainelAutoescolaService],
})
export class AutoescolasModule {}
