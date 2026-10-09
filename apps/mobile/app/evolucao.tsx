import type { EvolucaoAluno } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { PainelEvolucao } from '../src/componentes/PainelEvolucao';
import { router } from 'expo-router';
import { Botao, Carregando, Tela, Vazio } from '../src/componentes/ui';
import { api } from '../src/servicos/api';

export default function Evolucao() {
  const q = useQuery({
    queryKey: ['aluno', 'evolucao'],
    queryFn: () => api<EvolucaoAluno>('/aluno/evolucao'),
  });
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Vazio titulo="Não foi possível carregar" />;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <PainelEvolucao dados={q.data} />
      <Botao
        titulo="Extrato de aulas e carga horária"
        icone="time"
        variante="secundario"
        aoPressionar={() => router.push('/extrato-aulas')}
      />
    </Tela>
  );
}
