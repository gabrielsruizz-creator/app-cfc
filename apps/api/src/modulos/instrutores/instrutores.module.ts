import { Module } from '@nestjs/common';
import { InstrutoresController } from './instrutores.controller';
import { InstrutoresService } from './instrutores.service';

@Module({ controllers: [InstrutoresController], providers: [InstrutoresService], exports: [InstrutoresService] })
export class InstrutoresModule {}
