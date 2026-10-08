import { Module } from '@nestjs/common';
import { AulasModule } from '../aulas/aulas.module';
import { ComercialController } from './comercial.controller';
import { ComercialService } from './comercial.service';

@Module({
  imports: [AulasModule],
  controllers: [ComercialController],
  providers: [ComercialService],
  exports: [ComercialService],
})
export class ComercialModule {}
