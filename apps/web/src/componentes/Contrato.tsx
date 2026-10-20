import type { ContratoPedido } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, dataHora, mensagem } from '../api';
import { Aviso, Carregando } from './comum';

const STATUS_ENVIO: Record<string, string> = {
  enviado: 'enviado',
  pendente_configuracao: 'aguardando configuração do e-mail',
  erro: 'falhou',
};

/** Markdown simples do contrato → elementos (títulos, citações, parágrafos com negrito). */
function TextoContrato({ corpoMd }: { corpoMd: string }) {
  return (
    <div className="contrato-texto">
      {corpoMd
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => {
          if (p.startsWith('# ')) return <h2 key={i}>{p.slice(2)}</h2>;
          if (p.startsWith('## ')) return <h3 key={i}>{p.slice(3)}</h3>;
          if (p.startsWith('> '))
            return (
              <p key={i} className="suave">
                <em>{p.replace(/^> ?/gm, '')}</em>
              </p>
            );
          return (
            <p key={i}>
              {p
                .replace(/\n/g, ' ')
                .split(/(\*\*[^*]+\*\*)/g)
                .filter(Boolean)
                .map((t, j) =>
                  t.startsWith('**') ? <strong key={j}>{t.slice(2, -2)}</strong> : t,
                )}
            </p>
          );
        })}
    </div>
  );
}

/** Contrato do pedido (texto exato, aceites e cópias por e-mail), numa janela sobre a página. */
export function JanelaContrato({ pedidoId, aoFechar }: { pedidoId: string; aoFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const q = useQuery({
    queryKey: ['autoescola', 'contrato', pedidoId],
    queryFn: () => api<ContratoPedido>(`/autoescola/contratos/${pedidoId}`),
  });
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} className="janela" onClose={aoFechar} aria-labelledby="titulo-contrato">
      <div className="linha entre">
        <strong id="titulo-contrato">Contrato do pedido {q.data?.pedidoCodigo ?? ''}</strong>
        <button className="botao texto" onClick={() => ref.current?.close()}>
          Fechar
        </button>
      </div>
      {q.isLoading ? (
        <Carregando />
      ) : !q.data ? (
        <Aviso tipo="erro">{q.error ? mensagem(q.error) : 'Contrato não encontrado.'}</Aviso>
      ) : (
        <div className="coluna">
          <TextoContrato corpoMd={q.data.corpoMd} />
          <div className="cartao">
            <h3 style={{ margin: 0 }}>Registro dos aceites</h3>
            {q.data.aceites.map((a) => (
              <div key={a.parte}>
                <strong>
                  {a.parte === 'contratante' ? 'Contratante' : 'Contratado'}: {a.nome}
                  {a.documento ? ` (${a.documento})` : ''}
                </strong>
                <div className="pequeno suave">
                  {a.forma === 'clique' ? 'Aceitou no app' : 'Aderiu pela oferta publicada'} em{' '}
                  {dataHora(a.aceitoEm)}
                  {a.dispositivo ? ` · ${a.dispositivo}` : ''}
                  {a.ip ? ` · IP ${a.ip}` : ''}
                  {a.detalhe ? ` · ${a.detalhe}` : ''}
                </div>
              </div>
            ))}
            <div className="pequeno suave" style={{ wordBreak: 'break-all' }}>
              Modelo v{q.data.versao} · impressão digital (SHA-256): {q.data.hash}
            </div>
          </div>
          <div className="cartao">
            <h3 style={{ margin: 0 }}>Cópias por e-mail</h3>
            {q.data.envios.length ? (
              q.data.envios.map((e, i) => (
                <div key={i} className="pequeno">
                  {dataHora(e.criadoEm)} · {e.parte} · {e.para} ·{' '}
                  {STATUS_ENVIO[e.status] ?? e.status}
                  {e.erro ? ` (${e.erro})` : ''}
                </div>
              ))
            ) : (
              <p className="suave" style={{ margin: 0 }}>
                As cópias são enviadas quando o pagamento é confirmado.
              </p>
            )}
            {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
            <div className="linha">
              <button
                className="botao secundario"
                onClick={async () => {
                  setMsg(null);
                  try {
                    await api(`/autoescola/contratos/${pedidoId}/reenviar`, { metodo: 'POST' });
                    setMsg({
                      tipo: 'sucesso',
                      texto: 'Uma nova cópia vai para o e-mail da autoescola.',
                    });
                    setTimeout(() => void q.refetch(), 4000);
                  } catch (e) {
                    setMsg({ tipo: 'erro', texto: mensagem(e) });
                  }
                }}
              >
                Enviar cópia para o e-mail da autoescola
              </button>
              <button className="botao texto" onClick={() => window.print()}>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
