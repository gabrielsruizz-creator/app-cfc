import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, dataHora, mensagem, reais } from '../../api';
import { Aviso, Carregando, Status, VisualizadorArquivo } from '../../componentes/comum';

type Linha = {
  id: string;
  nome: string;
  email: string;
  status: string;
  categorias: string[];
  enviadoAnaliseEm: string | null;
};

const FILTROS = [
  ['em_analise', 'Em análise'],
  ['aprovado', 'Aprovados'],
  ['reprovado', 'Reprovados'],
  ['suspenso_documento', 'Suspensos'],
  ['', 'Todos'],
] as const;

export function AdminInstrutores() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'em_analise';
  const navegar = useNavigate();
  const q = useQuery({
    queryKey: ['admin', 'instrutores', status],
    queryFn: () => api<Linha[]>(`/admin/instrutores${status ? `?status=${status}` : ''}`),
  });
  return (
    <div className="coluna">
      <h1>Instrutores</h1>
      <div className="linha" role="tablist">
        {FILTROS.map(([v, r]) => (
          <button
            key={v}
            role="tab"
            aria-selected={status === v}
            className={`botao pequeno ${status === v ? '' : 'secundario'}`}
            onClick={() => setParams(v ? { status: v } : { status: '' })}
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
                <th>E-mail</th>
                <th>Categorias</th>
                <th>Enviado em</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((i) => (
                <tr
                  key={i.id}
                  className="clicavel"
                  tabIndex={0}
                  onClick={() => navegar(`/admin/instrutores/${i.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navegar(`/admin/instrutores/${i.id}`)}
                >
                  <td>{i.nome}</td>
                  <td>{i.email}</td>
                  <td>{i.categorias.join(', ')}</td>
                  <td>{dataHora(i.enviadoAnaliseEm)}</td>
                  <td>
                    <Status valor={i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhum instrutor neste filtro.</p>
        )}
      </div>
    </div>
  );
}

type Documento = {
  id: string;
  tipo: string;
  arquivoId: string;
  numero: string | null;
  validade: string | null;
  status: string;
  motivoReprovacao: string | null;
};
type Detalhe = {
  instrutor: {
    id: string;
    status: string;
    motivoStatus: string | null;
    bio: string | null;
    atuaDesde: number | null;
    categorias: string[];
    precoAulaCentavos: number | null;
    raioAtendimentoKm: number | null;
    forneceVeiculo: boolean;
  };
  usuario: {
    nome: string;
    cpf: string | null;
    email: string;
    telefone: string;
    dataNascimento: string | null;
    fotoArquivoId: string | null;
  };
  documentos: Documento[];
  veiculos: {
    id: string;
    placa: string;
    marca: string;
    modelo: string;
    ano: number;
    cambio: string;
    adaptadoPcd: boolean;
  }[];
};

const NOMES_DOC: Record<string, string> = {
  cnh: 'CNH',
  credencial_detran: 'Credencial DETRAN',
  documento_veiculo: 'Documento do veículo',
  comprovante_residencia: 'Comprovante de residência',
  selfie: 'Selfie',
};

export function AdminInstrutor() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'instrutor', id],
    queryFn: () => api<Detalhe>(`/admin/instrutores/${id}`),
  });
  const [docAtivo, setDocAtivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!q.data) return <Carregando />;
  const { instrutor: i, usuario: u, documentos, veiculos } = q.data;
  const doc = documentos.find((d) => d.id === docAtivo) ?? documentos[0];

  async function acao(caminho: string, pedirMotivo: boolean, sucesso: string) {
    setErro(null);
    setOk(null);
    let corpo: unknown;
    if (pedirMotivo) {
      const motivo = window.prompt('Informe o motivo (será mostrado ao instrutor):');
      if (!motivo) return;
      corpo = { motivo };
    }
    try {
      await api(caminho, corpo ? { corpo } : { metodo: 'POST' });
      setOk(sucesso);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  const todosAprovados = documentos.length >= 5 && documentos.every((d) => d.status === 'aprovado');
  return (
    <div className="coluna">
      <div className="linha entre">
        <div>
          <h1>{u.nome}</h1>
          <Status valor={i.status} />
        </div>
        <div className="linha">
          {i.status === 'em_analise' && (
            <>
              <button
                className="botao perigo"
                onClick={() =>
                  acao(`/admin/instrutores/${i.id}/reprovar`, true, 'Cadastro reprovado.')
                }
              >
                Reprovar cadastro
              </button>
              <button
                className="botao"
                disabled={!todosAprovados}
                title={todosAprovados ? '' : 'Aprove todos os documentos primeiro'}
                onClick={() =>
                  acao(`/admin/instrutores/${i.id}/aprovar`, false, 'Instrutor aprovado!')
                }
              >
                Aprovar instrutor
              </button>
            </>
          )}
          {i.status === 'aprovado' && (
            <button
              className="botao perigo"
              onClick={() =>
                acao(`/admin/instrutores/${i.id}/bloquear`, true, 'Instrutor bloqueado.')
              }
            >
              Bloquear
            </button>
          )}
        </div>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
      {i.motivoStatus && <Aviso tipo="alerta">Motivo registrado: {i.motivoStatus}</Aviso>}

      <div className="visualizador">
        <div className="cartao">
          <h2>Dados declarados</h2>
          <table>
            <tbody>
              <tr>
                <th>CPF</th>
                <td>{u.cpf}</td>
              </tr>
              <tr>
                <th>Nascimento</th>
                <td>{u.dataNascimento?.split('-').reverse().join('/') ?? '—'}</td>
              </tr>
              <tr>
                <th>E-mail</th>
                <td>{u.email}</td>
              </tr>
              <tr>
                <th>Telefone</th>
                <td>{u.telefone}</td>
              </tr>
              <tr>
                <th>Categorias</th>
                <td>{i.categorias.join(', ')}</td>
              </tr>
              <tr>
                <th>Atua desde</th>
                <td>{i.atuaDesde ?? '—'}</td>
              </tr>
              <tr>
                <th>Preço</th>
                <td>{i.precoAulaCentavos ? reais(i.precoAulaCentavos) : '—'}</td>
              </tr>
              <tr>
                <th>Raio</th>
                <td>{i.raioAtendimentoKm ? `${i.raioAtendimentoKm} km` : '—'}</td>
              </tr>
              <tr>
                <th>Veículo</th>
                <td>
                  {veiculos
                    .map(
                      (v) =>
                        `${v.marca} ${v.modelo} ${v.ano} · ${v.placa} · ${v.cambio}${v.adaptadoPcd ? ' · PcD' : ''}`,
                    )
                    .join('; ') || (i.forneceVeiculo ? 'Não cadastrado' : 'Usa o veículo do aluno')}
                </td>
              </tr>
            </tbody>
          </table>
          {i.bio && <p>{i.bio}</p>}
          {u.fotoArquivoId && (
            <>
              <h3>Foto de perfil</h3>
              <VisualizadorArquivo arquivoId={u.fotoArquivoId} />
            </>
          )}
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
                <span>
                  {NOMES_DOC[d.tipo] ?? d.tipo}
                  {d.validade && (
                    <span className="suave pequeno">
                      {' '}
                      · validade {d.validade.split('-').reverse().join('/')}
                    </span>
                  )}
                </span>
                <Status valor={d.status} />
              </button>
            ))}
          </div>
          {doc && (
            <>
              <VisualizadorArquivo arquivoId={doc.arquivoId} />
              {doc.motivoReprovacao && <Aviso tipo="erro">Reprovado: {doc.motivoReprovacao}</Aviso>}
              {doc.status === 'pendente' && (
                <div className="linha">
                  <button
                    className="botao perigo"
                    onClick={() =>
                      acao(
                        `/admin/instrutores/${i.id}/documentos/${doc.id}/reprovar`,
                        true,
                        'Documento reprovado.',
                      )
                    }
                  >
                    Reprovar documento
                  </button>
                  <button
                    className="botao"
                    onClick={() =>
                      acao(
                        `/admin/instrutores/${i.id}/documentos/${doc.id}/aprovar`,
                        false,
                        'Documento aprovado.',
                      )
                    }
                  >
                    Aprovar documento
                  </button>
                </div>
              )}
              <p className="pequeno suave">
                A visualização de documentos fica registrada na auditoria.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
