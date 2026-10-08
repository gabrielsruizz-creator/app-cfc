import type { AulaResumo } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { CartaoAula } from '../../src/componentes/CartaoAula';
import { Botao, Carregando, Chip, Linha, Tela, Vazio } from '../../src/componentes/ui';
import { api } from '../../src/servicos/api';

export default function AulasAluno() {
  const [filtro, setFiltro] = useState<'proximas' | 'anteriores'>('proximas');
  const q = useQuery({
    queryKey: ['aluno', 'aulas', filtro],
    queryFn: () => api<AulaResumo[]>(`/aluno/aulas?filtro=${filtro}`),
  });
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Linha>
        <Chip
          rotulo="Próximas"
          selecionado={filtro === 'proximas'}
          aoPressionar={() => setFiltro('proximas')}
        />
        <Chip
          rotulo="Anteriores"
          selecionado={filtro === 'anteriores'}
          aoPressionar={() => setFiltro('anteriores')}
        />
      </Linha>
      {q.isLoading ? (
        <Carregando />
      ) : q.data?.length ? (
        q.data.map((a) => (
          <CartaoAula
            key={a.id}
            aula={a}
            visao="aluno"
            aoPressionar={() => router.push(`/aula/${a.id}`)}
          />
        ))
      ) : (
        <Vazio
          icone="calendar-outline"
          titulo={filtro === 'proximas' ? 'Nenhuma aula agendada' : 'Nenhuma aula anterior'}
          acao={
            filtro === 'proximas' ? (
              <Botao titulo="Encontrar instrutor" aoPressionar={() => router.push('/buscar')} />
            ) : undefined
          }
        />
      )}
    </Tela>
  );
}
