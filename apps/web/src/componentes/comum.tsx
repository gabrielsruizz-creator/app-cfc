import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, dataHora, mensagem, urlArquivo } from '../api';

export function Aviso({
  tipo,
  children,
}: {
  tipo?: 'erro' | 'sucesso' | 'alerta';
  children: ReactNode;
}) {
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={`aviso ${tipo ?? ''}`}>
      {children}
    </div>
  );
}

export function Carregando() {
  return (
    <p className="suave" aria-live="polite">
      Carregando…
    </p>
  );
}

const CORES_STATUS: Record<string, string> = {
  aprovado: 'verde',
  aprovada: 'verde',
  concluida: 'verde',
  confirmada: 'verde',
  em_analise: 'amarelo',
  pendente: 'amarelo',
  solicitada: 'amarelo',
  aguardando_pagamento: 'amarelo',
  aguardando_confirmacao: 'amarelo',
  pendente_configuracao: 'amarelo',
  falhou: 'vermelho',
  morto: 'vermelho',
  reprovado: 'vermelho',
  reprovada: 'vermelho',
  bloqueado: 'vermelho',
  suspensa: 'vermelho',
  suspenso_documento: 'vermelho',
  vencido: 'vermelho',
  rascunho: '',
};

const NOMES_STATUS: Record<string, string> = {
  em_analise: 'Em análise',
  suspenso_documento: 'Suspenso (documento)',
  pendente_configuracao: 'Pendente de configuração',
  aguardando_pagamento: 'Aguardando pagamento',
  aguardando_confirmacao: 'Aguardando confirmação',
};

export function Status({ valor }: { valor: string }) {
  const nome =
    NOMES_STATUS[valor] ?? valor.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return <span className={`selo ${CORES_STATUS[valor] ?? 'azul'}`}>{nome}</span>;
}

export function Campo({
  rotulo,
  ajuda,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { rotulo: string; ajuda?: string }) {
  const id = props.id ?? `campo-${rotulo.replace(/\W/g, '-').toLowerCase()}`;
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} {...props} />
      {ajuda && <span className="ajuda">{ajuda}</span>}
    </div>
  );
}

/** Mostra uma imagem ou PDF protegido (baixado com o token do usuário). */
export function VisualizadorArquivo({ arquivoId }: { arquivoId: string }) {
  const [estado, setEstado] = useState<{ url: string; tipo: string } | { erro: string } | null>(
    null,
  );
  useEffect(() => {
    let url: string | null = null;
    setEstado(null);
    urlArquivo(arquivoId)
      .then((r) => {
        url = r.url;
        setEstado(r);
      })
      .catch((e) => setEstado({ erro: mensagem(e) }));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [arquivoId]);
  if (!estado)
    return (
      <div className="documento">
        <Carregando />
      </div>
    );
  if ('erro' in estado)
    return (
      <div className="documento">
        <span className="suave">{estado.erro}</span>
      </div>
    );
  return (
    <div className="documento">
      {estado.tipo === 'application/pdf' ? (
        <iframe title="Documento" src={estado.url} />
      ) : (
        <img src={estado.url} alt="Documento enviado" />
      )}
    </div>
  );
}

export function Abas<T extends string>({
  abas,
  atual,
  onMudar,
}: {
  abas: { id: T; rotulo: string; contador?: number }[];
  atual: T;
  onMudar: (id: T) => void;
}) {
  return (
    <div className="abas" role="tablist">
      {abas.map((a) => (
        <button key={a.id} role="tab" aria-selected={a.id === atual} onClick={() => onMudar(a.id)}>
          {a.rotulo}
          {a.contador ? <span className="selo amarelo">{a.contador}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Estrelas({ nota }: { nota: number }) {
  const cheias = Math.round(nota);
  return (
    <span className="estrelas" aria-label={`${nota} de 5 estrelas`}>
      {'★'.repeat(cheias)}
      {'☆'.repeat(5 - cheias)}
    </span>
  );
}

/** Stat tile: rótulo, valor e detalhe opcional. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  heroi,
  para,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  heroi?: boolean;
  para?: string;
}) {
  const conteudo = (
    <>
      <span className="rotulo-ind">{rotulo}</span>
      <span className="valor">{valor}</span>
      {detalhe && <span className="detalhe">{detalhe}</span>}
    </>
  );
  const classe = `cartao indicador${heroi ? ' heroi' : ''}`;
  return para ? (
    <Link to={para} className={classe}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

export const numero = (n: number) => n.toLocaleString('pt-BR');

/** Arredonda o topo do eixo para um número "limpo" (1, 2, 5 × 10^n). */
function topoLimpo(max: number) {
  if (max <= 0) return 4;
  const ordem = 10 ** Math.floor(Math.log10(max));
  for (const f of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (f * ordem >= max) return f * ordem;
  return 10 * ordem;
}

/**
 * Colunas de uma série (ex.: aulas por dia). Cor única validada, colunas ≤ 24px com topo
 * arredondado, grade discreta, dica ao passar o mouse/focar e tabela alternativa.
 */
export function GraficoColunas({
  titulo,
  dados,
  formatarValor = numero,
  unidade,
}: {
  titulo: string;
  dados: { rotulo: string; rotuloCurto: string; valor: number }[];
  formatarValor?: (n: number) => string;
  /** Ex.: ['aula', 'aulas'] para a dica "17 aulas". */
  unidade?: [string, string];
}) {
  const comUnidade = (v: number) =>
    unidade ? `${formatarValor(v)} ${v === 1 ? unidade[0] : unidade[1]}` : formatarValor(v);
  const [dica, setDica] = useState<{ x: number; y: number; texto: string } | null>(null);
  const [tabela, setTabela] = useState(false);
  const L = 720;
  const A = 220;
  const m = { t: 12, r: 8, b: 26, l: 36 };
  const largura = L - m.l - m.r;
  const altura = A - m.t - m.b;
  const topo = topoLimpo(Math.max(0, ...dados.map((d) => d.valor)));
  // meio do eixo só quando é um número inteiro (contagens não têm 12,5)
  const ticks = Number.isInteger(topo / 2) ? [0, topo / 2, topo] : [0, topo];
  const faixa = dados.length ? largura / dados.length : largura;
  const larguraColuna = Math.min(24, faixa - 2);
  const y = (v: number) => m.t + altura - (v / topo) * altura;
  const passoRotulo = Math.max(1, Math.ceil(dados.length / 8));
  const raio = 4;

  return (
    <div className="cartao">
      <div className="linha entre">
        <h2 style={{ margin: 0 }}>{titulo}</h2>
        <button className="botao texto pequeno" onClick={() => setTabela((t) => !t)}>
          {tabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>
      {!dados.some((d) => d.valor > 0) ? (
        <p className="suave">Nada registrado no período.</p>
      ) : tabela ? (
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.rotulo}>
                  <td>{d.rotulo}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatarValor(d.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grafico" onMouseLeave={() => setDica(null)}>
          <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={titulo}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="linha-grade" x1={m.l} x2={L - m.r} y1={y(t)} y2={y(t)} />
                <text className="eixo" x={m.l - 6} y={y(t) + 4} textAnchor="end">
                  {formatarValor(t)}
                </text>
              </g>
            ))}
            {dados.map((d, i) => {
              const cx = m.l + faixa * i + faixa / 2;
              const h = Math.max(0, y(0) - y(d.valor));
              const x0 = cx - larguraColuna / 2;
              const r = Math.min(raio, h, larguraColuna / 2);
              const caminho =
                h <= 0
                  ? ''
                  : `M${x0},${y(0)} V${y(d.valor) + r} Q${x0},${y(d.valor)} ${x0 + r},${y(d.valor)} H${x0 + larguraColuna - r} Q${x0 + larguraColuna},${y(d.valor)} ${x0 + larguraColuna},${y(d.valor) + r} V${y(0)} Z`;
              const mostrar = () =>
                setDica({
                  x: (cx / L) * 100,
                  y: (y(d.valor) / A) * 100,
                  texto: `${d.rotulo} · ${comUnidade(d.valor)}`,
                });
              return (
                <g key={d.rotulo}>
                  <rect
                    className="alvo"
                    x={m.l + faixa * i}
                    y={m.t}
                    width={faixa}
                    height={altura}
                    tabIndex={0}
                    aria-label={`${d.rotulo}: ${comUnidade(d.valor)}`}
                    onMouseEnter={mostrar}
                    onFocus={mostrar}
                    onBlur={() => setDica(null)}
                  />
                  {caminho && <path className="coluna" d={caminho} pointerEvents="none" />}
                  {i % passoRotulo === 0 && (
                    <text className="eixo" x={cx} y={A - 8} textAnchor="middle">
                      {d.rotuloCurto}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {dica && (
            <div className="dica" style={{ left: `${dica.x}%`, top: `calc(${dica.y}% - 6px)` }}>
              {dica.texto}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ResumoConversa = {
  id: string;
  outraParte: { nome: string; papel: string };
  ultimaMensagem: string | null;
  ultimaMensagemEm: string | null;
  naoLidas: number;
};
type Msg = { id: string; texto: string; minha: boolean; criadoEm: string };

/** Conversas do painel (a autoescola fala com os alunos que compraram ou a procuraram). */
export function Conversas({ como }: { como: 'autoescola' }) {
  const [lista, setLista] = useState<ResumoConversa[] | null>(null);
  const [atual, setAtual] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const carregarLista = async () => {
    try {
      setLista(await api<ResumoConversa[]>(`/conversas?como=${como}`));
    } catch (e) {
      setErro(mensagem(e));
    }
  };
  const carregarMsgs = async (id: string) => {
    try {
      setMsgs(await api<Msg[]>(`/conversas/${id}/mensagens?como=${como}`));
    } catch (e) {
      setErro(mensagem(e));
    }
  };
  useEffect(() => {
    void carregarLista();
    const t = setInterval(() => void carregarLista(), 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!atual) return;
    void carregarMsgs(atual);
    const t = setInterval(() => void carregarMsgs(atual), 8_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!atual || !texto.trim()) return;
    try {
      await api(`/conversas/${atual}/mensagens?como=${como}`, { corpo: { texto } });
      setTexto('');
      await carregarMsgs(atual);
      await carregarLista();
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  if (!lista) return <Carregando />;
  return (
    <div className="coluna">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!lista.length ? (
        <div className="cartao">
          <p className="suave">
            Nenhuma conversa ainda. Quando um aluno mandar mensagem pelo app, ela aparece aqui.
          </p>
        </div>
      ) : (
        <div className="chat">
          <div className="lista" role="list">
            {lista.map((c) => (
              <button
                key={c.id}
                className={c.id === atual ? 'ativo' : ''}
                onClick={() => setAtual(c.id)}
              >
                <span>
                  <strong>{c.outraParte.nome}</strong>
                  <br />
                  <span className="pequeno suave">{c.ultimaMensagem?.slice(0, 40) ?? '—'}</span>
                </span>
                {c.naoLidas > 0 && <span className="selo amarelo">{c.naoLidas}</span>}
              </button>
            ))}
          </div>
          <div className="cartao">
            {!atual ? (
              <p className="suave">Escolha uma conversa.</p>
            ) : (
              <>
                <div className="mensagens" aria-live="polite">
                  {msgs.map((m) => (
                    <div key={m.id} className={`balao${m.minha ? ' minha' : ''}`}>
                      {m.texto}
                      <span className="hora">{dataHora(m.criadoEm)}</span>
                    </div>
                  ))}
                </div>
                <form className="linha" onSubmit={enviar}>
                  <div className="campo" style={{ flex: 1 }}>
                    <label htmlFor="msg" className="pequeno">
                      Mensagem
                    </label>
                    <input
                      id="msg"
                      value={texto}
                      maxLength={2000}
                      onChange={(e) => setTexto(e.target.value)}
                    />
                  </div>
                  <button className="botao" disabled={!texto.trim()}>
                    Enviar
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
