import type { Eu, RespostaSessao } from '@volante/contracts';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, sessao } from './api';

type ValorAuth = {
  carregando: boolean;
  eu: Eu | null;
  entrar: (login: string, senha: string) => Promise<Eu>;
  aplicar: (r: RespostaSessao) => void;
  recarregar: () => Promise<Eu | null>;
  sair: () => Promise<void>;
};

const Contexto = createContext<ValorAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!sessao.temToken()) {
      setEu(null);
      return null;
    }
    try {
      const d = await api<Eu>('/eu');
      setEu(d);
      if (!sessao.autoescola() && d.autoescolas[0])
        sessao.definirAutoescola(d.autoescolas[0].autoescolaId);
      return d;
    } catch {
      setEu(null);
      return null;
    }
  }, []);

  useEffect(() => {
    recarregar().finally(() => setCarregando(false));
  }, [recarregar]);

  const aplicar = (r: RespostaSessao) => {
    sessao.salvar(r.tokens.accessToken, r.tokens.refreshToken);
    sessao.definirAutoescola(r.eu.autoescolas[0]?.autoescolaId ?? null);
    setEu(r.eu);
  };

  return (
    <Contexto.Provider
      value={{
        carregando,
        eu,
        aplicar,
        recarregar,
        entrar: async (login, senha) => {
          const r = await api<RespostaSessao>('/auth/entrar', {
            corpo: { login, senha, dispositivo: 'painel-web' },
          });
          aplicar(r);
          return r.eu;
        },
        sair: async () => {
          await api('/auth/sair', { metodo: 'POST' }).catch(() => {});
          sessao.limpar();
          sessao.definirAutoescola(null);
          setEu(null);
        },
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useAuth() {
  const v = useContext(Contexto);
  if (!v) throw new Error('useAuth fora do provider');
  return v;
}
