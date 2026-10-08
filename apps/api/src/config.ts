import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORTA: z.coerce.number().default(3000),
  /** Definida por plataformas como o Render; tem prioridade sobre PORTA. */
  PORT: z.coerce.number().optional(),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/volante'),
  JWT_SEGREDO: z.string().min(16).default('desenvolvimento-troque-este-segredo'),
  /** simulado (testes) | nao_configurado | asaas */
  PAGAMENTO_GATEWAY: z.enum(['simulado', 'nao_configurado', 'asaas']).default('nao_configurado'),
  ARMAZENAMENTO_DIR: z.string().default('.armazenamento'),
  CORS_ORIGENS: z.string().default('*'),
  /** Pasta do painel web compilado (apps/web/dist) para servir em /painel. */
  PAINEL_DIR: z.string().optional(),
  /** Endereço público do painel web, usado no link de acompanhamento da aula. */
  URL_PAINEL: z.string().optional(),
  /** Definida pelo Render (ex.: https://volante-api.onrender.com). */
  RENDER_EXTERNAL_URL: z.string().optional(),
});

export type Config = z.infer<typeof esquema>;

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = esquema.parse(env);
  if (config.NODE_ENV === 'production') {
    if (config.JWT_SEGREDO === 'desenvolvimento-troque-este-segredo') {
      throw new Error('Defina JWT_SEGREDO em produção');
    }
    if (config.PAGAMENTO_GATEWAY === 'simulado') {
      throw new Error('O gateway "simulado" não pode ser usado em produção');
    }
  }
  return config;
}

export const CONFIG = Symbol('CONFIG');

/**
 * Base pública do painel: URL_PAINEL, ou o próprio serviço no Render (/painel), ou o Vite
 * (porta 5173) no mesmo computador que o app usou para chegar à API — no celular, o IP da rede local.
 */
export function urlPainel(c: Config, hostDaRequisicao?: string): string {
  const maquina = hostDaRequisicao?.split(':')[0];
  const base =
    c.URL_PAINEL ??
    (c.RENDER_EXTERNAL_URL
      ? `${c.RENDER_EXTERNAL_URL}/painel`
      : `http://${maquina || 'localhost'}:5173`);
  return base.replace(/\/$/, '');
}
