import type { AulaCfcPlus, EventoCfcPlus } from '@volante/contracts';
import type { CfcPlusPort, ConexaoCfcPlus, ResultadoCfcPlus } from '../portas/cfc-plus';

type Fetch = typeof fetch;

/** Base da API de integração; aceita o endereço do CFC Plus com ou sem "/api" no fim. */
export function baseIntegracao(url: string) {
  return `${url.replace(/\/+$/, '').replace(/\/api$/, '')}/api/integracoes/volante/v1`;
}

/** Adaptador HTTP real: chave do CFC no cabeçalho Authorization (Bearer). */
export class CfcPlusHttp implements CfcPlusPort {
  constructor(
    private readonly http: Fetch = fetch,
    private readonly tempoLimiteMs = 15_000,
  ) {}

  private async chamar(
    conexao: ConexaoCfcPlus,
    metodo: 'GET' | 'POST',
    caminho: string,
    corpo?: unknown,
    /** 404 em rota nova significa CFC Plus desatualizado, não endereço errado. */
    rotaNova = false,
  ): Promise<ResultadoCfcPlus> {
    let r: Response;
    try {
      r = await this.http(`${baseIntegracao(conexao.url)}${caminho}`, {
        method: metodo,
        headers: {
          authorization: `Bearer ${conexao.chave}`,
          'content-type': 'application/json',
          'user-agent': 'volante-worker',
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.tempoLimiteMs),
      });
    } catch (erro) {
      const e = erro as Error;
      return {
        status: 'erro',
        motivo:
          e.name === 'TimeoutError'
            ? 'O CFC Plus não respondeu a tempo'
            : `Não foi possível falar com o CFC Plus (${e.message})`,
        reprocessar: true,
      };
    }
    const texto = await r.text();
    let resposta: unknown = texto;
    try {
      resposta = texto ? JSON.parse(texto) : null;
    } catch {
      /* resposta não-JSON (ex.: página de erro de um proxy) */
    }
    const mensagem =
      (resposta as { mensagem?: string } | null)?.mensagem ?? `HTTP ${r.status} do CFC Plus`;
    if (r.ok || r.status === 409) return { status: 'sucesso', resposta, httpStatus: r.status };
    if (r.status === 401 || r.status === 403)
      return {
        status: 'erro',
        motivo:
          'O CFC Plus recusou a chave. Gere uma nova em Integrações no CFC Plus e conecte de novo.',
        reprocessar: false,
        credencialInvalida: true,
        resposta,
        httpStatus: r.status,
      };
    if (r.status === 404 && rotaNova)
      return {
        status: 'erro',
        motivo:
          'Este CFC Plus ainda não recebe aulas do app. Atualize o CFC Plus; o envio é repetido.',
        reprocessar: true,
        resposta,
        httpStatus: r.status,
      };
    if (r.status === 404)
      return {
        status: 'erro',
        motivo:
          'Endereço do CFC Plus não encontrado. Confira a URL (ex.: https://seu-cfcplus.com.br).',
        reprocessar: false,
        credencialInvalida: true,
        resposta,
        httpStatus: r.status,
      };
    return {
      status: 'erro',
      motivo: mensagem,
      reprocessar: r.status >= 500 || r.status === 429,
      resposta,
      httpStatus: r.status,
    };
  }

  testar(conexao: ConexaoCfcPlus) {
    return this.chamar(conexao, 'GET', '/status');
  }

  enviarEvento(conexao: ConexaoCfcPlus, evento: EventoCfcPlus) {
    return this.chamar(conexao, 'POST', '/eventos', evento);
  }

  enviarAula(conexao: ConexaoCfcPlus, aula: AulaCfcPlus) {
    return this.chamar(conexao, 'POST', '/aulas', aula, true);
  }
}
