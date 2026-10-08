import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, dataHora, mensagem } from '../../api';
import { Aviso, Carregando, Status, VisualizadorArquivo } from '../../componentes/comum';

type Linha = {
  id: string;
  nomeFantasia: string;
  cnpj: string;
  municipio: string;
  uf: string;
  status: string;
  enviadaAnaliseEm: string | null;
};

export function AdminAutoescolas() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'em_analise';
  const navegar = useNavigate();
  const q = useQuery({
    queryKey: ['admin', 'autoescolas', status],
    queryFn: () => api<Linha[]>(`/admin/autoescolas${status ? `?status=${status}` : ''}`),
  });
  return (
    <div className="coluna">
      <h1>Autoescolas</h1>
      <div className="linha">
        {[
          ['em_analise', 'Em análise'],
          ['aprovada', 'Aprovadas'],
          ['rascunho', 'Rascunho'],
          ['', 'Todas'],
        ].map(([v, r]) => (
          <button
            key={v}
            className={`botao pequeno ${status === v ? '' : 'secundario'}`}
            onClick={() => setParams({ status: v! })}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="cartao tabela-rolagem">
        {q.isLoading ? (
          <Carregando />
        ) : q.data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Cidade</th>
                <th>Enviada em</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr
                  key={a.id}
                  className="clicavel"
                  tabIndex={0}
                  onClick={() => navegar(`/admin/autoescolas/${a.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navegar(`/admin/autoescolas/${a.id}`)}
                >
                  <td>{a.nomeFantasia}</td>
                  <td>{a.cnpj}</td>
                  <td>
                    {a.municipio}/{a.uf}
                  </td>
                  <td>{dataHora(a.enviadaAnaliseEm)}</td>
                  <td>
                    <Status valor={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhuma autoescola neste filtro.</p>
        )}
      </div>
    </div>
  );
}

type Detalhe = {
  autoescola: Record<string, string> & { id: string; status: string; nomeFantasia: string };
  documentos: {
    id: string;
    tipo: string;
    arquivoId: string;
    status: string;
    motivoReprovacao: string | null;
  }[];
};

export function AdminAutoescola() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'autoescola', id],
    queryFn: () => api<Detalhe>(`/admin/autoescolas/${id}`),
  });
  const [docAtivo, setDocAtivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!q.data) return <Carregando />;
  const { autoescola: a, documentos } = q.data;
  const doc = documentos.find((d) => d.id === docAtivo) ?? documentos[0];

  async function acao(caminho: string, pedirMotivo: boolean) {
    setErro(null);
    const motivo = pedirMotivo ? window.prompt('Motivo:') : undefined;
    if (pedirMotivo && !motivo) return;
    try {
      await api(caminho, motivo ? { corpo: { motivo } } : { metodo: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  return (
    <div className="coluna">
      <div className="linha entre">
        <div>
          <h1>{a.nomeFantasia}</h1>
          <Status valor={a.status} />
        </div>
        {a.status === 'em_analise' && (
          <div className="linha">
            <button
              className="botao perigo"
              onClick={() => acao(`/admin/autoescolas/${a.id}/reprovar`, true)}
            >
              Reprovar
            </button>
            <button
              className="botao"
              onClick={() => acao(`/admin/autoescolas/${a.id}/aprovar`, false)}
            >
              Aprovar autoescola
            </button>
          </div>
        )}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="visualizador">
        <div className="cartao">
          <h2>Dados</h2>
          <table>
            <tbody>
              <tr>
                <th>Razão social</th>
                <td>{a.razaoSocial}</td>
              </tr>
              <tr>
                <th>CNPJ</th>
                <td>{a.cnpj}</td>
              </tr>
              <tr>
                <th>Credenciamento DETRAN</th>
                <td>{a.credenciamentoDetran}</td>
              </tr>
              <tr>
                <th>Endereço</th>
                <td>
                  {a.logradouro}, {a.numero} — {a.bairro}, {a.municipio}/{a.uf}
                </td>
              </tr>
              <tr>
                <th>Contato</th>
                <td>
                  {a.telefone} · {a.email}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="cartao">
          <h2>Documentos</h2>
          <div className="coluna lista-docs">
            {documentos.map((d) => (
              <button
                key={d.id}
                className={doc?.id === d.id ? 'ativo' : ''}
                onClick={() => setDocAtivo(d.id)}
              >
                <span>{d.tipo.replace(/_/g, ' ')}</span>
                <Status valor={d.status} />
              </button>
            ))}
          </div>
          {doc ? (
            <>
              <VisualizadorArquivo arquivoId={doc.arquivoId} />
              {doc.status === 'pendente' && (
                <div className="linha">
                  <button
                    className="botao perigo"
                    onClick={() =>
                      acao(`/admin/autoescolas/${a.id}/documentos/${doc.id}/reprovar`, true)
                    }
                  >
                    Reprovar documento
                  </button>
                  <button
                    className="botao"
                    onClick={() =>
                      acao(`/admin/autoescolas/${a.id}/documentos/${doc.id}/aprovar`, false)
                    }
                  >
                    Aprovar documento
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="suave">Nenhum documento enviado.</p>
          )}
        </div>
      </div>
    </div>
  );
}
