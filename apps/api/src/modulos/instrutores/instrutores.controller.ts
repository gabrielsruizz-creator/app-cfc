import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  alterarDisponibilidade,
  atendimento,
  criarBloqueio,
  enviarDocumentoInstrutor,
  jornadaSemanal,
  perfilProfissional,
  veiculoEntrada,
  type Atendimento,
  type CriarBloqueio,
  type EnviarDocumentoInstrutor,
  type JornadaSemanal,
  type PerfilProfissional,
  type VeiculoEntrada,
} from '@volante/contracts';
import { atorInstrutor, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { InstrutoresService } from './instrutores.service';

/** Área do próprio instrutor (cadastro, documentos, agenda e atendimento). */
@Controller('instrutor')
export class InstrutoresController {
  constructor(private readonly servico: InstrutoresService) {}

  @Post('perfil')
  criar(@SessaoAtual() s: Sessao, @Body(new ZodPipe(perfilProfissional)) dados: PerfilProfissional) {
    return this.servico.criarPerfil(s, dados);
  }

  @Get('perfil')
  perfil(@SessaoAtual() s: Sessao) {
    return this.servico.perfil(atorInstrutor(s).instrutorId);
  }

  @Put('perfil')
  atualizar(@SessaoAtual() s: Sessao, @Body(new ZodPipe(perfilProfissional)) dados: PerfilProfissional) {
    return this.servico.atualizarPerfil(s, atorInstrutor(s).instrutorId, dados);
  }

  @Put('atendimento')
  atendimento(@SessaoAtual() s: Sessao, @Body(new ZodPipe(atendimento)) dados: Atendimento) {
    const ator = atorInstrutor(s);
    return this.servico.atualizarAtendimento(ator, ator.instrutorId, dados);
  }

  @Post('documentos')
  documento(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(enviarDocumentoInstrutor)) dados: EnviarDocumentoInstrutor,
  ) {
    return this.servico.enviarDocumento(s, atorInstrutor(s).instrutorId, dados);
  }

  @Post('veiculos')
  criarVeiculo(@SessaoAtual() s: Sessao, @Body(new ZodPipe(veiculoEntrada)) dados: VeiculoEntrada) {
    return this.servico.salvarVeiculo(atorInstrutor(s).instrutorId, dados);
  }

  @Put('veiculos/:id')
  editarVeiculo(
    @SessaoAtual() s: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(veiculoEntrada)) dados: VeiculoEntrada,
  ) {
    return this.servico.salvarVeiculo(atorInstrutor(s).instrutorId, dados, id);
  }

  @Delete('veiculos/:id')
  removerVeiculo(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.removerVeiculo(atorInstrutor(s).instrutorId, id);
  }

  @Get('jornada')
  jornada(@SessaoAtual() s: Sessao) {
    return this.servico.jornada(atorInstrutor(s).instrutorId);
  }

  @Put('jornada')
  salvarJornada(@SessaoAtual() s: Sessao, @Body(new ZodPipe(jornadaSemanal)) dados: JornadaSemanal) {
    return this.servico.salvarJornada(atorInstrutor(s).instrutorId, dados);
  }

  @Get('bloqueios')
  bloqueios(@SessaoAtual() s: Sessao) {
    return this.servico.bloqueios(atorInstrutor(s).instrutorId);
  }

  @Post('bloqueios')
  criarBloqueio(@SessaoAtual() s: Sessao, @Body(new ZodPipe(criarBloqueio)) dados: CriarBloqueio) {
    return this.servico.criarBloqueio(atorInstrutor(s).instrutorId, dados);
  }

  @Delete('bloqueios/:id')
  removerBloqueio(@SessaoAtual() s: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.servico.removerBloqueio(atorInstrutor(s).instrutorId, id);
  }

  @Put('disponibilidade')
  disponibilidade(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(alterarDisponibilidade)) dados: { disponivel: boolean },
  ) {
    return this.servico.alterarDisponibilidade(atorInstrutor(s).instrutorId, dados.disponivel);
  }

  @Post('enviar-analise')
  enviarAnalise(@SessaoAtual() s: Sessao) {
    return this.servico.enviarParaAnalise(s, atorInstrutor(s).instrutorId);
  }
}
