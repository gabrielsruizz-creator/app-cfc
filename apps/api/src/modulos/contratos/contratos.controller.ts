import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { previaContrato, type PreviaContrato } from '@volante/contracts';
import {
  atorAluno,
  atorAutoescola,
  atorInstrutor,
  SessaoAtual,
  type Sessao,
} from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { ContratosService } from './contratos.service';

/** Contrato de prestação de serviços de cada compra, visto e reenviado por qualquer das partes. */
@Controller()
export class ContratosController {
  constructor(private readonly servico: ContratosService) {}

  @Post('aluno/contratos/previa')
  @HttpCode(200)
  previa(@SessaoAtual() s: Sessao, @Body(new ZodPipe(previaContrato)) d: PreviaContrato) {
    return this.servico.previa(atorAluno(s), d);
  }

  @Get('aluno/contratos/:pedidoId')
  doAluno(@SessaoAtual() s: Sessao, @Param('pedidoId', ParseUUIDPipe) id: string) {
    return this.servico.obter(atorAluno(s), id);
  }

  @Post('aluno/contratos/:pedidoId/reenviar')
  @HttpCode(200)
  reenviarAluno(@SessaoAtual() s: Sessao, @Param('pedidoId', ParseUUIDPipe) id: string) {
    return this.servico.reenviar(atorAluno(s), id, 'contratante');
  }

  @Get('instrutor/contratos/:pedidoId')
  doInstrutor(@SessaoAtual() s: Sessao, @Param('pedidoId', ParseUUIDPipe) id: string) {
    return this.servico.obter(atorInstrutor(s), id);
  }

  @Post('instrutor/contratos/:pedidoId/reenviar')
  @HttpCode(200)
  reenviarInstrutor(@SessaoAtual() s: Sessao, @Param('pedidoId', ParseUUIDPipe) id: string) {
    return this.servico.reenviar(atorInstrutor(s), id, 'contratado');
  }

  @Get('autoescola/contratos/:pedidoId')
  daAutoescola(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Param('pedidoId', ParseUUIDPipe) id: string,
  ) {
    return this.servico.obter(atorAutoescola(s, a), id);
  }

  @Post('autoescola/contratos/:pedidoId/reenviar')
  @HttpCode(200)
  reenviarAutoescola(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Param('pedidoId', ParseUUIDPipe) id: string,
  ) {
    return this.servico.reenviar(atorAutoescola(s, a), id, 'contratado');
  }
}
