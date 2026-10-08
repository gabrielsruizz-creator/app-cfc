import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, desc, eq, isNull, notificacoes } from '@volante/db';
import { SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';

@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly banco: BancoService) {}

  @Get()
  async listar(@SessaoAtual() s: Sessao) {
    const linhas = await this.banco.db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.usuarioId, s.usuarioId))
      .orderBy(desc(notificacoes.criadoEm))
      .limit(100);
    return linhas.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      corpo: n.corpo,
      dados: n.dados,
      lida: Boolean(n.lidaEm),
      criadoEm: n.criadoEm.toISOString(),
    }));
  }

  @HttpCode(204)
  @Post(':id/lida')
  async marcarLida(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    await this.banco.db
      .update(notificacoes)
      .set({ lidaEm: new Date() })
      .where(and(eq(notificacoes.id, id), eq(notificacoes.usuarioId, s.usuarioId)));
  }

  @HttpCode(204)
  @Post('lidas')
  async marcarTodas(@SessaoAtual() s: Sessao) {
    await this.banco.db
      .update(notificacoes)
      .set({ lidaEm: new Date() })
      .where(and(eq(notificacoes.usuarioId, s.usuarioId), isNull(notificacoes.lidaEm)));
  }
}
