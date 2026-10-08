import type { CfcPlusPort, ResultadoCfcPlus } from '../portas/cfc-plus';

/** Único adaptador do CFC Plus até a Fase 4: registra a operação como pendente, sem fingir sucesso. */
export class CfcPlusNaoConfigurado implements CfcPlusPort {
  async executar(): Promise<ResultadoCfcPlus> {
    return { status: 'pendente_configuracao', motivo: 'Integração com o CFC Plus ainda não disponível' };
  }
}
