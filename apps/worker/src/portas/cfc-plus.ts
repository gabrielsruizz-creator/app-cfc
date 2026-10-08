import type { EventoCfcPlus } from '@volante/contracts';

/**
 * Porta da integração com o ERP CFC Plus (Fase 4). A integração é por autoescola e opcional:
 * autoescola não conectada e instrutor autônomo nunca passam por aqui.
 * Contrato do outro lado: POST {url}/api/integracoes/volante/v1/eventos (ver docs/integracao-cfc-plus.md).
 */
export type ConexaoCfcPlus = { url: string; chave: string };

export type ResultadoCfcPlus =
  | { status: 'sucesso'; resposta: unknown; httpStatus?: number }
  | { status: 'pendente_configuracao'; motivo: string }
  | {
      status: 'erro';
      motivo: string;
      /** Falha passageira (rede, 5xx, 429): o worker tenta de novo com espera. */
      reprocessar: boolean;
      /** A chave ou o endereço foram recusados: a integração passa a "erro". */
      credencialInvalida?: boolean;
      resposta?: unknown;
      httpStatus?: number;
    };

export interface CfcPlusPort {
  /** Confere endereço e chave; em sucesso, a resposta traz o nome do CFC no ERP. */
  testar(conexao: ConexaoCfcPlus): Promise<ResultadoCfcPlus>;
  enviarEvento(conexao: ConexaoCfcPlus, evento: EventoCfcPlus): Promise<ResultadoCfcPlus>;
}
