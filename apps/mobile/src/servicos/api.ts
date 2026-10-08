import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Endereço da API. Ordem: EXPO_PUBLIC_API_URL → mesmo computador que serve o Expo (porta 3000).
 * No Expo Go, o celular acessa a API pelo IP da máquina na rede local.
 */
export function urlApi(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const CHAVE_ACESSO = 'token_acesso';
const CHAVE_REFRESH = 'token_refresh';

let tokenAcesso: string | null = null;
let aoSessaoExpirar: (() => void) | null = null;

export const sessaoTokens = {
  async carregar() {
    tokenAcesso = await SecureStore.getItemAsync(CHAVE_ACESSO);
    return tokenAcesso;
  },
  async salvar(acesso: string, refresh: string) {
    tokenAcesso = acesso;
    await SecureStore.setItemAsync(CHAVE_ACESSO, acesso);
    await SecureStore.setItemAsync(CHAVE_REFRESH, refresh);
  },
  async limpar() {
    tokenAcesso = null;
    await SecureStore.deleteItemAsync(CHAVE_ACESSO);
    await SecureStore.deleteItemAsync(CHAVE_REFRESH);
  },
  atual: () => tokenAcesso,
  aoExpirar(fn: () => void) {
    aoSessaoExpirar = fn;
  },
};

export class ErroApi extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
    public detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

let renovando: Promise<boolean> | null = null;

async function renovarSessao(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(CHAVE_REFRESH);
  if (!refresh) return false;
  try {
    const r = await fetch(`${urlApi()}/auth/renovar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!r.ok) return false;
    const corpo = await r.json();
    await sessaoTokens.salvar(corpo.tokens.accessToken, corpo.tokens.refreshToken);
    return true;
  } catch {
    return false;
  }
}

type Opcoes = { metodo?: string; corpo?: unknown; cabecalhos?: Record<string, string>; formData?: FormData };

export async function api<T = unknown>(caminho: string, opcoes: Opcoes = {}, tentativa = 0): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...opcoes.cabecalhos };
  if (tokenAcesso) headers.authorization = `Bearer ${tokenAcesso}`;
  if (opcoes.corpo !== undefined) headers['content-type'] = 'application/json';
  let resposta: Response;
  try {
    resposta = await fetch(`${urlApi()}${caminho}`, {
      method: opcoes.metodo ?? (opcoes.corpo !== undefined || opcoes.formData ? 'POST' : 'GET'),
      headers,
      body: opcoes.formData ?? (opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined),
    });
  } catch {
    throw new ErroApi(0, 'sem_conexao', 'Não foi possível conectar ao servidor. Verifique sua internet.');
  }

  if (resposta.status === 401 && tokenAcesso && tentativa === 0 && !caminho.startsWith('/auth/')) {
    renovando ??= renovarSessao().finally(() => (renovando = null));
    if (await renovando) return api<T>(caminho, opcoes, 1);
    await sessaoTokens.limpar();
    aoSessaoExpirar?.();
  }

  if (resposta.status === 204) return undefined as T;
  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : undefined;
  if (!resposta.ok) {
    throw new ErroApi(
      resposta.status,
      corpo?.codigo ?? 'erro',
      corpo?.mensagem ?? 'Algo deu errado. Tente novamente.',
      corpo?.detalhes,
    );
  }
  return corpo as T;
}

/** Envia uma foto/arquivo e devolve o id do arquivo. */
export async function enviarArquivo(uri: string, finalidade: string, mime = 'image/jpeg'): Promise<string> {
  const form = new FormData();
  const nome = uri.split('/').pop() ?? 'arquivo.jpg';
  form.append('finalidade', finalidade);
  form.append('arquivo', { uri, name: nome, type: mime } as unknown as Blob);
  const r = await api<{ id: string }>('/arquivos', { formData: form });
  return r.id;
}

/** Fonte de imagem autenticada para <Image />. */
export function fonteArquivo(arquivoId: string | null | undefined, publico = false) {
  if (!arquivoId) return undefined;
  const uri = `${urlApi()}${publico ? '/publico' : ''}/arquivos/${arquivoId}`;
  return publico ? { uri } : { uri, headers: { Authorization: `Bearer ${tokenAcesso ?? ''}` } };
}

export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  return 'Algo deu errado. Tente novamente.';
}
