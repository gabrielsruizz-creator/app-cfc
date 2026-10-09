import type { CfcPlusPort, ResultadoCfcPlus } from '../portas/cfc-plus';

/** Usado quando a integração está desligada no worker: registra como pendente, sem fingir sucesso. */
export class CfcPlusNaoConfigurado implements CfcPlusPort {
  private pendente(): Promise<ResultadoCfcPlus> {
    return Promise.resolve({
      status: 'pendente_configuracao',
      motivo: 'Integração com o CFC Plus desligada neste ambiente',
    });
  }
  testar() {
    return this.pendente();
  }
  enviarEvento() {
    return this.pendente();
  }
  enviarAula() {
    return this.pendente();
  }
}
