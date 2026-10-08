import type { EvolucaoAluno } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { PainelEvolucao } from '../src/componentes/PainelEvolucao';
import { Carregando, Tela, Vazio } from '../src/componentes/ui';
import { api } from '../src/servicos/api';

export default function Evolucao() {
  const q = useQuery({ queryKey: ['aluno', 'evolucao'], queryFn: () => api<EvolucaoAluno>('/aluno/evolucao') });
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Vazio titulo="Não foi possível carregar" />;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <PainelEvolucao dados={q.data} />
    </Tela>
  );
}
