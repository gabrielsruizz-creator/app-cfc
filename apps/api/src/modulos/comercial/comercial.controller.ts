import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  agendarComCredito,
  avaliarAutoescola,
  comprarPacote,
  pacoteEntrada,
  type AgendarComCredito,
  type PacoteEntrada,
} from '@volante/contracts';
import { ErroDominio } from '@volante/dominio';
import { atorAluno, atorAutoescola, atorInstrutor, Publico, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { AulasConsultaService } from '../aulas/aulas-consulta.service';
import { ComercialService } from './comercial.service';

function exigirChave(chave: string | undefined) {
  if (!chave || chave.length < 8) {
    throw new ErroDominio('idempotencia_obrigatoria', 'Cabeçalho Idempotency-Key obrigatório', 'validacao');
  }
  return chave;
}

@Controller()
export class ComercialController {
  constructor(
    private readonly servico: ComercialService,
    private readonly aulas: AulasConsultaService,
  ) {}

  // ---------- Instrutor ----------
  @Get('instrutor/pacotes')
  pacotesInstrutor(@SessaoAtual() s: Sessao) {
    return this.servico.meusPacotes(atorInstrutor(s));
  }

  @Post('instrutor/pacotes')
  criarPacoteInstrutor(@SessaoAtual() s: Sessao, @Body(new ZodPipe(pacoteEntrada)) d: PacoteEntrada) {
    return this.servico.salvarPacote(atorInstrutor(s), d);
  }

  @Put('instrutor/pacotes/:id')
  editarPacoteInstrutor(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(pacoteEntrada)) d: PacoteEntrada) {
    return this.servico.salvarPacote(atorInstrutor(s), d, id);
  }

  @Delete('instrutor/pacotes/:id')
  arquivarPacoteInstrutor(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.arquivarPacote(atorInstrutor(s), id);
  }

  // ---------- Autoescola ----------
  @Get('autoescola/pacotes')
  pacotesAutoescola(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.meusPacotes(atorAutoescola(s, a));
  }

  @Post('autoescola/pacotes')
  criarPacoteAutoescola(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Body(new ZodPipe(pacoteEntrada)) d: PacoteEntrada) {
    return this.servico.salvarPacote(atorAutoescola(s, a), d);
  }

  @Put('autoescola/pacotes/:id')
  editarPacoteAutoescola(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(pacoteEntrada)) d: PacoteEntrada,
  ) {
    return this.servico.salvarPacote(atorAutoescola(s, a), d, id);
  }

  @Delete('autoescola/pacotes/:id')
  arquivarPacoteAutoescola(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.arquivarPacote(atorAutoescola(s, a), id);
  }

  // ---------- Público ----------
  @Publico()
  @Get('publico/instrutores/:id/pacotes')
  pacotesDoInstrutor(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.pacotesPublicos({ instrutorId: id });
  }

  // ---------- Aluno ----------
  @Post('aluno/pedidos')
  comprar(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(comprarPacote)) d: { pacoteId: string },
    @Headers('idempotency-key') chave?: string,
  ) {
    return this.servico.comprar(atorAluno(s), d.pacoteId, exigirChave(chave));
  }

  @Get('aluno/pedidos')
  pedidos(@SessaoAtual() s: Sessao) {
    return this.servico.pedidos(atorAluno(s));
  }

  @Get('aluno/pedidos/:id')
  pedido(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.pedido(atorAluno(s), id);
  }

  @Post('aluno/pedidos/:id/avaliacao')
  async avaliar(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(avaliarAutoescola)) d: { nota: number; comentario?: string },
  ) {
    const ator = atorAluno(s);
    await this.servico.avaliarAutoescola(ator, id, d.nota, d.comentario);
    return this.servico.pedido(ator, id);
  }

  @Get('aluno/creditos')
  creditos(@SessaoAtual() s: Sessao) {
    return this.servico.creditos(atorAluno(s));
  }

  @Post('aluno/aulas/com-credito')
  async agendar(@SessaoAtual() s: Sessao, @Body(new ZodPipe(agendarComCredito)) d: AgendarComCredito) {
    const ator = atorAluno(s);
    const aulaId = await this.servico.agendarComCredito(ator, d);
    return this.aulas.detalhe(ator, aulaId);
  }
}
