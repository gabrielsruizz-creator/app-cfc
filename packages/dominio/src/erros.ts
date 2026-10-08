export type TipoErro = 'validacao' | 'nao_encontrado' | 'conflito' | 'proibido' | 'regra_negocio';

/** Erro de regra de negócio com mensagem pronta para o usuário (pt-BR). */
export class ErroDominio extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
    public readonly tipo: TipoErro = 'regra_negocio',
    public readonly detalhes?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroDominio';
  }
}

export const naoEncontrado = (o_que: string) =>
  new ErroDominio(
    `${o_que}_nao_encontrado`,
    `${o_que.replace(/_/g, ' ')} não encontrado(a)`,
    'nao_encontrado',
  );

/** Identifica violações de restrição do Postgres, inclusive quando embrulhadas pelo Drizzle. */
export function codigoErroPostgres(erro: unknown): { code?: string; constraint?: string } {
  let atual: unknown = erro;
  for (let i = 0; i < 4 && atual; i++) {
    const e = atual as { code?: string; constraint?: string; cause?: unknown };
    if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) return { code: e.code, constraint: e.constraint };
    atual = e.cause;
  }
  return {};
}
