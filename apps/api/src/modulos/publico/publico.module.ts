import { Module } from '@nestjs/common';
import { PublicoController } from './publico.controller';
import { PublicoService } from './publico.service';

@Module({
  controllers: [PublicoController],
  providers: [PublicoService],
  exports: [PublicoService],
})
export class PublicoModule {}
