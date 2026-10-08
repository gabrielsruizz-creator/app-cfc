import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { enviarMensagem, iniciarConversa } from '@volante/contracts';
import type { Ator } from '@volante/db';
import { ErroDominio } from '@volante/dominio';
import {
  atorAluno,
  atorAutoescola,
  atorInstrutor,
  SessaoAtual,
  type Sessao,
} from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { ChatService } from './chat.service';

/** O participante é indicado por ?como=aluno|instrutor|autoescola (autoescola usa X-Autoescola-Id). */
function ator(s: Sessao, como: string | undefined, autoescolaId: string | undefined): Ator {
  if (como === 'instrutor') return atorInstrutor(s);
  if (como === 'autoescola') return atorAutoescola(s, autoescolaId);
  if (como === 'aluno' || !como) return atorAluno(s);
  throw new ErroDominio('papel_invalido', 'Papel inválido', 'validacao');
}

@Controller('conversas')
export class ChatController {
  constructor(private readonly servico: ChatService) {}

  @Get()
  listar(
    @SessaoAtual() s: Sessao,
    @Query('como') como?: string,
    @Headers('x-autoescola-id') a?: string,
  ) {
    return this.servico.listar(ator(s, como, a));
  }

  @Post()
  async iniciar(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(iniciarConversa))
    d: { instrutorId?: string; autoescolaId?: string; alunoId?: string },
    @Query('como') como?: string,
    @Headers('x-autoescola-id') a?: string,
  ) {
    return { id: await this.servico.iniciar(ator(s, como, a), d) };
  }

  @Get(':id/mensagens')
  mensagens(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('como') como?: string,
    @Headers('x-autoescola-id') a?: string,
  ) {
    return this.servico.mensagens(ator(s, como, a), id);
  }

  @Post(':id/mensagens')
  enviar(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(enviarMensagem)) d: { texto: string },
    @Query('como') como?: string,
    @Headers('x-autoescola-id') a?: string,
  ) {
    return this.servico.enviar(ator(s, como, a), id, d.texto);
  }
}
