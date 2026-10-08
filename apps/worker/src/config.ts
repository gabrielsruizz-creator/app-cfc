import { z } from 'zod';
import { CfcPlusNaoConfigurado } from './adaptadores/cfc-plus-nao-configurado';
import { GatewayAsaas } from './adaptadores/gateway-asaas';
import { GatewayNaoConfigurado } from './adaptadores/gateway-nao-configurado';
import { GatewaySimulado } from './adaptadores/gateway-simulado';
import { PushExpo, PushNaoConfigurado } from './adaptadores/push';
import type { Db } from '@volante/db';
import { logConsole, type Dependencias } from './dependencias';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/volante'),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_URL: z.string().default('https://api-sandbox.asaas.com/v3'),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  PUSH_PROVEDOR: z.enum(['nenhum', 'expo']).default('nenhum'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  INTERVALO_ROTINAS_SEG: z.coerce.number().default(60),
});

export type ConfigWorker = z.infer<typeof esquema>;
export const lerConfigWorker = (env = process.env) => esquema.parse(env);

export function montarDependencias(db: Db, config: ConfigWorker): Dependencias {
  const gateways: Dependencias['gateways'] = {
    nao_configurado: new GatewayNaoConfigurado(),
    asaas: new GatewayAsaas({ apiKey: config.ASAAS_API_KEY, url: config.ASAAS_URL, webhookToken: config.ASAAS_WEBHOOK_TOKEN }),
  };
  // O simulador nunca é registrado em produção: cobranças "simulado" ficariam sem adaptador.
  if (config.NODE_ENV !== 'production') gateways.simulado = new GatewaySimulado();
  return {
    db,
    gateways,
    push: config.PUSH_PROVEDOR === 'expo' ? new PushExpo(config.EXPO_ACCESS_TOKEN) : new PushNaoConfigurado(),
    cfcPlus: new CfcPlusNaoConfigurado(),
    log: logConsole,
  };
}
