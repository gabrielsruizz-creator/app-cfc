import type { Consumidor } from '../outbox';
import { integrarCfcPlus, sincronizarCfcPlus, testarCfcPlus } from './cfc-plus';
import { notificar } from './notificacoes';
import { CONSUMIDORES_PAGAMENTO } from './pagamentos';

export const CONSUMIDORES: Consumidor[] = [
  ...CONSUMIDORES_PAGAMENTO,
  notificar,
  integrarCfcPlus,
  testarCfcPlus,
  sincronizarCfcPlus,
];
