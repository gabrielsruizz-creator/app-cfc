import { Body, Controller, Delete, Get, Headers, Post, Put } from '@nestjs/common';
import { conectarCfcPlus, type ConectarCfcPlus } from '@volante/contracts';
import { atorAutoescola, negar, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { IntegracoesService } from './integracoes.service';

/** Credenciais de integração: só o dono ou o gerente da autoescola. */
function gestor(s: Sessao, autoescolaId: string | undefined) {
  const ator = atorAutoescola(s, autoescolaId);
  const papel = s.autoescolas.find((a) => a.autoescolaId === autoescolaId)?.papel;
  if (!['dono', 'gerente'].includes(papel ?? ''))
    throw negar('acesso_negado', 'Só o dono ou o gerente da autoescola configura integrações');
  return ator;
}

@Controller('autoescola/integracoes')
export class IntegracoesController {
  constructor(private readonly servico: IntegracoesService) {}

  @Get()
  resumo(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.resumo(atorAutoescola(s, a));
  }

  @Get('cfc-plus')
  cfcPlus(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.cfcPlus(atorAutoescola(s, a));
  }

  @Put('cfc-plus')
  conectar(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Body(new ZodPipe(conectarCfcPlus)) d: ConectarCfcPlus,
  ) {
    return this.servico.conectar(gestor(s, a), d);
  }

  @Post('cfc-plus/testar')
  testar(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.testar(gestor(s, a));
  }

  @Post('cfc-plus/sincronizar')
  sincronizar(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.sincronizar(gestor(s, a));
  }

  @Delete('cfc-plus')
  desconectar(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.desconectar(gestor(s, a));
  }
}
