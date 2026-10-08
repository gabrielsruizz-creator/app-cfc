import type { IntegracaoDisponivel } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { Carregando } from '../../componentes/comum';

export function AutoescolaIntegracoes() {
  const q = useQuery({
    queryKey: ['autoescola', 'integracoes'],
    queryFn: () => api<IntegracaoDisponivel[]>('/autoescola/integracoes'),
  });
  if (!q.data) return <Carregando />;
  return (
    <div className="coluna">
      <h1>Integrações</h1>
      <p className="suave">
        Conecte o app a outros sistemas da sua autoescola. As integrações são opcionais: o app
        funciona completo sem elas.
      </p>
      <div className="grade">
        {q.data.map((i) => (
          <div key={i.sistema} className="cartao">
            <div className="linha entre">
              <h2>{i.nome}</h2>
              <span className={`selo ${i.status === 'conectada' ? 'verde' : 'azul'}`}>
                {i.status === 'em_breve' ? 'Em breve' : i.status}
              </span>
            </div>
            <p className="suave">{i.descricao}</p>
            <button className="botao secundario" disabled>
              Conectar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
