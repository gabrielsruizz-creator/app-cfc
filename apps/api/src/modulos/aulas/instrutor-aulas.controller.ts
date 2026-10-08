import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  cancelarAula,
  checkin,
  checkout,
  recusarAula,
  registrarEvolucao,
  type Checkin,
  type RegistrarEvolucao,
} from '@volante/contracts';
import { naoEncontrado } from '@volante/dominio';
import { atorInstrutor, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { AlunosService } from './alunos.service';
import { AulasConsultaService } from './aulas-consulta.service';
import { AulasService } from './aulas.service';

@Controller('instrutor')
export class InstrutorAulasController {
  constructor(
    private readonly aulas: AulasService,
    private readonly consulta: AulasConsultaService,
    private readonly alunos: AlunosService,
  ) {}

  @Get('solicitacoes')
  solicitacoes(@SessaoAtual() s: Sessao) {
    return this.consulta.listar(atorInstrutor(s), { status: ['solicitada'], ordem: 'asc' });
  }

  /** Agenda do instrutor entre duas datas (padrão: próximos 14 dias). */
  @Get('aulas')
  agenda(@SessaoAtual() s: Sessao, @Query('de') de?: string, @Query('ate') ate?: string) {
    const inicio = de ? new Date(de) : new Date(Date.now() - 86400_000);
    const fim = ate ? new Date(ate) : new Date(Date.now() + 14 * 86400_000);
    return this.consulta.listar(atorInstrutor(s), {
      status: ['confirmada', 'a_caminho', 'em_andamento', 'aguardando_confirmacao', 'concluida', 'solicitada'],
      de: inicio,
      ate: fim,
      ordem: 'asc',
    });
  }

  @Get('aulas/:id')
  detalhe(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.consulta.detalhe(atorInstrutor(s), id);
  }

  @Post('aulas/:id/aceitar')
  async aceitar(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    const ator = atorInstrutor(s);
    await this.aulas.aceitar(ator, id);
    return this.consulta.detalhe(ator, id);
  }

  @Post('aulas/:id/recusar')
  async recusar(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(recusarAula)) dados: { motivo: string },
  ) {
    const ator = atorInstrutor(s);
    await this.aulas.recusar(ator, id, dados.motivo);
    return this.consulta.detalhe(ator, id);
  }

  @Post('aulas/:id/checkin')
  async checkin(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(checkin)) dados: Checkin,
  ) {
    const ator = atorInstrutor(s);
    await this.aulas.checkin(ator, id, dados);
    return this.consulta.detalhe(ator, id);
  }

  @Post('aulas/:id/checkout')
  async checkout(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(checkout)) dados: { local: { lat: number; lng: number } },
  ) {
    const ator = atorInstrutor(s);
    await this.aulas.checkout(ator, id, dados.local);
    return this.consulta.detalhe(ator, id);
  }

  @Post('aulas/:id/cancelar')
  async cancelar(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cancelarAula)) dados: { motivo: string },
  ) {
    const ator = atorInstrutor(s);
    await this.aulas.cancelar(ator, id, dados.motivo);
    return this.consulta.detalhe(ator, id);
  }

  @Put('aulas/:id/evolucao')
  async evolucao(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(registrarEvolucao)) dados: RegistrarEvolucao,
  ) {
    const ator = atorInstrutor(s);
    await this.aulas.registrarEvolucao(ator, id, dados);
    return this.consulta.detalhe(ator, id);
  }

  @Get('alunos')
  alunosAtendidos(@SessaoAtual() s: Sessao) {
    return this.alunos.alunosDoInstrutor(atorInstrutor(s));
  }

  @Get('alunos/:alunoId')
  async fichaAluno(@SessaoAtual() s: Sessao, @Param('alunoId', ParseUUIDPipe) alunoId: string) {
    const ator = atorInstrutor(s);
    const atendidos = await this.alunos.alunosDoInstrutor(ator);
    const aluno = atendidos.find((a) => a.alunoId === alunoId);
    if (!aluno) throw naoEncontrado('aluno');
    const [aulas, evolucao] = await Promise.all([
      this.consulta.listar(ator, { ordem: 'desc', limite: 100 }).then((l) => l.filter((a) => a.aluno.id === alunoId)),
      this.alunos.evolucao(ator, alunoId, ator.instrutorId),
    ]);
    return { aluno, aulas, evolucao };
  }

  @Get('avaliacoes')
  avaliacoes(@SessaoAtual() s: Sessao) {
    const ator = atorInstrutor(s);
    return this.consulta.avaliacoesRecebidas(ator, ator.instrutorId);
  }
}
