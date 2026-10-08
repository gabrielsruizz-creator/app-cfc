import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { finalidadeArquivo } from '@volante/contracts';
import { ErroDominio } from '@volante/dominio';
import type { Response } from 'express';
import { Publico, SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ArquivosService, TAMANHO_MAXIMO } from './arquivos.service';

@Controller()
export class ArquivosController {
  constructor(private readonly servico: ArquivosService) {}

  @Post('arquivos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: TAMANHO_MAXIMO } }))
  enviar(
    @SessaoAtual() sessao: Sessao,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @Body('finalidade') finalidade: string,
  ) {
    if (!arquivo) throw new ErroDominio('arquivo_ausente', 'Nenhum arquivo enviado', 'validacao');
    const f = finalidadeArquivo.safeParse(finalidade);
    if (!f.success)
      throw new ErroDominio('finalidade_invalida', 'Finalidade do arquivo inválida', 'validacao');
    return this.servico.enviar(sessao, f.data, arquivo);
  }

  @Get('arquivos/:id')
  async baixar(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const a = await this.servico.abrirComPermissao(id, sessao);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    a.fluxo.pipe(res);
  }

  @Publico()
  @Get('publico/arquivos/:id')
  async baixarPublico(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.servico.abrirPublico(id);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    a.fluxo.pipe(res);
  }
}
