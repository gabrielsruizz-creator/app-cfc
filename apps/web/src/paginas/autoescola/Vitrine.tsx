import type { VitrineEntrada } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, dataHora, enviarArquivo, mensagem } from '../../api';
import {
  Aviso,
  Carregando,
  Conversas,
  Estrelas,
  VisualizadorArquivo,
} from '../../componentes/comum';

type Vitrine = {
  descricao: string | null;
  mensagemWhatsappPadrao: string | null;
  logoArquivoId: string | null;
  fotos: { id: string; arquivoId: string; legenda: string | null }[];
  horarios: { diaSemana: number; abre: string; fecha: string }[];
};

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MENSAGEM_PADRAO =
  'Olá, {aluno}! Aqui é da {autoescola}. Recebemos sua compra do {pacote} pelo app e vamos combinar sua matrícula.';

export function AutoescolaVitrine() {
  const q = useQuery({
    queryKey: ['autoescola', 'vitrine'],
    queryFn: () => api<Vitrine>('/autoescola/vitrine'),
  });
  const [form, setForm] = useState<VitrineEntrada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (q.data && !form)
      setForm({
        descricao: q.data.descricao ?? '',
        mensagemWhatsappPadrao: q.data.mensagemWhatsappPadrao ?? MENSAGEM_PADRAO,
        logoArquivoId: q.data.logoArquivoId ?? undefined,
        horarios: q.data.horarios,
      });
  }, [q.data, form]);

  if (!q.data || !form) return <Carregando />;
  const v = q.data;

  const horarioDo = (dia: number) => form.horarios.find((h) => h.diaSemana === dia);
  const mudarHorario = (dia: number, campo: 'abre' | 'fecha', valor: string) =>
    setForm({
      ...form,
      horarios: form.horarios.map((h) => (h.diaSemana === dia ? { ...h, [campo]: valor } : h)),
    });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    try {
      await api('/autoescola/vitrine', { metodo: 'PUT', corpo: form });
      setOk(true);
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  async function adicionarFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    try {
      const arquivoId = await enviarArquivo(arquivo, 'foto_autoescola');
      await api('/autoescola/fotos', { corpo: { arquivoId } });
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setEnviando(false);
    }
  }

  async function trocarLogo(arquivo: File | undefined) {
    if (!arquivo || !form) return;
    setErro(null);
    try {
      const logoArquivoId = await enviarArquivo(arquivo, 'logo');
      setForm({ ...form, logoArquivoId });
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  return (
    <div className="coluna">
      <h1>Vitrine</h1>
      <p className="suave">É assim que os alunos veem sua autoescola no app.</p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">Vitrine atualizada.</Aviso>}
      <form className="cartao" onSubmit={salvar}>
        <h2>Apresentação</h2>
        <div className="linha">
          <div style={{ width: 120 }}>
            {form.logoArquivoId ? (
              <VisualizadorArquivo arquivoId={form.logoArquivoId} />
            ) : (
              <div className="documento" style={{ minHeight: 120 }}>
                <span className="suave pequeno">Sem logo</span>
              </div>
            )}
          </div>
          <label className="botao secundario pequeno" style={{ cursor: 'pointer' }}>
            Trocar logo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => trocarLogo(e.target.files?.[0])}
            />
          </label>
        </div>
        <div className="campo">
          <label htmlFor="descricao">Descrição</label>
          <textarea
            id="descricao"
            maxLength={1500}
            value={form.descricao ?? ''}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </div>
        <div className="campo">
          <label htmlFor="msg">Mensagem padrão do WhatsApp</label>
          <textarea
            id="msg"
            maxLength={600}
            value={form.mensagemWhatsappPadrao}
            onChange={(e) => setForm({ ...form, mensagemWhatsappPadrao: e.target.value })}
          />
          <span className="ajuda">
            Usada no botão "Chamar no WhatsApp" da fila. Use {'{aluno}'}, {'{autoescola}'} e{' '}
            {'{pacote}'}.
          </span>
        </div>

        <h2>Horário de funcionamento</h2>
        <table>
          <tbody>
            {DIAS.map((nome, dia) => {
              const h = horarioDo(dia);
              return (
                <tr key={dia}>
                  <td style={{ width: 140 }}>
                    <label className="linha" style={{ gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={!!h}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            horarios: e.target.checked
                              ? [
                                  ...form.horarios,
                                  { diaSemana: dia, abre: '08:00', fecha: '18:00' },
                                ]
                              : form.horarios.filter((x) => x.diaSemana !== dia),
                          })
                        }
                      />
                      {nome}
                    </label>
                  </td>
                  <td>
                    {h ? (
                      <span className="linha">
                        <input
                          type="time"
                          aria-label={`${nome}: abre`}
                          value={h.abre}
                          onChange={(e) => mudarHorario(dia, 'abre', e.target.value)}
                        />
                        às
                        <input
                          type="time"
                          aria-label={`${nome}: fecha`}
                          value={h.fecha}
                          onChange={(e) => mudarHorario(dia, 'fecha', e.target.value)}
                        />
                      </span>
                    ) : (
                      <span className="suave">Fechado</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div>
          <button className="botao">Salvar vitrine</button>
        </div>
      </form>

      <div className="cartao">
        <div className="linha entre">
          <h2 style={{ margin: 0 }}>Fotos ({v.fotos.length}/12)</h2>
          {v.fotos.length < 12 && (
            <label className="botao secundario pequeno" style={{ cursor: 'pointer' }}>
              {enviando ? 'Enviando…' : 'Adicionar foto'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => adicionarFoto(e.target.files?.[0])}
              />
            </label>
          )}
        </div>
        {!v.fotos.length && <p className="suave">Mostre a estrutura, os carros e a equipe.</p>}
        <div className="fotos">
          {v.fotos.map((f) => (
            <figure key={f.id}>
              <VisualizadorArquivo arquivoId={f.arquivoId} />
              <button
                className="botao perigo pequeno"
                onClick={async () => {
                  try {
                    await api(`/autoescola/fotos/${f.id}`, { metodo: 'DELETE' });
                    await q.refetch();
                  } catch (e) {
                    setErro(mensagem(e));
                  }
                }}
              >
                Remover
              </button>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

type Avaliacao = {
  id: string;
  nota: number;
  comentario: string | null;
  resposta: string | null;
  criadoEm: string;
  autor: string;
};

export function AutoescolaAvaliacoes() {
  const q = useQuery({
    queryKey: ['autoescola', 'avaliacoes'],
    queryFn: () => api<Avaliacao[]>('/autoescola/avaliacoes'),
  });
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  if (!q.data) return <Carregando />;
  const media = q.data.length ? q.data.reduce((a, b) => a + b.nota, 0) / q.data.length : null;
  return (
    <div className="coluna">
      <h1>Avaliações</h1>
      {media !== null && (
        <p>
          <Estrelas nota={media} /> <strong>{media.toFixed(1)}</strong>{' '}
          <span className="suave">({q.data.length} avaliações)</span>
        </p>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!q.data.length && (
        <div className="cartao">
          <p className="suave">Nenhuma avaliação ainda.</p>
        </div>
      )}
      {q.data.map((a) => (
        <div key={a.id} className="cartao">
          <div className="linha entre">
            <strong>{a.autor.split(' ')[0]}</strong>
            <span className="pequeno suave">{dataHora(a.criadoEm)}</span>
          </div>
          <Estrelas nota={a.nota} />
          {a.comentario && <p style={{ margin: 0 }}>{a.comentario}</p>}
          {a.resposta ? (
            <Aviso>
              <strong>Sua resposta:</strong> {a.resposta}
            </Aviso>
          ) : (
            <form
              className="linha"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(`/autoescola/avaliacoes/${a.id}/resposta`, {
                    corpo: { resposta: respostas[a.id] },
                  });
                  await q.refetch();
                } catch (e) {
                  setErro(mensagem(e));
                }
              }}
            >
              <div className="campo" style={{ flex: 1, minWidth: 240 }}>
                <label htmlFor={`r-${a.id}`} className="pequeno">
                  Responder publicamente
                </label>
                <input
                  id={`r-${a.id}`}
                  maxLength={800}
                  value={respostas[a.id] ?? ''}
                  onChange={(e) => setRespostas({ ...respostas, [a.id]: e.target.value })}
                />
              </div>
              <button
                className="botao secundario"
                style={{ alignSelf: 'flex-end' }}
                disabled={(respostas[a.id] ?? '').trim().length < 2}
              >
                Responder
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

export function AutoescolaConversas() {
  return (
    <div className="coluna">
      <h1>Conversas</h1>
      <Conversas como="autoescola" />
    </div>
  );
}
