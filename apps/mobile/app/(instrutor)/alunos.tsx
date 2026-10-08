import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Avatar,
  Cartao,
  Carregando,
  Coluna,
  Linha,
  Tela,
  Texto,
  Vazio,
} from '../../src/componentes/ui';
import { api } from '../../src/servicos/api';
import { dataCurta } from '../../src/util/formatos';

type AlunoAtendido = {
  alunoId: string;
  nome: string;
  selfieArquivoId: string | null;
  categoriaDesejada: string;
  aulasConcluidas: number;
  proximaAula: string | null;
  ultimaAula: string | null;
};

export default function Alunos() {
  const q = useQuery({
    queryKey: ['instrutor', 'alunos'],
    queryFn: () => api<AlunoAtendido[]>('/instrutor/alunos'),
  });
  if (q.isLoading) return <Carregando />;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {q.data?.length ? (
        q.data.map((a) => (
          <Cartao
            key={a.alunoId}
            aoPressionar={() => router.push(`/area-instrutor/aluno/${a.alunoId}`)}
          >
            <Linha gap={12}>
              <Avatar nome={a.nome} arquivoId={a.selfieArquivoId} />
              <Coluna gap={2} style={{ flex: 1 }}>
                <Texto negrito>{a.nome}</Texto>
                <Texto tipo="suave">
                  Categoria {a.categoriaDesejada} · {a.aulasConcluidas} aula(s)
                </Texto>
                {a.proximaAula && <Texto tipo="pequeno">Próxima: {dataCurta(a.proximaAula)}</Texto>}
              </Coluna>
            </Linha>
          </Cartao>
        ))
      ) : (
        <Vazio
          icone="people-outline"
          titulo="Nenhum aluno ainda"
          texto="Seus alunos aparecem aqui depois da primeira aula."
        />
      )}
    </Tela>
  );
}
