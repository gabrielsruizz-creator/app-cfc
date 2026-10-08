import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Cartao, Carregando, Linha, Tela, Texto, Vazio } from '../src/componentes/ui';
import { api } from '../src/servicos/api';
import { useAuth } from '../src/servicos/AuthProvider';
import { useTema } from '../src/tema/TemaProvider';
import { dataHora } from '../src/util/formatos';

type Notificacao = {
  id: string;
  titulo: string;
  corpo: string;
  lida: boolean;
  criadoEm: string;
  dados: { tela?: string; aulaId?: string };
};

export default function Notificacoes() {
  const { cores } = useTema();
  const { modo } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['notificacoes'],
    queryFn: () => api<Notificacao[]>('/notificacoes'),
  });

  useEffect(() => {
    if (q.data?.some((n) => !n.lida)) {
      api('/notificacoes/lidas', { metodo: 'POST' })
        .then(() => queryClient.invalidateQueries({ queryKey: ['notificacoes'] }))
        .catch(() => {});
    }
  }, [q.data, queryClient]);

  if (q.isLoading) return <Carregando />;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {q.data?.length ? (
        q.data.map((n) => (
          <Cartao
            key={n.id}
            style={!n.lida ? { borderColor: cores.primaria, borderWidth: 1.5 } : undefined}
            aoPressionar={
              n.dados.aulaId
                ? () =>
                    router.push(
                      modo === 'instrutor'
                        ? `/area-instrutor/aula/${n.dados.aulaId}`
                        : `/aula/${n.dados.aulaId}`,
                    )
                : undefined
            }
          >
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto negrito style={{ flex: 1 }}>
                {n.titulo}
              </Texto>
              <Texto tipo="pequeno">{dataHora(n.criadoEm)}</Texto>
            </Linha>
            <Texto tipo="suave">{n.corpo}</Texto>
          </Cartao>
        ))
      ) : (
        <Vazio icone="notifications-outline" titulo="Nenhuma notificação" />
      )}
    </Tela>
  );
}
