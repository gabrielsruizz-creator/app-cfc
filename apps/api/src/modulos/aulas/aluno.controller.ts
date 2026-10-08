import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  avaliarAula,
  cancelarAula,
  criarPerfilAluno,
  remarcarAula,
  solicitarAula,
  type AvaliarAula,
  type CriarPerfilAluno,
  type SolicitarAula,
} from '@volante/contracts';
import { ErroDominio } from '@volante/dominio';
import { atorAluno, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { AlunosService } from './alunos.service';
import { AulasConsultaService, STATUS_PROXIMAS } from './aulas-consulta.service';
import { AulasService } from './aulas.service';

@Controller('aluno')
export class AlunoController {
  constructor(
    private readonly alunos: AlunosService,
    private readonly aulas: AulasService,
    private readonly consulta: AulasConsultaService,
  ) {}

  @Post('perfil')
  criarPerfil(@SessaoAtual() s: Sessao, @Body(new ZodPipe(criarPerfilAluno)) dados: CriarPerfilAluno) {
    return this.alunos.criarPerfil(s, dados);
  }

  @Put('perfil')
  atualizarPerfil(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(criarPerfilAluno.partial())) dados: Partial<CriarPerfilAluno>,
  ) {
    return this.alunos.atualizarPerfil(atorAluno(s).alunoId, dados, s.usuarioId);
  }

  @Post('aulas')
  async solicitar(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(solicitarAula)) dados: SolicitarAula,
    @Headers('idempotency-key') chave: string | undefined,
  ) {
    if (!chave || chave.length < 8) {
      throw new ErroDominio('idempotencia_obrigatoria', 'Cabeçalho Idempotency-Key obrigatório', 'validacao');
    }
    const ator = atorAluno(s);
    const aulaId = await this.aulas.solicitar(ator, dados, chave);
    return this.consulta.detalhe(ator, aulaId);
  }

  @Get('aulas')
  listar(@SessaoAtual() s: Sessao, @Query('filtro') filtro?: string) {
    const ator = atorAluno(s);
    return filtro === 'anteriores'
      ? this.consulta.listar(ator, {
          status: ['concluida', 'cancelada', 'recusada', 'expirada', 'nao_compareceu_aluno', 'nao_compareceu_instrutor'],
          ordem: 'desc',
        })
      : this.consulta.listar(ator, { status: STATUS_PROXIMAS, ordem: 'asc' });
  }

  @Get('aulas/:id')
  detalhe(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.consulta.detalhe(atorAluno(s), id);
  }

  @Get('aulas/:id/cancelamento')
  previaCancelamento(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.aulas.previaCancelamento(atorAluno(s), id);
  }

  @Post('aulas/:id/cancelar')
  async cancelar(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cancelarAula)) dados: { motivo: string },
  ) {
    const ator = atorAluno(s);
    await this.aulas.cancelar(ator, id, dados.motivo);
    return this.consulta.detalhe(ator, id);
  }

  @Post('aulas/:id/remarcar')
  async remarcar(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(remarcarAula)) dados: { inicio: string },
  ) {
    const ator = atorAluno(s);
    await this.aulas.remarcar(ator, id, new Date(dados.inicio));
    return this.consulta.detalhe(ator, id);
  }

  @Post('aulas/:id/confirmar-fim')
  async confirmarFim(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    const ator = atorAluno(s);
    await this.aulas.confirmarFim(ator, id);
    return this.consulta.detalhe(ator, id);
  }

  @Post('aulas/:id/avaliacao')
  async avaliar(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(avaliarAula)) dados: AvaliarAula,
  ) {
    const ator = atorAluno(s);
    await this.aulas.avaliar(ator, id, dados);
    return this.consulta.detalhe(ator, id);
  }

  @Get('cobrancas/:id')
  cobranca(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.alunos.cobranca(atorAluno(s), id);
  }

  @Get('evolucao')
  evolucao(@SessaoAtual() s: Sessao) {
    const ator = atorAluno(s);
    return this.alunos.evolucao(ator, ator.alunoId);
  }

  @Get('recibos')
  recibos(@SessaoAtual() s: Sessao) {
    return this.alunos.recibos(atorAluno(s));
  }
}
