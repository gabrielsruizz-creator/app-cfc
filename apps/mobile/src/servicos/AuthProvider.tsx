import type { Eu, RespostaSessao } from '@volante/contracts';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, sessaoTokens } from './api';

export type Modo = 'aluno' | 'instrutor';

type ValorAuth = {
  carregando: boolean;
  eu: Eu | null;
  modo: Modo;
  definirModo: (m: Modo) => void;
  aplicarSessao: (r: RespostaSessao) => Promise<void>;
  recarregar: () => Promise<Eu | null>;
  sair: () => Promise<void>;
};

const AuthContexto = createContext<ValorAuth | null>(null);
const CHAVE_MODO = 'modo_app';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [eu, setEu] = useState<Eu | null>(null);
  const [modo, setModo] = useState<Modo>('aluno');
  const queryClient = useQueryClient();

  const recarregar = useCallback(async () => {
    if (!sessaoTokens.atual()) {
      setEu(null);
      return null;
    }
    try {
      const dados = await api<Eu>('/eu');
      setEu(dados);
      return dados;
    } catch {
      setEu(null);
      return null;
    }
  }, []);

  useEffect(() => {
    sessaoTokens.aoExpirar(() => setEu(null));
    (async () => {
      const salvo = await SecureStore.getItemAsync(CHAVE_MODO).catch(() => null);
      if (salvo === 'aluno' || salvo === 'instrutor') setModo(salvo);
      await sessaoTokens.carregar();
      await recarregar();
      setCarregando(false);
    })();
  }, [recarregar]);

  const valor = useMemo<ValorAuth>(
    () => ({
      carregando,
      eu,
      modo,
      definirModo: (m) => {
        setModo(m);
        SecureStore.setItemAsync(CHAVE_MODO, m).catch(() => {});
      },
      aplicarSessao: async (r) => {
        await sessaoTokens.salvar(r.tokens.accessToken, r.tokens.refreshToken);
        setEu(r.eu);
        if (r.eu.instrutor && !r.eu.aluno) {
          setModo('instrutor');
          SecureStore.setItemAsync(CHAVE_MODO, 'instrutor').catch(() => {});
        }
      },
      recarregar,
      sair: async () => {
        await api('/auth/sair', { metodo: 'POST' }).catch(() => {});
        await sessaoTokens.limpar();
        queryClient.clear();
        setEu(null);
      },
    }),
    [carregando, eu, modo, recarregar, queryClient],
  );

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContexto);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}
