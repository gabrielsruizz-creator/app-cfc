import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  atualizarConfiguracoes,
  filtroAuditoria,
  novaRegraComissao,
  publicarDocumentoLegal,
  reprovarComMotivo,
  type AtualizarConfiguracoes,
  type NovaRegraComissao,
} from '@volante/contracts';
import { atorAdmin, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { AulasConsultaService } from '../aulas/aulas-consulta.service';
import { AdminService } from './admin.service';

type Motivo = { motivo: string };

@Controller('admin')
export class AdminController {
  constructor(
    private readonly servico: AdminService,
    private readonly aulas: AulasConsultaService,
  ) {}

  @Get('resumo')
  resumo(@SessaoAtual() s: Sessao) {
    return this.servico.resumo(atorAdmin(s));
  }

  @Get('instrutores')
  instrutores(@SessaoAtual() s: Sessao, @Query('status') status?: string) {
    atorAdmin(s);
    return this.servico.listarInstrutores(status);
  }

  @Get('instrutores/:id')
  instrutor(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    atorAdmin(s);
    return this.servico.detalheInstrutor(id);
  }

  @Post('instrutores/:id/documentos/:docId/aprovar')
  aprovarDocInstrutor(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.servico.analisarDocumentoInstrutor(atorAdmin(s), id, docId, true);
  }

  @Post('instrutores/:id/documentos/:docId/reprovar')
  reprovarDocInstrutor(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body(new ZodPipe(reprovarComMotivo)) d: Motivo,
  ) {
    return this.servico.analisarDocumentoInstrutor(atorAdmin(s), id, docId, false, d.motivo);
  }

  @Post('instrutores/:id/aprovar')
  aprovarInstrutor(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.decidirInstrutor(atorAdmin(s), id, 'aprovar');
  }

  @Post('instrutores/:id/reprovar')
  reprovarInstrutor(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reprovarComMotivo)) d: Motivo,
  ) {
    return this.servico.decidirInstrutor(atorAdmin(s), id, 'reprovar', d.motivo);
  }

  @Post('instrutores/:id/bloquear')
  bloquearInstrutor(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reprovarComMotivo)) d: Motivo,
  ) {
    return this.servico.decidirInstrutor(atorAdmin(s), id, 'bloquear', d.motivo);
  }

  @Get('autoescolas')
  autoescolas(@SessaoAtual() s: Sessao, @Query('status') status?: string) {
    return this.servico.listarAutoescolas(atorAdmin(s), status);
  }

  @Get('autoescolas/:id')
  autoescola(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.detalheAutoescola(atorAdmin(s), id);
  }

  @Post('autoescolas/:id/documentos/:docId/aprovar')
  aprovarDocAutoescola(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.servico.analisarDocumentoAutoescola(atorAdmin(s), id, docId, true);
  }

  @Post('autoescolas/:id/documentos/:docId/reprovar')
  reprovarDocAutoescola(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body(new ZodPipe(reprovarComMotivo)) d: Motivo,
  ) {
    return this.servico.analisarDocumentoAutoescola(atorAdmin(s), id, docId, false, d.motivo);
  }

  @Post('autoescolas/:id/aprovar')
  aprovarAutoescola(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.decidirAutoescola(atorAdmin(s), id, 'aprovar');
  }

  @Post('autoescolas/:id/reprovar')
  reprovarAutoescola(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reprovarComMotivo)) d: Motivo,
  ) {
    return this.servico.decidirAutoescola(atorAdmin(s), id, 'reprovar', d.motivo);
  }

  @Post('autoescolas/:id/suspender')
  suspenderAutoescola(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reprovarComMotivo)) d: Motivo,
  ) {
    return this.servico.decidirAutoescola(atorAdmin(s), id, 'suspender', d.motivo);
  }

  @Get('comissoes')
  comissoes(@SessaoAtual() s: Sessao) {
    atorAdmin(s);
    return this.servico.comissoes();
  }

  @Post('comissoes')
  novaComissao(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(novaRegraComissao)) d: NovaRegraComissao,
  ) {
    return this.servico.novaComissao(atorAdmin(s), d);
  }

  @Get('configuracoes')
  configuracoes(@SessaoAtual() s: Sessao) {
    atorAdmin(s);
    return this.servico.configuracoes();
  }

  @Put('configuracoes')
  atualizarConfiguracoes(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(atualizarConfiguracoes)) d: AtualizarConfiguracoes,
  ) {
    return this.servico.atualizarConfiguracoes(atorAdmin(s), d);
  }

  @HttpCode(204)
  @Post('documentos-legais')
  async documentoLegal(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(publicarDocumentoLegal))
    d: { tipo: string; versao: string; conteudoMd: string },
  ) {
    await this.servico.publicarDocumentoLegal(atorAdmin(s), d);
  }

  @Get('aulas')
  listarAulas(@SessaoAtual() s: Sessao) {
    return this.aulas.listar(atorAdmin(s), { ordem: 'desc', limite: 200 });
  }

  @Get('aulas/:id')
  aula(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.aulas.detalhe(atorAdmin(s), id);
  }

  @Get('auditoria')
  auditoria(
    @SessaoAtual() s: Sessao,
    @Query(new ZodPipe(filtroAuditoria))
    f: { entidadeTipo?: string; entidadeId?: string; atorUsuarioId?: string; limite: number },
  ) {
    atorAdmin(s);
    return this.servico.auditoria(f);
  }

  @Get('operacoes')
  operacoes(@SessaoAtual() s: Sessao) {
    return this.servico.operacoes(atorAdmin(s));
  }

  @HttpCode(204)
  @Post('operacoes/eventos/:id/reprocessar')
  async reprocessar(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    await this.servico.reprocessarEvento(atorAdmin(s), id);
  }
}
