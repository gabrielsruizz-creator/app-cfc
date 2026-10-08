import { Module } from '@nestjs/common';
import { PagamentosController } from './pagamentos.controller';

@Module({ controllers: [PagamentosController] })
export class PagamentosModule {}
