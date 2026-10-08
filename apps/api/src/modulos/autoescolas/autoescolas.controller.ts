import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import {
  cadastroAutoescola,
  enviarDocumentoAutoescola,
  type CadastroAutoescola,
  type EnviarDocumentoAutoescola,
} from '@volante/contracts';
import { atorAutoescola, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { AutoescolasService } from './autoescolas.service';

/** O painel indica a autoescola ativa no cabeçalho X-Autoescola-Id. */
@Controller()
export class AutoescolasController {
  constructor(private readonly servico: AutoescolasService) {}

  @Post('autoescolas')
  cadastrar(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(cadastroAutoescola)) dados: CadastroAutoescola,
  ) {
    return this.servico.cadastrar(s, dados);
  }

  @Get('autoescola/painel')
  painel(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') id?: string) {
    return this.servico.painel(atorAutoescola(s, id));
  }

  @Post('autoescola/documentos')
  documento(
    @SessaoAtual() s: Sessao,
    @Headers('x-autoescola-id') id: string | undefined,
    @Body(new ZodPipe(enviarDocumentoAutoescola)) dados: EnviarDocumentoAutoescola,
  ) {
    return this.servico.enviarDocumento(s, atorAutoescola(s, id), dados);
  }

  @Post('autoescola/enviar-analise')
  enviarAnalise(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') id?: string) {
    return this.servico.enviarParaAnalise(atorAutoescola(s, id));
  }

  @Get('autoescola/integracoes')
  integracoes(@SessaoAtual() s: Sessao, @Headers('x-autoescola-id') id?: string) {
    return this.servico.integracoes(atorAutoescola(s, id));
  }
}
