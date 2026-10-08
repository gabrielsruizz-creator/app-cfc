import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api, dataHora, mensagem, reais } from '../../api';
import { Aviso, Campo, Carregando } from '../../componentes/comum';

type Regra = {
  id: string;
  vendedorTipo: string;
  produtoTipo: string;
  instrutorId: string | null;
  autoescolaId: string | null;
  percentualBp: number;
  valorFixoCentavos: number;
  vigenteDesde: string;
  vigenteAte: string | null;
  motivo: string | null;
};

const NOMES = {
  instrutor: 'Instrutor autônomo',
  autoescola: 'Autoescola',
  aula_avulsa: 'Aula avulsa',
  pacote: 'Pacote',
} as Record<string, string>;

export function AdminComissoes() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'comissoes'],
    queryFn: () => api<Regra[]>('/admin/comissoes'),
  });
  const [f, setF] = useState({
    vendedorTipo: 'instrutor',
    produtoTipo: 'aula_avulsa',
    percentual: '',
    fixo: '0',
    motivo: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    try {
      await api('/admin/comissoes', {
        corpo: {
          vendedorTipo: f.vendedorTipo,
          produtoTipo: f.produtoTipo,
          percentualBp: Math.round(Number(f.percentual.replace(',', '.')) * 100),
          valorFixoCentavos: Math.round(Number(f.fixo.replace(',', '.')) * 100),
          motivo: f.motivo,
        },
      });
      setOk(true);
      setF({ ...f, percentual: '', motivo: '' });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'comissoes'] });
    } catch (err) {
      setErro(mensagem(err));
    }
  }

  const vigentes = q.data?.filter((r) => !r.vigenteAte) ?? [];
  return (
    <div className="coluna">
      <h1>Comissões da plataforma</h1>
      <p className="suave">
        Cada alteração cria uma nova versão; vendas já feitas mantêm a comissão do momento da
        compra. Tudo fica na auditoria.
      </p>
      <div className="grade">
        {vigentes
          .filter((r) => !r.instrutorId && !r.autoescolaId)
          .map((r) => (
            <div key={r.id} className="cartao">
              <span className="suave">
                {NOMES[r.vendedorTipo]} · {NOMES[r.produtoTipo]}
              </span>
              <span className="numero">{(r.percentualBp / 100).toLocaleString('pt-BR')}%</span>
              {r.valorFixoCentavos > 0 && <span>+ {reais(r.valorFixoCentavos)}</span>}
              <span className="pequeno suave">desde {dataHora(r.vigenteDesde)}</span>
            </div>
          ))}
      </div>
      <form className="cartao" onSubmit={salvar}>
        <h2>Alterar comissão</h2>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {ok && <Aviso tipo="sucesso">Nova comissão em vigor.</Aviso>}
        <div className="campos">
          <div className="campo">
            <label htmlFor="vend">Quem vende</label>
            <select
              id="vend"
              value={f.vendedorTipo}
              onChange={(e) => setF({ ...f, vendedorTipo: e.target.value })}
            >
              <option value="instrutor">Instrutor autônomo</option>
              <option value="autoescola">Autoescola</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="prod">Produto</label>
            <select
              id="prod"
              value={f.produtoTipo}
              onChange={(e) => setF({ ...f, produtoTipo: e.target.value })}
            >
              <option value="aula_avulsa">Aula avulsa</option>
              <option value="pacote">Pacote</option>
            </select>
          </div>
          <Campo
            rotulo="Percentual (%)"
            value={f.percentual}
            onChange={(e) => setF({ ...f, percentual: e.target.value })}
            inputMode="decimal"
            required
            placeholder="15"
          />
          <Campo
            rotulo="Valor fixo (R$)"
            value={f.fixo}
            onChange={(e) => setF({ ...f, fixo: e.target.value })}
            inputMode="decimal"
          />
        </div>
        <Campo
          rotulo="Motivo da alteração"
          value={f.motivo}
          onChange={(e) => setF({ ...f, motivo: e.target.value })}
          required
          minLength={3}
        />
        <div>
          <button className="botao">Salvar nova comissão</button>
        </div>
      </form>
      <div className="cartao tabela-rolagem">
        <h2>Histórico</h2>
        {q.isLoading ? (
          <Carregando />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Produto</th>
                <th>Percentual</th>
                <th>Vigência</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((r) => (
                <tr key={r.id}>
                  <td>
                    {NOMES[r.vendedorTipo]}
                    {r.instrutorId || r.autoescolaId ? ' (exceção)' : ''}
                  </td>
                  <td>{NOMES[r.produtoTipo]}</td>
                  <td>{(r.percentualBp / 100).toLocaleString('pt-BR')}%</td>
                  <td>
                    {dataHora(r.vigenteDesde)} → {r.vigenteAte ? dataHora(r.vigenteAte) : 'atual'}
                  </td>
                  <td>{r.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
