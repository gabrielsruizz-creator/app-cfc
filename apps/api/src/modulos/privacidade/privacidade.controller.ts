import { Body, Controller, Get, Post } from '@nestjs/common';
import { finalidadeConsentimento, type FinalidadeConsentimento } from '@volante/contracts';
import { z } from 'zod';
import { SessaoAtual, type Sessao } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { PrivacidadeService } from './privacidade.service';

const registrar = z.object({ finalidade: finalidadeConsentimento, aceito: z.boolean() });
const exclusao = z.object({
  motivo: z.string().max(500).optional(),
  confirmacao: z.literal('EXCLUIR'),
});

@Controller('privacidade')
export class PrivacidadeController {
  constructor(private readonly servico: PrivacidadeService) {}

  @Get('consentimentos')
  consentimentos(@SessaoAtual() s: Sessao) {
    return this.servico.consentimentos(s.usuarioId);
  }

  @Post('consentimentos')
  registrar(
    @SessaoAtual() s: Sessao,
    @Body(new ZodPipe(registrar)) d: { finalidade: FinalidadeConsentimento; aceito: boolean },
  ) {
    return this.servico.registrarConsentimento(s, d.finalidade, d.aceito);
  }

  @Get('meus-dados')
  meusDados(@SessaoAtual() s: Sessao) {
    return this.servico.meusDados(s);
  }

  @Post('exclusao')
  excluir(@SessaoAtual() s: Sessao, @Body(new ZodPipe(exclusao)) d: { motivo?: string }) {
    return this.servico.solicitarExclusao(s, d.motivo);
  }
}
