import { Module } from '@nestjs/common';
import { AlunoController } from './aluno.controller';
import { AlunosService } from './alunos.service';
import { AulasConsultaService } from './aulas-consulta.service';
import { AulasService } from './aulas.service';
import { InstrutorAulasController } from './instrutor-aulas.controller';

@Module({
  controllers: [AlunoController, InstrutorAulasController],
  providers: [AulasService, AulasConsultaService, AlunosService],
  exports: [AulasConsultaService],
})
export class AulasModule {}
