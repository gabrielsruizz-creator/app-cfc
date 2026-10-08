import type { ResumoFinanceiro, TipoChavePix } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, dataHora, mensagem, reais } from '../api';
import { Aviso, Campo, Carregando, Indicador, Status } from './comum';

const TIPOS: { id: TipoChavePix; nome: string }[] = [
  { id: 'cnpj', nome: 'CNPJ' },
  { id: 'cpf', nome: 'CPF' },
  { id: 'email', nome: 'E-mail' },
  { id: 'telefone', nome: 'Telefone' },
  { id: 'aleatoria', nome: 'Chave aleatória' },
];

/** Financeiro da autoescola: saldos, extrato, chave Pix e saque. */
export function PainelFinanceiro({ base }: { base: '/autoescola' }) {
  const q = useQuery({
    queryKey: [base, 'financeiro'],
    queryFn: () => api<ResumoFinanceiro>(`${base}/financeiro`),
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editandoConta, setEditandoConta] = useState(false);
  const [conta, setConta] = useState({
    tipoChave: 'cnpj' as TipoChavePix,
    chave: '',
    titularNome: '',
    titularDocumento: '',
  });
  const [valor, setValor] = useState('');
  if (!q.data) return <Carregando />;
  const f = q.data;
  const centavos = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100) || 0;

  async function executar(fn: () => Promise<unknown>, sucesso: string) {
    setErro(null);
    setOk(null);
    try {
      await fn();
      setOk(sucesso);
      await q.refetch();
      return true;
    } catch (e) {
      setErro(mensagem(e));
      return false;
    }
  }

  return (
    <div className="coluna">
      <h1>Financeiro</h1>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
      <div className="grade">
        <Indicador
          rotulo="Disponível para saque"
          valor={reais(f.disponivelCentavos)}
          detalhe="Já descontada a comissão da plataforma"
        />
        <Indicador
          rotulo="A liberar"
          valor={reais(f.retidoCentavos)}
          detalhe="Valor bruto, liberado (menos a comissão) quando a matrícula é confirmada"
        />
        <Indicador rotulo="Recebido no mês" valor={reais(f.ganhosMesCentavos)} />
        <Indicador rotulo="Recebido na semana" valor={reais(f.ganhosSemanaCentavos)} />
      </div>

      <div className="cartao">
        <h2>Chave Pix para saques</h2>
        {f.contaRecebimento && !editandoConta ? (
          <div className="linha entre">
            <span>
              {TIPOS.find((t) => t.id === f.contaRecebimento!.tipoChave)?.nome}:{' '}
              <strong>{f.contaRecebimento.chaveMascarada}</strong> ·{' '}
              {f.contaRecebimento.titularNome}
            </span>
            <button className="botao secundario pequeno" onClick={() => setEditandoConta(true)}>
              Trocar chave
            </button>
          </div>
        ) : (
          <form
            className="coluna"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await executar(
                  () => api(`${base}/conta-recebimento`, { metodo: 'PUT', corpo: conta }),
                  'Chave Pix salva.',
                )
              )
                setEditandoConta(false);
            }}
          >
            <div className="campos">
              <div className="campo">
                <label htmlFor="tipo-chave">Tipo de chave</label>
                <select
                  id="tipo-chave"
                  value={conta.tipoChave}
                  onChange={(e) =>
                    setConta({ ...conta, tipoChave: e.target.value as TipoChavePix })
                  }
                >
                  {TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
              <Campo
                rotulo="Chave Pix"
                required
                value={conta.chave}
                onChange={(e) => setConta({ ...conta, chave: e.target.value })}
              />
              <Campo
                rotulo="Nome do titular"
                required
                value={conta.titularNome}
                onChange={(e) => setConta({ ...conta, titularNome: e.target.value })}
              />
              <Campo
                rotulo="CPF/CNPJ do titular"
                required
                value={conta.titularDocumento}
                onChange={(e) => setConta({ ...conta, titularDocumento: e.target.value })}
              />
            </div>
            <span className="ajuda pequeno suave">
              A chave é guardada criptografada e só aparece mascarada.
            </span>
            <div className="linha">
              <button className="botao">Salvar chave</button>
              {f.contaRecebimento && (
                <button
                  type="button"
                  className="botao texto"
                  onClick={() => setEditandoConta(false)}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <form
        className="cartao"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await executar(
              () => api(`${base}/saques`, { corpo: { valorCentavos: centavos } }),
              'Saque solicitado. Você será avisado quando o Pix for enviado.',
            )
          )
            setValor('');
        }}
      >
        <h2>Sacar</h2>
        <div className="linha">
          <div style={{ minWidth: 200 }}>
            <Campo
              rotulo="Valor (R$)"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              ajuda={`Mínimo R$ 10,00 · disponível ${reais(f.disponivelCentavos)}`}
            />
          </div>
          <button
            type="button"
            className="botao texto pequeno"
            onClick={() => setValor((f.disponivelCentavos / 100).toFixed(2).replace('.', ','))}
          >
            Sacar tudo
          </button>
          <button
            className="botao"
            disabled={!f.contaRecebimento || centavos < 1000 || centavos > f.disponivelCentavos}
          >
            Solicitar saque
          </button>
        </div>
        {!f.contaRecebimento && (
          <span className="pequeno suave">Cadastre a chave Pix antes de sacar.</span>
        )}
      </form>

      {f.saques.length > 0 && (
        <div className="cartao tabela-rolagem">
          <h2>Saques</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {f.saques.map((s) => (
                <tr key={s.id}>
                  <td>{dataHora(s.criadoEm)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {reais(s.valorCentavos)}
                  </td>
                  <td>
                    <Status valor={s.status} />
                    {s.ultimoErro && <div className="pequeno suave">{s.ultimoErro}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cartao tabela-rolagem">
        <h2>Extrato</h2>
        {f.extrato.length ? (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {f.extrato.map((l) => (
                <tr key={l.id}>
                  <td>{dataHora(l.criadoEm)}</td>
                  <td>
                    {l.descricao}
                    <div className="pequeno suave">
                      {l.bucket === 'retido' ? 'A liberar' : 'Disponível'}
                    </div>
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: l.valorCentavos < 0 ? 'var(--erro)' : undefined,
                    }}
                  >
                    {reais(l.valorCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhuma movimentação ainda.</p>
        )}
      </div>
    </div>
  );
}
