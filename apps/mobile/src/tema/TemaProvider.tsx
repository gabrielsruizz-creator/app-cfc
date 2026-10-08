import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { paletas, type Cores } from './cores';

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';

type ValorTema = {
  cores: Cores;
  escuro: boolean;
  preferencia: PreferenciaTema;
  definirPreferencia: (p: PreferenciaTema) => void;
};

const TemaContexto = createContext<ValorTema | null>(null);
const CHAVE = 'preferencia_tema';

export function TemaProvider({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [preferencia, setPreferencia] = useState<PreferenciaTema>('sistema');

  useEffect(() => {
    SecureStore.getItemAsync(CHAVE)
      .then((v) => {
        if (v === 'claro' || v === 'escuro' || v === 'sistema') setPreferencia(v);
      })
      .catch(() => {});
  }, []);

  const valor = useMemo<ValorTema>(() => {
    const escuro = preferencia === 'sistema' ? sistema === 'dark' : preferencia === 'escuro';
    return {
      cores: escuro ? paletas.escuro : paletas.claro,
      escuro,
      preferencia,
      definirPreferencia: (p) => {
        setPreferencia(p);
        SecureStore.setItemAsync(CHAVE, p).catch(() => {});
      },
    };
  }, [preferencia, sistema]);

  return <TemaContexto.Provider value={valor}>{children}</TemaContexto.Provider>;
}

export function useTema() {
  const v = useContext(TemaContexto);
  if (!v) throw new Error('useTema fora do TemaProvider');
  return v;
}
