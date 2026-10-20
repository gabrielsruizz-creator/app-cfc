import type { Db } from '@volante/db';
import type { CfcPlusPort } from './portas/cfc-plus';
import type { EmailPort } from './portas/email';
import type { GatewayPagamentoPort } from './portas/gateway-pagamento';
import type { PushPort } from './portas/push';

export type Log = {
  info: (msg: string, extra?: unknown) => void;
  erro: (msg: string, extra?: unknown) => void;
};

export type Dependencias = {
  db: Db;
  /** Adaptador por nome de gateway (coluna cobrancas.gateway). */
  gateways: Record<string, GatewayPagamentoPort>;
  push: PushPort;
  cfcPlus: CfcPlusPort;
  /** Cópias dos contratos para as partes. */
  email: EmailPort;
  log: Log;
};

export const logConsole: Log = {
  info: (msg, extra) => console.log(`[worker] ${msg}`, extra ?? ''),
  erro: (msg, extra) => console.error(`[worker] ${msg}`, extra ?? ''),
};

export const logSilencioso: Log = { info: () => {}, erro: () => {} };
