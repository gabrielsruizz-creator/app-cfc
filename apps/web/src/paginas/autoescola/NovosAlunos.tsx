import type { ItemFila } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, dataHora, mensagem, reais } from '../../api';
import { Abas, Aviso, Carregando, Status } from '../../componentes/comum';

type Aba = 'novo' | 'em_contato' | 'confirmado' | 'recusado';

/** Verde até 24h, amarelo até 48h, vermelho depois. */
function corEspera(min: number) {
  if (min < 24 * 60) return 'verde';
  if (min < 48 * 60) return 'amarelo';
  return 'vermelho';
}

function tempo(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} dias`;
}

const formatarCpf = (cpf: string | null) =>
  cpf ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—';

export function AutoescolaNovosAlunos() {
  const [aba, setAba] = useState<Aba>('novo');
  const [erro, setErro] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const todos = useQuery({
    queryKey: ['autoescola', 'fila'],
    queryFn: () => api<ItemFila[]>('/autoescola/fila'),
    refetchInterval: 30_000,
  });
  if (!todos.data) return <Carregando />;
  const itens = todos.data.filter((i) => i.statusAtendimento === aba);
  const contar = (s: Aba) => todos.data.filter((i) => i.statusAtendimento === s).length;

  async function acao(pedidoId: string, caminho: string, corpo?: unknown) {
    setErro(null);
    try {
      await api(`/autoescola/fila/${pedidoId}/${caminho}`, { metodo: 'POST', corpo });
      await todos.refetch();
      return true;
    } catch (e) {
      setErro(mensagem(e));
      return false;
    }
  }

  return (
    <div className="coluna">
      <h1>Novos alunos do app</h1>
      <p className="suave">
        Alunos que compraram um pacote pelo app. O valor fica retido até você confirmar a matrícula;
        se não houver resposta no prazo, o pedido expira e o aluno é reembolsado.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Abas<Aba>
        atual={aba}
        onMudar={setAba}
        abas={[
          { id: 'novo', rotulo: 'Novos', contador: contar('novo') },
          { id: 'em_contato', rotulo: 'Em contato', contador: contar('em_contato') },
          { id: 'confirmado', rotulo: 'Confirmados' },
          { id: 'recusado', rotulo: 'Recusados' },
        ]}
      />
      {!itens.length && (
        <div className="cartao">
          <p className="suave">Nenhum pedido nesta etapa.</p>
        </div>
      )}
      {itens.map((i) => {
        const aberto = i.statusAtendimento === 'novo' || i.statusAtendimento === 'em_contato';
        const cor = aberto ? corEspera(i.minutosEsperando) : '';
        return (
          <div key={i.pedidoId} className={`cartao fila ${cor}`}>
            <div className="linha entre">
              <div>
                <h2 style={{ margin: 0 }}>{i.aluno.nome}</h2>
                <span className="suave pequeno">
                  Pedido {i.codigo} · pago em {dataHora(i.pagoEm)}
                </span>
              </div>
              {aberto ? (
                <span className={`espera ${cor}`}>
                  Esperando há {tempo(i.minutosEsperando)}
                  {i.prazoRespostaEm && (
                    <span className="suave"> · prazo {dataHora(i.prazoRespostaEm)}</span>
                  )}
                </span>
              ) : (
                <Status valor={i.statusAtendimento} />
              )}
            </div>
            <div className="campos">
              <div>
                <div className="pequeno suave">Pacote</div>
                <strong>{i.descricao}</strong>
                <div className="pequeno">{i.quantidadeAulas} aulas</div>
              </div>
              <div>
                <div className="pequeno suave">Valor pago / você recebe</div>
                <strong>{reais(i.valorPagoCentavos)}</strong>
                <div className="pequeno">{reais(i.valorLiquidoCentavos)} líquido</div>
              </div>
              <div>
                <div className="pequeno suave">Contato</div>
                <div>{i.aluno.telefone}</div>
                <div className="pequeno">{i.aluno.email}</div>
              </div>
              <div>
                <div className="pequeno suave">Dados para matrícula</div>
                <div>CPF {formatarCpf(i.aluno.cpf)}</div>
                <div className="pequeno">
                  Categoria {i.aluno.categoriaDesejada}
                  {i.aluno.renach ? ` · RENACH ${i.aluno.renach}` : ''}
                </div>
              </div>
            </div>
            {i.motivoRecusa && <Aviso tipo="erro">Motivo da recusa: {i.motivoRecusa}</Aviso>}
            {aberto && (
              <div className="linha">
                <a
                  className="botao"
                  href={i.linkWhatsapp}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    if (i.statusAtendimento === 'novo') void acao(i.pedidoId, 'em-contato');
                  }}
                >
                  Chamar no WhatsApp
                </a>
                {i.statusAtendimento === 'novo' && (
                  <button
                    className="botao secundario"
                    onClick={() => acao(i.pedidoId, 'em-contato')}
                  >
                    Marcar "em contato"
                  </button>
                )}
                <button
                  className="botao secundario"
                  onClick={() => {
                    if (window.confirm(`Confirmar a matrícula de ${i.aluno.nome}?`))
                      void acao(i.pedidoId, 'confirmar');
                  }}
                >
                  Confirmar matrícula
                </button>
                <button className="botao perigo" onClick={() => setRecusando(i.pedidoId)}>
                  Recusar
                </button>
              </div>
            )}
            {recusando === i.pedidoId && (
              <form
                className="coluna"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await acao(i.pedidoId, 'recusar', { motivo })) {
                    setRecusando(null);
                    setMotivo('');
                  }
                }}
              >
                <div className="campo">
                  <label htmlFor={`motivo-${i.pedidoId}`}>Motivo (o aluno verá)</label>
                  <textarea
                    id={`motivo-${i.pedidoId}`}
                    value={motivo}
                    minLength={5}
                    maxLength={500}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </div>
                <div className="linha">
                  <button className="botao perigo" disabled={motivo.trim().length < 5}>
                    Recusar e reembolsar
                  </button>
                  <button type="button" className="botao texto" onClick={() => setRecusando(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
