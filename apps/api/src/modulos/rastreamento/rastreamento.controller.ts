import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { criarCompartilhamento, enviarPosicao, type EnviarPosicao } from '@volante/contracts';
import { z } from 'zod';
import {
  atorAluno,
  atorInstrutor,
  Publico,
  SessaoAtual,
  type Sessao,
} from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { RastreamentoService } from './rastreamento.service';

const aCaminho = z.object({ posicao: enviarPosicao.optional() });

@Controller()
export class RastreamentoController {
  constructor(private readonly servico: RastreamentoService) {}

  @Post('instrutor/aulas/:id/a-caminho')
  aCaminho(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(aCaminho)) d: { posicao?: EnviarPosicao },
  ) {
    return this.servico.aCaminho(atorInstrutor(s), id, d.posicao);
  }

  @HttpCode(200)
  @Post('instrutor/aulas/:id/posicao')
  posicao(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(enviarPosicao)) d: EnviarPosicao,
  ) {
    return this.servico.posicao(atorInstrutor(s), id, d);
  }

  @Get('aluno/aulas/:id/rastreamento')
  rastreamento(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.rastreamento(atorAluno(s), id);
  }

  @Get('aluno/aulas/:id/compartilhamentos')
  compartilhamentos(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.compartilhamentos(atorAluno(s), id);
  }

  @Post('aluno/aulas/:id/compartilhamentos')
  compartilhar(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(criarCompartilhamento)) d: { contatoNome?: string },
  ) {
    return this.servico.compartilhar(atorAluno(s), id, d.contatoNome);
  }

  @HttpCode(204)
  @Delete('aluno/aulas/:id/compartilhamentos/:compartilhamentoId')
  async revogar(
    @SessaoAtual() s: Sessao,
    @Param('compartilhamentoId', ParseUUIDPipe) compartilhamentoId: string,
  ) {
    await this.servico.revogar(atorAluno(s), compartilhamentoId);
  }

  @Publico()
  @Get('publico/acompanhar/:token')
  publico(@Param('token', new ZodPipe(z.string().min(20).max(64))) token: string) {
    return this.servico.publico(token);
  }
}
