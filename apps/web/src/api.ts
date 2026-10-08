// VITE_API_URL (endereço completo) ou VITE_API_HOST (só o domínio, como o Render informa); senão, o proxy /api do Vite.
const HOST = import.meta.env.VITE_API_HOST as string | undefined;
const BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? (HOST ? `https://${HOST}` : '/api');

const armazenamento = {
  ler: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  gravar: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* navegador sem armazenamento: a sessão dura até fechar a aba */
    }
  },
};

let acesso: string | null = armazenamento.ler('volante_acesso');
let autoescolaAtiva: string | null = armazenamento.ler('volante_autoescola');

export const sessao = {
  salvar(a: string, refresh: string) {
    acesso = a;
    armazenamento.gravar('volante_acesso', a);
    armazenamento.gravar('volante_refresh', refresh);
  },
  limpar() {
    acesso = null;
    armazenamento.gravar('volante_acesso', null);
    armazenamento.gravar('volante_refresh', null);
  },
  temToken: () => !!acesso,
  definirAutoescola(id: string | null) {
    autoescolaAtiva = id;
    armazenamento.gravar('volante_autoescola', id);
  },
  autoescola: () => autoescolaAtiva,
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

async function renovar(): Promise<boolean> {
  const refresh = armazenamento.ler('volante_refresh');
  if (!refresh) return false;
  const r = await fetch(`${BASE}/auth/renovar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!r.ok) return false;
  const corpo = await r.json();
  sessao.salvar(corpo.tokens.accessToken, corpo.tokens.refreshToken);
  return true;
}

function cabecalhos(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { ...extra };
  if (acesso) h.authorization = `Bearer ${acesso}`;
  if (autoescolaAtiva) h['x-autoescola-id'] = autoescolaAtiva;
  return h;
}

export async function api<T = unknown>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; form?: FormData } = {},
  tentativa = 0,
): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, {
    method: opcoes.metodo ?? (opcoes.corpo !== undefined || opcoes.form ? 'POST' : 'GET'),
    headers: cabecalhos(opcoes.corpo !== undefined ? { 'content-type': 'application/json' } : {}),
    body: opcoes.form ?? (opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined),
  });
  if (r.status === 401 && acesso && tentativa === 0 && !caminho.startsWith('/auth/')) {
    if (await renovar()) return api<T>(caminho, opcoes, 1);
    sessao.limpar();
    window.location.assign(`${import.meta.env.BASE_URL}entrar`);
  }
  if (r.status === 204) return undefined as T;
  const texto = await r.text();
  const corpo = texto ? JSON.parse(texto) : undefined;
  if (!r.ok)
    throw new ErroApi(
      r.status,
      corpo?.codigo ?? 'erro',
      corpo?.mensagem ?? 'Erro inesperado',
      corpo?.detalhes,
    );
  return corpo as T;
}

/** Baixa um arquivo protegido e devolve uma URL local para exibir (imagem/PDF). */
export async function urlArquivo(id: string): Promise<{ url: string; tipo: string }> {
  const r = await fetch(`${BASE}/arquivos/${id}`, { headers: cabecalhos() });
  if (!r.ok) throw new ErroApi(r.status, 'arquivo', 'Não foi possível abrir o arquivo');
  const blob = await r.blob();
  return { url: URL.createObjectURL(blob), tipo: blob.type };
}

export async function enviarArquivo(arquivo: File, finalidade: string): Promise<string> {
  const form = new FormData();
  form.append('finalidade', finalidade);
  form.append('arquivo', arquivo);
  const r = await api<{ id: string }>('/arquivos', { form });
  return r.id;
}

export const mensagem = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado');

export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
