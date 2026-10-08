import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  buscaAutoescolas,
  convidarInstrutor,
  recusarPedido,
  responderAvaliacao,
  vitrineEntrada,
  type VitrineEntrada,
} from '@volante/contracts';
import { and, eq, inArray, instrutorVinculos, autoescolas } from '@volante/db';
import { naoEncontrado } from '@volante/dominio';
import { z } from 'zod';
import { atorAutoescola, atorInstrutor, Publico, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { AulasConsultaService } from '../aulas/aulas-consulta.service';
import { PainelAutoescolaService } from './painel.service';

const novaFoto = z.object({ arquivoId: z.uuid(), legenda: z.string().max(120).optional() });

@Controller()
export class PainelAutoescolaController {
  constructor(
    private readonly servico: PainelAutoescolaService,
    private readonly aulas: AulasConsultaService,
    private readonly banco: BancoService,
  ) {}

  @Get('autoescola/resumo')
  resumo(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.resumo(atorAutoescola(s, a));
  }

  @Get('autoescola/fila')
  fila(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string, @Query('status') status?: string) {
    return this.servico.fila(atorAutoescola(s, a), status);
  }

  @Post('autoescola/fila/:id/em-contato')
  async emContato(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    await this.servico.atualizarPedido(atorAutoescola(s, a), id, 'em_contato');
    return { ok: true };
  }

  @Post('autoescola/fila/:id/confirmar')
  async confirmar(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    await this.servico.atualizarPedido(atorAutoescola(s, a), id, 'confirmar');
    return { ok: true };
  }

  @Post('autoescola/fila/:id/recusar')
  async recusar(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(recusarPedido)) d: { motivo: string },
  ) {
    await this.servico.atualizarPedido(atorAutoescola(s, a), id, 'recusar', d.motivo);
    return { ok: true };
  }

  @Get('autoescola/alunos')
  alunos(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.alunos(atorAutoescola(s, a));
  }

  @Get('autoescola/aulas')
  agenda(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    return this.aulas.listar(atorAutoescola(s, a), {
      de: de ? new Date(de) : new Date(Date.now() - 86400_000),
      ate: ate ? new Date(ate) : new Date(Date.now() + 21 * 86400_000),
      ordem: 'asc',
      limite: 500,
    });
  }

  @Get('autoescola/instrutores')
  instrutores(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.instrutores(atorAutoescola(s, a));
  }

  @Post('autoescola/instrutores/convites')
  convidar(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Body(new ZodPipe(convidarInstrutor)) d: { cpfOuEmail: string }) {
    return this.servico.convidarInstrutor(atorAutoescola(s, a), d.cpfOuEmail);
  }

  @Delete('autoescola/instrutores/:vinculoId')
  encerrar(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Param('vinculoId', ParseUUIDPipe) id: string) {
    return this.servico.encerrarVinculo(atorAutoescola(s, a), id);
  }

  @Get('autoescola/vitrine')
  vitrine(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.vitrine(atorAutoescola(s, a));
  }

  @Put('autoescola/vitrine')
  salvarVitrine(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Body(new ZodPipe(vitrineEntrada)) d: VitrineEntrada) {
    return this.servico.salvarVitrine(atorAutoescola(s, a), d);
  }

  @Post('autoescola/fotos')
  adicionarFoto(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Body(new ZodPipe(novaFoto)) d: { arquivoId: string; legenda?: string }) {
    return this.servico.adicionarFoto(atorAutoescola(s, a), d.arquivoId, d.legenda);
  }

  @Delete('autoescola/fotos/:id')
  removerFoto(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.removerFoto(atorAutoescola(s, a), id);
  }

  @Get('autoescola/avaliacoes')
  avaliacoes(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') a?: string) {
    return this.servico.avaliacoes(atorAutoescola(s, a));
  }

  @Post('autoescola/avaliacoes/:id/resposta')
  responder(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') a: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(responderAvaliacao)) d: { resposta: string },
  ) {
    return this.servico.responderAvaliacao(atorAutoescola(s, a), id, d.resposta);
  }

  // ---------- Instrutor: convites e vínculos ----------

  @Get('instrutor/vinculos')
  vinculos(@SessaoAtual() s: Sessao) {
    return this.banco.comAtor(atorInstrutor(s), (tx) =>
      tx
        .select({
          id: instrutorVinculos.id,
          status: instrutorVinculos.status,
          autoescolaId: autoescolas.id,
          nomeFantasia: autoescolas.nomeFantasia,
          municipio: autoescolas.municipio,
          uf: autoescolas.uf,
        })
        .from(instrutorVinculos)
        .innerJoin(autoescolas, eq(autoescolas.id, instrutorVinculos.autoescolaId))
        .where(inArray(instrutorVinculos.status, ['convidado', 'ativo'])),
    );
  }

  @Post('instrutor/vinculos/:id/:acao')
  async responderVinculo(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string, @Param('acao') acao: string) {
    const ator = atorInstrutor(s);
    const mapa: Record<string, { de: string[]; para: string }> = {
      aceitar: { de: ['convidado'], para: 'ativo' },
      recusar: { de: ['convidado'], para: 'recusado' },
      encerrar: { de: ['ativo'], para: 'encerrado' },
    };
    const regra = mapa[acao];
    if (!regra) throw naoEncontrado('acao');
    await this.banco.comAtor(ator, async (tx) => {
      const r = await tx
        .update(instrutorVinculos)
        .set({
          status: regra.para,
          ...(regra.para === 'ativo' ? { inicioEm: new Date() } : { fimEm: new Date() }),
        })
        .where(and(eq(instrutorVinculos.id, id), eq(instrutorVinculos.instrutorId, ator.instrutorId), inArray(instrutorVinculos.status, regra.de)))
        .returning();
      if (!r.length) throw naoEncontrado('convite');
    });
    return this.vinculos(s);
  }

  // ---------- Público ----------

  @Publico()
  @Get('publico/autoescolas')
  buscar(@Query(new ZodPipe(buscaAutoescolas)) f: { lat: number; lng: number; raioKm: number; texto?: string }) {
    return this.servico.buscarPublico(f);
  }

  @Publico()
  @Get('publico/autoescolas/:id')
  perfil(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.perfilPublico(id);
  }

  @Publico()
  @Get('publico/autoescolas/:id/instrutores')
  instrutoresPublicos(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.instrutoresPublicos(id);
  }
}
