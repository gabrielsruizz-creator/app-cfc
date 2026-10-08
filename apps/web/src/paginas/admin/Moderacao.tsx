import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, dataHora, mensagem, reais } from '../../api';
import { Abas, Aviso, Campo, Carregando, Status } from '../../componentes/comum';

// ---------- Usuários ----------

type Usuario = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf: string | null;
  status: string;
  criadoEm: string;
  ultimoAcessoEm: string | null;
  aluno: boolean;
  instrutor: boolean;
};

export function AdminUsuarios() {
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'usuarios', termo],
    queryFn: () => api<Usuario[]>(`/admin/usuarios?busca=${encodeURIComponent(termo)}`),
  });

  async function alterar(u: Usuario, acao: 'bloquear' | 'desbloquear') {
    const motivo = window.prompt(
      acao === 'bloquear'
        ? `Motivo do bloqueio de ${u.nome} (fica na auditoria):`
        : `Motivo do desbloqueio de ${u.nome}:`,
    );
    if (!motivo || motivo.trim().length < 5) return;
    setErro(null);
    try {
      await api(`/admin/usuarios/${u.id}/${acao}`, { corpo: { motivo } });
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  return (
    <div className="coluna">
      <h1>Usuários</h1>
      <form
        className="linha"
        onSubmit={(e) => {
          e.preventDefault();
          setTermo(busca);
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <Campo
            rotulo="Buscar por nome, e-mail ou CPF"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <button className="botao" style={{ alignSelf: 'flex-end' }}>
          Buscar
        </button>
      </form>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="cartao tabela-rolagem">
        {!q.data ? (
          <Carregando />
        ) : q.data.length ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Contato</th>
                <th>Perfis</th>
                <th>Último acesso</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.nome}
                    <div className="pequeno suave">desde {dataHora(u.criadoEm)}</div>
                  </td>
                  <td>
                    {u.email}
                    <div className="pequeno suave">{u.telefone}</div>
                  </td>
                  <td>
                    {[u.aluno && 'Aluno', u.instrutor && 'Instrutor'].filter(Boolean).join(', ') ||
                      '—'}
                  </td>
                  <td>{dataHora(u.ultimoAcessoEm)}</td>
                  <td>
                    <Status valor={u.status} />
                  </td>
                  <td>
                    {u.status === 'bloqueado' ? (
                      <button
                        className="botao secundario pequeno"
                        onClick={() => alterar(u, 'desbloquear')}
                      >
                        Desbloquear
                      </button>
                    ) : u.status === 'ativo' ? (
                      <button
                        className="botao perigo pequeno"
                        onClick={() => alterar(u, 'bloquear')}
                      >
                        Bloquear
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhum usuário encontrado.</p>
        )}
      </div>
    </div>
  );
}

// ---------- Denúncias ----------

type Denuncia = {
  d: {
    id: string;
    alvoTipo: string;
    alvoId: string;
    aulaId: string | null;
    motivo: string;
    descricao: string | null;
    status: string;
    resolucao: string | null;
    criadoEm: string;
  };
  denunciante: string;
};

export function AdminDenuncias() {
  const [aba, setAba] = useState<'aberta' | 'resolvida' | 'descartada'>('aberta');
  const [erro, setErro] = useState<string | null>(null);
  const [resolucoes, setResolucoes] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ['admin', 'denuncias', aba],
    queryFn: () => api<Denuncia[]>(`/admin/denuncias?status=${aba}`),
  });

  async function resolver(id: string, status: 'resolvida' | 'descartada') {
    setErro(null);
    try {
      await api(`/admin/denuncias/${id}/resolver`, {
        corpo: { status, resolucao: resolucoes[id] },
      });
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  return (
    <div className="coluna">
      <h1>Denúncias</h1>
      <Abas
        atual={aba}
        onMudar={setAba}
        abas={[
          { id: 'aberta', rotulo: 'Abertas' },
          { id: 'resolvida', rotulo: 'Resolvidas' },
          { id: 'descartada', rotulo: 'Descartadas' },
        ]}
      />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!q.data ? (
        <Carregando />
      ) : !q.data.length ? (
        <div className="cartao">
          <p className="suave">Nada por aqui.</p>
        </div>
      ) : (
        q.data.map(({ d, denunciante }) => (
          <div key={d.id} className="cartao">
            <div className="linha entre">
              <strong>
                {d.motivo} · {d.alvoTipo}
              </strong>
              <span className="pequeno suave">
                por {denunciante} em {dataHora(d.criadoEm)}
              </span>
            </div>
            {d.descricao && <p style={{ margin: 0 }}>{d.descricao}</p>}
            <span className="pequeno suave">
              Alvo: {d.alvoTipo} {d.alvoId}
              {d.aulaId ? ` · aula ${d.aulaId}` : ''}
            </span>
            {d.resolucao ? (
              <Aviso>Resolução: {d.resolucao}</Aviso>
            ) : (
              <div className="linha">
                <div style={{ flex: 1, minWidth: 240 }}>
                  <Campo
                    rotulo="Resolução (fica na auditoria)"
                    value={resolucoes[d.id] ?? ''}
                    onChange={(e) => setResolucoes({ ...resolucoes, [d.id]: e.target.value })}
                  />
                </div>
                <button
                  className="botao"
                  style={{ alignSelf: 'flex-end' }}
                  disabled={(resolucoes[d.id] ?? '').trim().length < 5}
                  onClick={() => resolver(d.id, 'resolvida')}
                >
                  Resolver
                </button>
                <button
                  className="botao secundario"
                  style={{ alignSelf: 'flex-end' }}
                  disabled={(resolucoes[d.id] ?? '').trim().length < 5}
                  onClick={() => resolver(d.id, 'descartada')}
                >
                  Descartar
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ---------- Disputas ----------

type Disputa = {
  d: {
    id: string;
    aulaId: string;
    abertaPorPapel: string;
    motivo: string;
    descricao: string;
    status: string;
    decisao: string | null;
    valorEstornoCentavos: number | null;
    resolucao: string | null;
    criadoEm: string;
  };
  aula: { inicio: string; status: string; valorCentavos: number };
  abertaPor: string;
};

export function AdminDisputas() {
  const [aba, setAba] = useState<'aberta' | 'resolvida'>('aberta');
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<
    Record<string, { decisao: string; valor: string; resolucao: string }>
  >({});
  const q = useQuery({
    queryKey: ['admin', 'disputas', aba],
    queryFn: () => api<Disputa[]>(`/admin/disputas?status=${aba}`),
  });

  async function decidir(id: string) {
    const f = form[id];
    if (!f) return;
    setErro(null);
    try {
      await api(`/admin/disputas/${id}/decidir`, {
        corpo: {
          decisao: f.decisao,
          resolucao: f.resolucao,
          valorEstornoCentavos:
            f.decisao === 'estorno_parcial'
              ? Math.round(Number(f.valor.replace(',', '.')) * 100)
              : undefined,
        },
      });
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  return (
    <div className="coluna">
      <h1>Disputas</h1>
      <p className="suave">
        Problemas relatados em aulas. Enquanto a disputa está aberta, a aula não é confirmada
        automaticamente e o valor segue retido.
      </p>
      <Abas
        atual={aba}
        onMudar={setAba}
        abas={[
          { id: 'aberta', rotulo: 'Abertas' },
          { id: 'resolvida', rotulo: 'Resolvidas' },
        ]}
      />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!q.data ? (
        <Carregando />
      ) : !q.data.length ? (
        <div className="cartao">
          <p className="suave">Nada por aqui.</p>
        </div>
      ) : (
        q.data.map(({ d, aula, abertaPor }) => {
          const f = form[d.id] ?? { decisao: 'negada', valor: '', resolucao: '' };
          const mudar = (campo: Partial<typeof f>) =>
            setForm({ ...form, [d.id]: { ...f, ...campo } });
          return (
            <div key={d.id} className="cartao">
              <div className="linha entre">
                <strong>{d.motivo}</strong>
                <Status valor={aula.status} />
              </div>
              <p style={{ margin: 0 }}>{d.descricao}</p>
              <span className="pequeno suave">
                Aberta por {abertaPor} ({d.abertaPorPapel}) em {dataHora(d.criadoEm)} · aula de{' '}
                {dataHora(aula.inicio)} · {reais(aula.valorCentavos)}
              </span>
              {d.status !== 'aberta' ? (
                <Aviso>
                  Decisão: {d.decisao?.replace(/_/g, ' ')}
                  {d.valorEstornoCentavos ? ` (${reais(d.valorEstornoCentavos)})` : ''} —{' '}
                  {d.resolucao}
                </Aviso>
              ) : (
                <div className="coluna">
                  <div className="campos">
                    <div className="campo">
                      <label htmlFor={`dec-${d.id}`}>Decisão</label>
                      <select
                        id={`dec-${d.id}`}
                        value={f.decisao}
                        onChange={(e) => mudar({ decisao: e.target.value })}
                      >
                        <option value="negada">Negar (aula mantida)</option>
                        <option value="estorno_parcial">Estorno parcial (aula avulsa)</option>
                        <option value="estorno_total">Estorno total</option>
                      </select>
                    </div>
                    {f.decisao === 'estorno_parcial' && (
                      <Campo
                        rotulo="Valor a devolver (R$)"
                        inputMode="decimal"
                        value={f.valor}
                        onChange={(e) => mudar({ valor: e.target.value })}
                      />
                    )}
                  </div>
                  <Campo
                    rotulo="Justificativa (as partes e a auditoria veem)"
                    value={f.resolucao}
                    onChange={(e) => mudar({ resolucao: e.target.value })}
                  />
                  <div>
                    <button
                      className="botao"
                      disabled={f.resolucao.trim().length < 5}
                      onClick={() => decidir(d.id)}
                    >
                      Decidir
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
