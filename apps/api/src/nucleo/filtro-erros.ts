import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { codigoErroPostgres, ErroDominio } from '@volante/dominio';
import type { Response } from 'express';

const STATUS_POR_TIPO: Record<ErroDominio['tipo'], number> = {
  validacao: HttpStatus.BAD_REQUEST,
  nao_encontrado: HttpStatus.NOT_FOUND,
  conflito: HttpStatus.CONFLICT,
  proibido: HttpStatus.FORBIDDEN,
  regra_negocio: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Converte qualquer erro no formato { codigo, mensagem, detalhes } em português. */
@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly log = new Logger('Erros');

  catch(erro: unknown, host: ArgumentsHost) {
    const resposta = host.switchToHttp().getResponse<Response>();

    if (erro instanceof ErroDominio) {
      return resposta
        .status(STATUS_POR_TIPO[erro.tipo])
        .json({ codigo: erro.codigo, mensagem: erro.message, detalhes: erro.detalhes });
    }
    if (erro instanceof HttpException) {
      const status = erro.getStatus();
      const corpo = erro.getResponse();
      if (typeof corpo === 'object' && corpo && 'codigo' in corpo)
        return resposta.status(status).json(corpo);
      const mensagens: Record<number, [string, string]> = {
        401: ['nao_autenticado', 'Faça login para continuar'],
        403: ['acesso_negado', 'Você não tem permissão para esta ação'],
        404: ['nao_encontrado', 'Recurso não encontrado'],
        413: ['arquivo_grande', 'Arquivo muito grande'],
        429: ['muitas_tentativas', 'Muitas tentativas. Aguarde um pouco e tente novamente.'],
      };
      const [codigo, mensagem] = mensagens[status] ?? ['erro', erro.message];
      return resposta.status(status).json({ codigo, mensagem });
    }
    const pg = codigoErroPostgres(erro);
    if (pg.code === '23505') {
      return resposta.status(HttpStatus.CONFLICT).json({
        codigo: 'duplicado',
        mensagem: 'Registro já existe',
        detalhes: { restricao: pg.constraint },
      });
    }
    if (pg.code === '23P01') {
      return resposta.status(HttpStatus.CONFLICT).json({
        codigo: 'horario_indisponivel',
        mensagem: 'Esse horário não está mais disponível.',
      });
    }
    this.log.error(erro instanceof Error ? erro.stack : String(erro));
    return resposta
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ codigo: 'erro_interno', mensagem: 'Ocorreu um erro inesperado. Tente novamente.' });
  }
}
