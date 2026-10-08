import type { Recibo } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { Cartao, Carregando, Linha, Tela, Texto, Vazio } from '../src/componentes/ui';
import { api } from '../src/servicos/api';
import { dataHora, formatarCentavos } from '../src/util/formatos';

export default function Recibos() {
  const q = useQuery({ queryKey: ['aluno', 'recibos'], queryFn: () => api<Recibo[]>('/aluno/recibos') });
  if (q.isLoading) return <Carregando />;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {q.data?.length ? (
        q.data.map((r) => (
          <Cartao key={r.id}>
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto negrito>Recibo nº {r.numero}</Texto>
              <Texto negrito>{formatarCentavos(r.valorCentavos)}</Texto>
            </Linha>
            {r.itens.map((i, n) => (
              <Texto key={n} tipo="suave">
                {i.descricao}
              </Texto>
            ))}
            <Texto tipo="pequeno">
              {r.emissorNome} · {dataHora(r.emitidoEm)}
            </Texto>
          </Cartao>
        ))
      ) : (
        <Vazio icone="receipt-outline" titulo="Nenhum recibo ainda" texto="Os recibos aparecem aqui depois de cada pagamento." />
      )}
    </Tela>
  );
}
