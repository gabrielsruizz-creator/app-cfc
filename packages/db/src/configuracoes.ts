import {
  CONFIGURACOES_PADRAO,
  configuracoesSchema,
  type ChaveConfiguracao,
  type Configuracoes,
} from '@volante/contracts';
import type { Executor } from './cliente';
import { configuracoes } from './schema';

/** Lê todas as configurações, completando com os valores padrão. */
export async function lerConfiguracoes(tx: Executor): Promise<Configuracoes> {
  const linhas = await tx.select().from(configuracoes);
  const valores: Record<string, unknown> = { ...CONFIGURACOES_PADRAO };
  for (const l of linhas) if (l.chave in CONFIGURACOES_PADRAO) valores[l.chave] = l.valor;
  return configuracoesSchema.parse(valores);
}

export async function lerConfiguracao<K extends ChaveConfiguracao>(
  tx: Executor,
  chave: K,
): Promise<Configuracoes[K]> {
  return (await lerConfiguracoes(tx))[chave];
}
