import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  cupomEntrada,
  cupomParceiroEntrada,
  validarCupom,
  type CupomEntrada,
  type CupomParceiroEntrada,
} from '@volante/contracts';
import {
  atorAdmin,
  atorAluno,
  atorAutoescola,
  SessaoAtual,
  type Sessao,
} from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { PromocoesService } from './promocoes.service';

@Controller()
export class PromocoesController {
  constructor(private readonly servico: PromocoesService) {}

  // ---------- Admin ----------
  @Get('admin/cupons')
  listarAdmin(@SessaoAtual() s: Sessao) {
    return this.servico.listar(atorAdmin(s));
  }

  @Post('admin/cupons')
  criarAdmin(@SessaoAtual() s: Sessao, @Body(new ZodPipe(cupomEntrada)) d: CupomEntrada) {
    return this.servico.salvarAdmin(atorAdmin(s), null, d);
  }

  @Put('admin/cupons/:id')
  alterarAdmin(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cupomEntrada)) d: CupomEntrada,
  ) {
    return this.servico.salvarAdmin(atorAdmin(s), id, d);
  }

  // ---------- Autoescola ----------
  @Get('autoescola/cupons')
  listarAutoescola(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.listar(atorAutoescola(s, a));
  }

  @Post('autoescola/cupons')
  criarAutoescola(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Body(new ZodPipe(cupomParceiroEntrada)) d: CupomParceiroEntrada,
  ) {
    return this.servico.salvarAutoescola(atorAutoescola(s, a), null, d);
  }

  @Put('autoescola/cupons/:id')
  alterarAutoescola(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cupomParceiroEntrada)) d: CupomParceiroEntrada,
  ) {
    return this.servico.salvarAutoescola(atorAutoescola(s, a), id, d);
  }

  // ---------- Aluno ----------
  @Post('aluno/cupons/validar')
  validar(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(validarCupom)) d: { codigo: string; pacoteId?: string; instrutorId?: string },
  ) {
    return this.servico.validar(atorAluno(s), d);
  }
}
