import { useQuery } from '@tanstack/react-query';
import { api, dataHora, mensagem, reais } from '../../api';
import { Aviso, Carregando, Status } from '../../componentes/comum';
import { useState } from 'react';

type Operacoes = {
  eventos: {
    id: string;
    tipo: string;
    status: string;
    tentativas: number;
    ultimoErro: string | null;
    ocorridoEm: string;
  }[];
  cobrancasPendentes: {
    id: string;
    valorCentavos: number;
    gateway: string;
    ultimoErro: string | null;
    criadoEm: string;
  }[];
  estornosPendentes: {
    id: string;
    valorCentavos: number;
    motivo: string;
    status: string;
    ultimoErro: string | null;
    criadoEm: string;
  }[];
};

export function AdminOperacoes() {
  const q = useQuery({
    queryKey: ['admin', 'operacoes'],
    queryFn: () => api<Operacoes>('/admin/operacoes'),
  });
  const [erro, setErro] = useState<string | null>(null);
  if (!q.data) return <Carregando />;
  const { eventos, cobrancasPendentes, estornosPendentes } = q.data;
  return (
    <div className="coluna">
      <h1>Operações</h1>
      <p className="suave">
        Eventos que falharam no worker e operações aguardando a configuração de um serviço externo
        (gateway de pagamento, push etc.).
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="cartao tabela-rolagem">
        <h2>Eventos com falha</h2>
        {eventos.length ? (
          <table>
            <thead>
              <tr>
                <th>Evento</th>
                <th>Status</th>
                <th>Tentativas</th>
                <th>Erro</th>
                <th>Quando</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td>{e.tipo}</td>
                  <td>
                    <Status valor={e.status} />
                  </td>
                  <td>{e.tentativas}</td>
                  <td className="pequeno">{e.ultimoErro}</td>
                  <td>{dataHora(e.ocorridoEm)}</td>
                  <td>
                    <button
                      className="botao pequeno secundario"
                      onClick={async () => {
                        try {
                          await api(`/admin/operacoes/eventos/${e.id}/reprocessar`, {
                            metodo: 'POST',
                          });
                          await q.refetch();
                        } catch (err) {
                          setErro(mensagem(err));
                        }
                      }}
                    >
                      Reprocessar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhuma falha. 🎉</p>
        )}
      </div>
      <div className="cartao tabela-rolagem">
        <h2>Cobranças pendentes de configuração</h2>
        {cobrancasPendentes.length ? (
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Gateway</th>
                <th>Motivo</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {cobrancasPendentes.map((c) => (
                <tr key={c.id}>
                  <td>{reais(c.valorCentavos)}</td>
                  <td>{c.gateway}</td>
                  <td>{c.ultimoErro}</td>
                  <td>{dataHora(c.criadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhuma.</p>
        )}
      </div>
      <div className="cartao tabela-rolagem">
        <h2>Estornos pendentes ou com falha</h2>
        {estornosPendentes.length ? (
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Motivo</th>
                <th>Status</th>
                <th>Erro</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {estornosPendentes.map((e) => (
                <tr key={e.id}>
                  <td>{reais(e.valorCentavos)}</td>
                  <td>{e.motivo}</td>
                  <td>
                    <Status valor={e.status} />
                  </td>
                  <td>{e.ultimoErro}</td>
                  <td>{dataHora(e.criadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhum.</p>
        )}
      </div>
    </div>
  );
}
