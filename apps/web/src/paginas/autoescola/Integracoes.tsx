import type { IntegracaoCfcPlus } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, dataHora, mensagem } from '../../api';
import { Aviso, Campo, Carregando } from '../../componentes/comum';

const NOMES_STATUS: Record<IntegracaoCfcPlus['status'], { texto: string; cor: string }> = {
  nao_conectada: { texto: 'Não conectada', cor: '' },
  testando: { texto: 'Testando conexão…', cor: 'amarelo' },
  conectada: { texto: 'Conectada', cor: 'verde' },
  erro: { texto: 'Com problema', cor: 'vermelho' },
  desativada: { texto: 'Desconectada', cor: '' },
};

const NOMES_OPERACAO: Record<string, string> = {
  'pedido.pago': 'Venda paga',
  'pedido.confirmado': 'Matrícula confirmada',
  'pedido.recusado': 'Pedido recusado',
  'pedido.expirado': 'Pedido expirado',
  'matricula.criada': 'Matrícula criada',
  'pedido.sincronizado': 'Reenvio',
};

const NOMES_RESULTADO: Record<string, { texto: string; cor: string }> = {
  sucesso: { texto: 'Recebido', cor: 'verde' },
  aguardando_reprocessamento: { texto: 'Tentando de novo', cor: 'amarelo' },
  pendente_configuracao: { texto: 'Pendente', cor: 'amarelo' },
  erro: { texto: 'Erro', cor: 'vermelho' },
  pendente: { texto: 'Pendente', cor: 'amarelo' },
  descartada: { texto: 'Descartada', cor: '' },
};

export function AutoescolaIntegracoes() {
  const q = useQuery({
    queryKey: ['autoescola', 'integracoes', 'cfc-plus'],
    queryFn: () => api<IntegracaoCfcPlus>('/autoescola/integracoes/cfc-plus'),
    refetchInterval: (c) => (c.state.data?.status === 'testando' ? 2000 : 30_000),
  });
  const [url, setUrl] = useState('');
  const [chave, setChave] = useState('');
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!q.data) return <Carregando />;
  const i = q.data;
  const status = NOMES_STATUS[i.status];
  const mostrarFormulario = editando || ['nao_conectada', 'desativada'].includes(i.status);

  async function acao(fn: () => Promise<unknown>, sucesso?: string) {
    setErro(null);
    setOk(null);
    setOcupado(true);
    try {
      await fn();
      await q.refetch();
      if (sucesso) setOk(sucesso);
      return true;
    } catch (e) {
      setErro(mensagem(e));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="coluna">
      <h1>Integrações</h1>
      <p className="suave">
        Conecte o app ao ERP da sua autoescola. A integração é opcional: o app funciona completo sem
        ela.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}

      <div className="cartao">
        <div className="linha entre">
          <h2 style={{ margin: 0 }}>CFC Plus</h2>
          <span className={`selo ${status.cor}`}>{status.texto}</span>
        </div>
        <p className="suave" style={{ margin: 0 }}>
          {i.descricao} Cada venda paga, confirmada, recusada ou expirada no app aparece em{' '}
          <strong>Vendas do app</strong> no CFC Plus, com os dados do aluno.
        </p>

        {i.status === 'conectada' && (
          <Aviso tipo="sucesso">
            Conectado a <strong>{i.nomeNoErp ?? i.url}</strong> desde {dataHora(i.conectadaEm)}.
          </Aviso>
        )}
        {i.status === 'erro' && i.ultimoErro && <Aviso tipo="erro">{i.ultimoErro}</Aviso>}
        {i.status === 'testando' && <Aviso>Conferindo o endereço e a chave com o CFC Plus…</Aviso>}

        {i.url && !mostrarFormulario && (
          <table>
            <tbody>
              <tr>
                <th>Endereço</th>
                <td>{i.url}</td>
              </tr>
              <tr>
                <th>Chave</th>
                <td>{i.chaveMascarada}</td>
              </tr>
              <tr>
                <th>Último teste</th>
                <td>{dataHora(i.testadaEm)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {mostrarFormulario ? (
          <form
            className="coluna"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await acao(() =>
                  api('/autoescola/integracoes/cfc-plus', { metodo: 'PUT', corpo: { url, chave } }),
                )
              ) {
                setEditando(false);
                setChave('');
              }
            }}
          >
            <Aviso>
              No CFC Plus, vá em <strong>Administração › Integrações</strong>, clique em{' '}
              <strong>Gerar chave para o app Volante</strong> e cole aqui o endereço e a chave
              mostrados lá.
            </Aviso>
            <div className="campos">
              <Campo
                rotulo="Endereço do CFC Plus"
                type="url"
                required
                placeholder="https://cfcplus.suaautoescola.com.br"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Campo
                rotulo="Chave de integração"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="cfcp_…"
                value={chave}
                onChange={(e) => setChave(e.target.value.trim())}
                ajuda="Guardada criptografada; depois só aparece o começo e o fim."
              />
            </div>
            <div className="linha">
              <button className="botao" disabled={ocupado}>
                Conectar e testar
              </button>
              {editando && (
                <button type="button" className="botao texto" onClick={() => setEditando(false)}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="linha">
            {i.status === 'conectada' && (
              <button
                className="botao"
                disabled={ocupado}
                onClick={() =>
                  acao(
                    () => api('/autoescola/integracoes/cfc-plus/sincronizar', { metodo: 'POST' }),
                    'Enviando os pedidos já pagos para o CFC Plus. Acompanhe abaixo.',
                  )
                }
              >
                Enviar pedidos já recebidos
              </button>
            )}
            <button
              className="botao secundario"
              disabled={ocupado || i.status === 'testando'}
              onClick={() =>
                acao(() => api('/autoescola/integracoes/cfc-plus/testar', { metodo: 'POST' }))
              }
            >
              Testar conexão
            </button>
            <button
              className="botao texto"
              onClick={() => {
                setUrl(i.url ?? '');
                setEditando(true);
              }}
            >
              Trocar endereço ou chave
            </button>
            <button
              className="botao perigo"
              disabled={ocupado}
              onClick={() => {
                if (
                  window.confirm('Desconectar o CFC Plus? As próximas vendas não serão enviadas.')
                )
                  void acao(() => api('/autoescola/integracoes/cfc-plus', { metodo: 'DELETE' }));
              }}
            >
              Desconectar
            </button>
          </div>
        )}
      </div>

      {i.operacoes.length > 0 && (
        <div className="cartao tabela-rolagem">
          <h2>Últimos envios</h2>
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>O quê</th>
                <th>Pedido</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {i.operacoes.map((o) => {
                const r = NOMES_RESULTADO[o.status] ?? { texto: o.status, cor: '' };
                return (
                  <tr key={o.id}>
                    <td>{dataHora(o.criadoEm)}</td>
                    <td>{NOMES_OPERACAO[o.operacao] ?? o.operacao}</td>
                    <td>{o.pedidoCodigo ?? '—'}</td>
                    <td>
                      <span className={`selo ${r.cor}`}>{r.texto}</span>
                      {o.ultimoErro && <div className="pequeno suave">{o.ultimoErro}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
