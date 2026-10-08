import { Body, Controller, Get, Headers, Post, Put } from '@nestjs/common';
import { contaRecebimentoEntrada, solicitarSaque, type ContaRecebimentoEntrada } from '@volante/contracts';
import { atorAutoescola, atorInstrutor, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { FinanceiroService } from './financeiro.service';

@Controller()
export class FinanceiroController {
  constructor(private readonly servico: FinanceiroService) {}

  @Get('instrutor/financeiro')
  instrutor(@SessaoAtual() s: Sessao) {
    return this.servico.resumo(atorInstrutor(s));
  }

  @Put('instrutor/conta-recebimento')
  contaInstrutor(@SessaoAtual() s: Sessao, @Body(new ZodPipe(contaRecebimentoEntrada)) d: ContaRecebimentoEntrada) {
    return this.servico.salvarContaRecebimento(atorInstrutor(s), d);
  }

  @Post('instrutor/saques')
  sacarInstrutor(@SessaoAtual() s: Sessao, @Body(new ZodPipe(solicitarSaque)) d: { valorCentavos: number }) {
    return this.servico.sacar(atorInstrutor(s), d.valorCentavos);
  }

  @Get('autoescola/financeiro')
  autoescola(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.resumo(atorAutoescola(s, a));
  }

  @Put('autoescola/conta-recebimento')
  contaAutoescola(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Body(new ZodPipe(contaRecebimentoEntrada)) d: ContaRecebimentoEntrada,
  ) {
    return this.servico.salvarContaRecebimento(atorAutoescola(s, a), d);
  }

  @Post('autoescola/saques')
  sacarAutoescola(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Body(new ZodPipe(solicitarSaque)) d: { valorCentavos: number }) {
    return this.servico.sacar(atorAutoescola(s, a), d.valorCentavos);
  }
}
