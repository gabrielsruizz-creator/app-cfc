import type { AulaResumo, EvolucaoAluno } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { CartaoAula } from '../../../src/componentes/CartaoAula';
import { PainelEvolucao } from '../../../src/componentes/PainelEvolucao';
import { Avatar, Carregando, Coluna, Linha, Tela, Texto } from '../../../src/componentes/ui';
import { api } from '../../../src/servicos/api';

type Ficha = {
  aluno: { alunoId: string; nome: string; selfieArquivoId: string | null; categoriaDesejada: string; aulasConcluidas: number };
  aulas: AulaResumo[];
  evolucao: EvolucaoAluno;
};

export default function FichaAluno() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['instrutor', 'ficha', id], queryFn: () => api<Ficha>(`/instrutor/alunos/${id}`) });
  if (q.isLoading || !q.data) return <Carregando />;
  const { aluno, aulas, evolucao } = q.data;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Linha gap={16}>
        <Avatar nome={aluno.nome} arquivoId={aluno.selfieArquivoId} tamanho={72} />
        <Coluna gap={2}>
          <Texto tipo="subtitulo">{aluno.nome}</Texto>
          <Texto tipo="suave">Categoria desejada: {aluno.categoriaDesejada}</Texto>
        </Coluna>
      </Linha>
      <PainelEvolucao dados={evolucao} />
      <Texto tipo="subtitulo">Aulas com você</Texto>
      {aulas.map((a) => (
        <CartaoAula key={a.id} aula={a} visao="instrutor" aoPressionar={() => router.push(`/area-instrutor/aula/${a.id}`)} />
      ))}
    </Tela>
  );
}
