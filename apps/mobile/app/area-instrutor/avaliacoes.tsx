import { useQuery } from '@tanstack/react-query';
import { Cartao, Carregando, Estrelas, Linha, Tela, Texto, Vazio } from '../../src/componentes/ui';
import { api } from '../../src/servicos/api';
import { dataCurta } from '../../src/util/formatos';

type Avaliacao = {
  id: string;
  nota: number;
  comentario: string | null;
  criadoEm: string;
  status: string;
};

export default function Avaliacoes() {
  const q = useQuery({
    queryKey: ['instrutor', 'avaliacoes'],
    queryFn: () => api<Avaliacao[]>('/instrutor/avaliacoes'),
  });
  if (q.isLoading) return <Carregando />;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {q.data?.length ? (
        q.data.map((a) => (
          <Cartao key={a.id}>
            <Linha style={{ justifyContent: 'space-between' }}>
              <Estrelas nota={a.nota} />
              <Texto tipo="pequeno">{dataCurta(a.criadoEm)}</Texto>
            </Linha>
            {a.comentario && <Texto>{a.comentario}</Texto>}
          </Cartao>
        ))
      ) : (
        <Vazio icone="star-outline" titulo="Nenhuma avaliação ainda" />
      )}
    </Tela>
  );
}
