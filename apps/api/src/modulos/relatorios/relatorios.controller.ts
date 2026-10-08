import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import { filtroPeriodo, type FiltroPeriodo } from '@volante/contracts';
import type { Response } from 'express';
import { atorAdmin, atorAutoescola, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { RelatoriosService } from './relatorios.service';

function csv(res: Response, nome: string, conteudo: string) {
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${nome}"`);
  return conteudo;
}

@Controller()
export class RelatoriosController {
  constructor(private readonly servico: RelatoriosService) {}

  @Get('autoescola/relatorios')
  autoescola(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Query(new ZodPipe(filtroPeriodo)) p: FiltroPeriodo,
  ) {
    return this.servico.autoescola(atorAutoescola(s, a), p);
  }

  @Get('autoescola/relatorios/vendas.csv')
  async autoescolaCsv(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Query(new ZodPipe(filtroPeriodo)) p: FiltroPeriodo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const conteudo = await this.servico.vendasCsv(atorAutoescola(s, a), p, false);
    return csv(res, `vendas-${p.de}-a-${p.ate}.csv`, conteudo);
  }

  @Get('admin/relatorios')
  admin(@SessaoAtual() s: Sessao, @Query(new ZodPipe(filtroPeriodo)) p: FiltroPeriodo) {
    return this.servico.admin(atorAdmin(s), p);
  }

  @Get('admin/relatorios/vendas.csv')
  async adminCsv(
    @SessaoAtual() s: Sessao,
    @Query(new ZodPipe(filtroPeriodo)) p: FiltroPeriodo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const conteudo = await this.servico.vendasCsv(atorAdmin(s), p, true);
    return csv(res, `vendas-${p.de}-a-${p.ate}.csv`, conteudo);
  }
}
