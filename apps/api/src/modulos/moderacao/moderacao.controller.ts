import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  abrirDenuncia,
  abrirDisputa,
  decidirDisputa,
  reprovarComMotivo,
  resolverDenuncia,
} from '@volante/contracts';
import { z } from 'zod';
import {
  atorAdmin,
  atorAluno,
  atorInstrutor,
  SessaoAtual,
  type Sessao,
} from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { ModeracaoService } from './moderacao.service';

const disputaDaAula = abrirDisputa.omit({ aulaId: true });
type Disputa = { motivo: string; descricao: string };

@Controller()
export class ModeracaoController {
  constructor(private readonly servico: ModeracaoService) {}

  @Post('denuncias')
  denunciar(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(abrirDenuncia))
    d: { alvoTipo: string; alvoId: string; aulaId?: string; motivo: string; descricao?: string },
  ) {
    return this.servico.denunciar(s, d);
  }

  @Post('aluno/aulas/:id/disputa')
  disputaAluno(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(disputaDaAula)) d: Disputa,
  ) {
    return this.servico.abrirDisputa(atorAluno(s), 'aluno', { aulaId: id, ...d });
  }

  @Post('instrutor/aulas/:id/disputa')
  disputaInstrutor(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(disputaDaAula)) d: Disputa,
  ) {
    return this.servico.abrirDisputa(atorInstrutor(s), 'instrutor', { aulaId: id, ...d });
  }

  // ---------- Admin ----------

  @Get('admin/dashboard')
  dashboard(@SessaoAtual() s: Sessao) {
    return this.servico.dashboard(atorAdmin(s));
  }

  @Get('admin/denuncias')
  denuncias(@SessaoAtual() s: Sessao, @Query('status') status?: string) {
    return this.servico.listarDenuncias(atorAdmin(s), status);
  }

  @HttpCode(204)
  @Post('admin/denuncias/:id/resolver')
  async resolver(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(resolverDenuncia))
    d: { status: 'resolvida' | 'descartada'; resolucao: string },
  ) {
    await this.servico.resolverDenuncia(atorAdmin(s), id, d);
  }

  @Get('admin/disputas')
  disputas(@SessaoAtual() s: Sessao, @Query('status') status?: string) {
    return this.servico.listarDisputas(atorAdmin(s), status);
  }

  @HttpCode(204)
  @Post('admin/disputas/:id/decidir')
  async decidir(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decidirDisputa))
    d: {
      decisao: 'estorno_total' | 'estorno_parcial' | 'negada';
      valorEstornoCentavos?: number;
      resolucao: string;
    },
  ) {
    await this.servico.decidirDisputa(atorAdmin(s), id, d);
  }

  @Get('admin/usuarios')
  usuarios(@SessaoAtual() s: Sessao, @Query('busca') busca?: string) {
    atorAdmin(s);
    return this.servico.buscarUsuarios(busca);
  }

  @HttpCode(204)
  @Post('admin/usuarios/:id/:acao')
  async statusUsuario(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('acao', new ZodPipe(z.enum(['bloquear', 'desbloquear'])))
    acao: 'bloquear' | 'desbloquear',
    @Body(new ZodPipe(reprovarComMotivo)) d: { motivo: string },
  ) {
    await this.servico.alterarStatusUsuario(atorAdmin(s), id, acao === 'bloquear', d.motivo);
  }
}
