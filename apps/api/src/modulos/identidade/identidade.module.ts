import { Module } from '@nestjs/common';
import { IdentidadeController } from './identidade.controller';
import { IdentidadeService } from './identidade.service';

@Module({
  controllers: [IdentidadeController],
  providers: [IdentidadeService],
  exports: [IdentidadeService],
})
export class IdentidadeModule {}
