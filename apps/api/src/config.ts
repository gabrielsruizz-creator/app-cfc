import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORTA: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/volante'),
  JWT_SEGREDO: z.string().min(16).default('desenvolvimento-troque-este-segredo'),
  /** simulado (testes) | nao_configurado | asaas */
  PAGAMENTO_GATEWAY: z.enum(['simulado', 'nao_configurado', 'asaas']).default('nao_configurado'),
  ARMAZENAMENTO_DIR: z.string().default('.armazenamento'),
  CORS_ORIGENS: z.string().default('*'),
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
