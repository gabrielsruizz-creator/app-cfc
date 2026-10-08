import type { AulaResumo } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, dataHora, mensagem } from '../../api';
import { Aviso, Campo, Carregando, Status } from '../../componentes/comum';

type AlunoMatriculado = {
  matriculaId: string;
  alunoId: string;
  nome: string;
  cpf: string | null;
  telefone: string;
  email: string;
  categorias: string[];
  status: string;
  desde: string;
  aulasDisponiveis: number;
  aulasConcluidas: number;
};

export function AutoescolaAlunos() {
  const [busca, setBusca] = useState('');
  const q = useQuery({
    queryKey: ['autoescola', 'alunos'],
    queryFn: () => api<AlunoMatriculado[]>('/autoescola/alunos'),
  });
  if (!q.data) return <Carregando />;
  const t = busca.trim().toLowerCase();
  const lista = t
    ? q.data.filter(
        (a) => a.nome.toLowerCase().includes(t) || a.cpf?.includes(t.replace(/\D/g, '') || '-'),
      )
    : q.data;
  return (
    <div className="coluna">
      <h1>Alunos</h1>
      <Campo
        rotulo="Buscar por nome ou CPF"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <div className="cartao tabela-rolagem">
        {lista.length ? (
          <table>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Contato</th>
                <th>Categoria</th>
                <th>Aulas disponíveis</th>
                <th>Concluídas</th>
                <th>Desde</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.matriculaId}>
                  <td>{a.nome}</td>
                  <td>
                    {a.telefone}
                    <div className="pequeno suave">{a.email}</div>
                  </td>
                  <td>{a.categorias.join(', ')}</td>
                  <td>{a.aulasDisponiveis}</td>
                  <td>{a.aulasConcluidas}</td>
                  <td>{dataHora(a.desde)}</td>
                  <td>
                    <Status valor={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">
            Nenhum aluno matriculado ainda. Alunos confirmados em "Novos alunos do app" aparecem
            aqui.
          </p>
        )}
      </div>
    </div>
  );
}

export function AutoescolaAgenda() {
  const q = useQuery({
    queryKey: ['autoescola', 'aulas'],
    queryFn: () => api<AulaResumo[]>('/autoescola/aulas'),
  });
  if (!q.data) return <Carregando />;
  const porDia = new Map<string, AulaResumo[]>();
  for (const a of q.data) {
    const dia = new Date(a.inicio).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
    porDia.set(dia, [...(porDia.get(dia) ?? []), a]);
  }
  return (
    <div className="coluna">
      <h1>Agenda</h1>
      <p className="suave">Aulas dos alunos da autoescola com os instrutores da equipe.</p>
      {!q.data.length && (
        <div className="cartao">
          <p className="suave">Nenhuma aula nas próximas 3 semanas.</p>
        </div>
      )}
      {[...porDia.entries()].map(([dia, aulas]) => (
        <div key={dia} className="cartao">
          <h2 style={{ textTransform: 'capitalize' }}>{dia}</h2>
          <table>
            <tbody>
              {aulas.map((a) => (
                <tr key={a.id}>
                  <td style={{ width: 90 }}>
                    {new Date(a.inicio).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>{a.aluno?.nome ?? '—'}</td>
                  <td>{a.instrutor?.nome ?? '—'}</td>
                  <td>
                    <Status valor={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

type Vinculo = {
  vinculoId: string;
  status: string;
  desde: string | null;
  instrutorId: string;
  nome: string;
  email: string;
  categorias: string[];
  statusInstrutor: string;
};

export function AutoescolaInstrutores() {
  const q = useQuery({
    queryKey: ['autoescola', 'instrutores'],
    queryFn: () => api<Vinculo[]>('/autoescola/instrutores'),
  });
  const [cpfOuEmail, setCpfOuEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  if (!q.data) return <Carregando />;
  return (
    <div className="coluna">
      <h1>Instrutores</h1>
      <p className="suave">
        Instrutores da equipe dão as aulas dos pacotes da autoescola. Eles precisam ter cadastro
        aprovado no app e aceitar o convite.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
      <form
        className="cartao"
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setOk(null);
          try {
            await api('/autoescola/instrutores/convites', { corpo: { cpfOuEmail } });
            setOk('Convite enviado. O instrutor responde pelo app.');
            setCpfOuEmail('');
            await q.refetch();
          } catch (e) {
            setErro(mensagem(e));
          }
        }}
      >
        <h2>Convidar instrutor</h2>
        <div className="linha">
          <div style={{ flex: 1, minWidth: 240 }}>
            <Campo
              rotulo="CPF ou e-mail do instrutor"
              value={cpfOuEmail}
              required
              minLength={5}
              onChange={(e) => setCpfOuEmail(e.target.value)}
            />
          </div>
          <button className="botao" style={{ alignSelf: 'flex-end' }}>
            Convidar
          </button>
        </div>
      </form>
      <div className="cartao tabela-rolagem">
        {q.data.length ? (
          <table>
            <thead>
              <tr>
                <th>Instrutor</th>
                <th>Categorias</th>
                <th>Vínculo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((v) => (
                <tr key={v.vinculoId}>
                  <td>
                    {v.nome}
                    <div className="pequeno suave">{v.email}</div>
                  </td>
                  <td>{v.categorias.join(', ')}</td>
                  <td>
                    <Status valor={v.status === 'ativo' ? 'aprovado' : 'pendente'} />
                  </td>
                  <td>
                    <button
                      className="botao perigo pequeno"
                      onClick={async () => {
                        if (!window.confirm(`Remover ${v.nome} da equipe?`)) return;
                        try {
                          await api(`/autoescola/instrutores/${v.vinculoId}`, {
                            metodo: 'DELETE',
                          });
                          await q.refetch();
                        } catch (e) {
                          setErro(mensagem(e));
                        }
                      }}
                    >
                      {v.status === 'ativo' ? 'Remover' : 'Cancelar convite'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhum instrutor na equipe ainda.</p>
        )}
      </div>
    </div>
  );
}
