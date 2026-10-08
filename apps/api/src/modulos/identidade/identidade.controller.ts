import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  cadastroUsuario,
  entrar,
  registrarDispositivoPush,
  renovarSessao,
  type CadastroUsuario,
  type Entrar,
} from '@volante/contracts';
import type { Request } from 'express';
import { Publico, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { IdentidadeService } from './identidade.service';

const origem = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null });

@Controller()
export class IdentidadeController {
  constructor(private readonly servico: IdentidadeService) {}

  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/cadastro')
  cadastrar(@Body(new ZodPipe(cadastroUsuario)) dados: CadastroUsuario, @Req() req: Request) {
    return this.servico.cadastrar(dados, origem(req));
  }

  @Publico()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/entrar')
  entrar(@Body(new ZodPipe(entrar)) dados: Entrar, @Req() req: Request) {
    return this.servico.entrar(dados, origem(req));
  }

  @Publico()
  @HttpCode(200)
  @Post('auth/renovar')
  renovar(@Body(new ZodPipe(renovarSessao)) dados: { refreshToken: string }, @Req() req: Request) {
    return this.servico.renovar(dados.refreshToken, origem(req));
  }

  @HttpCode(204)
  @Post('auth/sair')
  async sair(@SessaoAtual() sessao: Sessao) {
    await this.servico.sair(sessao.sessaoId);
  }

  @Get('eu')
  eu(@SessaoAtual() sessao: Sessao) {
    return this.servico.eu(sessao.usuarioId);
  }

  @HttpCode(204)
  @Post('eu/dispositivos-push')
  async registrarDispositivo(
    @SessaoAtual() sessao: Sessao,
    @Body(new ZodPipe(registrarDispositivoPush)) dados: { expoPushToken: string; plataforma: string },
  ) {
    await this.servico.registrarDispositivo(sessao.usuarioId, dados.expoPushToken, dados.plataforma);
  }
}
