import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { buscaInstrutores, consultaHorarios, type BuscaInstrutores } from '@volante/contracts';
import { Publico } from '../../nucleo/auth/sessao';
import { ZodPipe } from '../../nucleo/zod.pipe';
import { PublicoService } from './publico.service';

@Publico()
@Controller('publico')
export class PublicoController {
  constructor(private readonly servico: PublicoService) {}

  @Get('instrutores')
  buscar(@Query(new ZodPipe(buscaInstrutores)) filtros: BuscaInstrutores) {
    return this.servico.buscarInstrutores(filtros);
  }

  @Get('instrutores/:id')
  perfil(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.perfilInstrutor(id);
  }

  @Get('instrutores/:id/dias')
  dias(@Param('id', ParseUUIDPipe) id: string) {
    return this.servico.diasDisponiveis(id);
  }

  @Get('instrutores/:id/horarios')
  horarios(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(consultaHorarios)) q: { data: string },
  ) {
    return this.servico.horarios(id, q.data);
  }

  @Get('configuracoes')
  configuracoes() {
    return this.servico.configuracoes();
  }

  @Get('documentos-legais')
  documentosLegais() {
    return this.servico.documentosLegais();
  }

  @Get('habilidades')
  habilidades() {
    return this.servico.habilidades();
  }
}
