import type { PerfilInstrutorProprio } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, ErroApi } from './api';

/** Perfil do instrutor logado; `null` quando ele ainda não começou o cadastro profissional. */
export function usePerfilInstrutor() {
  return useQuery({
    queryKey: ['instrutor', 'perfil'],
    queryFn: async () => {
      try {
        return await api<PerfilInstrutorProprio>('/instrutor/perfil');
      } catch (e) {
        if (e instanceof ErroApi && e.status === 403) return null;
        throw e;
      }
    },
  });
}
