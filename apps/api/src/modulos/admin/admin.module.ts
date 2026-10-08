import { Module } from '@nestjs/common';
import { AulasModule } from '../aulas/aulas.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({ imports: [AulasModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
