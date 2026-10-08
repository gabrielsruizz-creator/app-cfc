import type { Cupom } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, dataHora, mensagem, reais } from '../api';
import { Aviso, Campo, Carregando } from './comum';

type Area = 'admin' | 'autoescola';

/** Ex.: "10% de desconto (até R$ 50,00)" (só tipos de @volante/contracts: o painel não carrega o zod). */
function descreverCupom(c: Pick<Cupom, 'tipo' | 'valor' | 'descontoMaximoCentavos'>) {
  if (c.tipo === 'valor_fixo') return `${reais(c.valor)} de desconto`;
  const pct = `${(c.valor / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de desconto`;
  return c.descontoMaximoCentavos ? `${pct} (até ${reais(c.descontoMaximoCentavos)})` : pct;
}
type Opcao = { id: string; nome: string };

type Form = {
  codigo: string;
  campanha: string;
  descricao: string;
  tipo: 'percentual' | 'valor_fixo';
  valor: string;
  teto: string;
  minimo: string;
  produtoTipo: '' | 'aula_avulsa' | 'pacote';
  vendedor: string; // '' | 'i:<id>' | 'a:<id>'
  bancadoPor: 'plataforma' | 'vendedor';
  limiteTotal: string;
  limitePorAluno: string;
  apenasPrimeiraCompra: boolean;
  fimEm: string;
  ativo: boolean;
};

const reaisParaCentavos = (v: string) =>
  v.trim() ? Math.round(Number(v.replace(/\./g, '').replace(',', '.')) * 100) : undefined;
const centavosParaReais = (c: number | null) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

function formDe(c: Cupom | null): Form {
  return {
    codigo: c?.codigo ?? '',
    campanha: c?.campanha ?? '',
    descricao: c?.descricao ?? '',
    tipo: c?.tipo ?? 'percentual',
    valor: c ? (c.tipo === 'percentual' ? String(c.valor / 100) : centavosParaReais(c.valor)) : '',
    teto: centavosParaReais(c?.descontoMaximoCentavos ?? null),
    minimo: centavosParaReais(c?.valorMinimoCentavos ?? null),
    produtoTipo: (c?.produtoTipo as Form['produtoTipo']) ?? '',
    vendedor: c?.instrutorId ? `i:${c.instrutorId}` : c?.autoescolaId ? `a:${c.autoescolaId}` : '',
    bancadoPor: c?.bancadoPor ?? 'plataforma',
    limiteTotal: c?.limiteTotal ? String(c.limiteTotal) : '',
    limitePorAluno: String(c?.limitePorAluno ?? 1),
    apenasPrimeiraCompra: c?.apenasPrimeiraCompra ?? false,
    fimEm: c?.fimEm ? c.fimEm.slice(0, 10) : '',
    ativo: c?.ativo ?? true,
  };
}

function corpo(f: Form, area: Area) {
  const valor =
    f.tipo === 'percentual'
      ? Math.round(Number(f.valor.replace(',', '.')) * 100)
      : (reaisParaCentavos(f.valor) ?? 0);
  const comum = {
    codigo: f.codigo,
    descricao: f.descricao || undefined,
    tipo: f.tipo,
    valor,
    descontoMaximoCentavos: f.tipo === 'percentual' ? reaisParaCentavos(f.teto) : undefined,
    valorMinimoCentavos: reaisParaCentavos(f.minimo) ?? 0,
    limiteTotal: f.limiteTotal ? Number(f.limiteTotal) : undefined,
    limitePorAluno: Number(f.limitePorAluno) || 1,
    apenasPrimeiraCompra: f.apenasPrimeiraCompra,
    // fim do dia escolhido, no horário de Brasília
    fimEm: f.fimEm ? `${f.fimEm}T23:59:59-03:00` : undefined,
    ativo: f.ativo,
  };
  if (area === 'autoescola') return comum;
  return {
    ...comum,
    campanha: f.campanha || undefined,
    produtoTipo: f.produtoTipo || undefined,
    instrutorId: f.vendedor.startsWith('i:') ? f.vendedor.slice(2) : undefined,
    autoescolaId: f.vendedor.startsWith('a:') ? f.vendedor.slice(2) : undefined,
    bancadoPor: f.bancadoPor,
  };
}

function Formulario({
  area,
  inicial,
  vendedores,
  aoSalvar,
  aoCancelar,
}: {
  area: Area;
  inicial: Cupom | null;
  vendedores: { instrutores: Opcao[]; autoescolas: Opcao[] };
  aoSalvar: (corpo: unknown) => Promise<void>;
  aoCancelar: () => void;
}) {
  const [f, setF] = useState(() => formDe(inicial));
  const [salvando, setSalvando] = useState(false);
  const muda = (p: Partial<Form>) => setF({ ...f, ...p });
  return (
    <form
      className="cartao"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        try {
          await aoSalvar(corpo(f, area));
        } finally {
          setSalvando(false);
        }
      }}
    >
      <h2>{inicial ? `Editar ${inicial.codigo}` : 'Novo cupom'}</h2>
      <div className="campos">
        <Campo
          rotulo="Código"
          required
          minLength={3}
          maxLength={30}
          pattern="[A-Za-z0-9_\-]+"
          value={f.codigo}
          onChange={(e) => muda({ codigo: e.target.value.toUpperCase() })}
          ajuda="Letras, números, - e _. O aluno digita no pagamento."
        />
        {area === 'admin' && (
          <Campo
            rotulo="Campanha"
            value={f.campanha}
            onChange={(e) => muda({ campanha: e.target.value })}
            ajuda="Para agrupar nos relatórios (opcional)."
          />
        )}
        <div className="campo">
          <label htmlFor="tipo-cupom">Tipo de desconto</label>
          <select
            id="tipo-cupom"
            value={f.tipo}
            onChange={(e) => muda({ tipo: e.target.value as Form['tipo'] })}
          >
            <option value="percentual">Percentual (%)</option>
            <option value="valor_fixo">Valor fixo (R$)</option>
          </select>
        </div>
        <Campo
          rotulo={f.tipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'}
          required
          inputMode="decimal"
          value={f.valor}
          onChange={(e) => muda({ valor: e.target.value })}
        />
        {f.tipo === 'percentual' && (
          <Campo
            rotulo="Desconto máximo (R$)"
            inputMode="decimal"
            value={f.teto}
            onChange={(e) => muda({ teto: e.target.value })}
            ajuda="Opcional."
          />
        )}
        <Campo
          rotulo="Compra mínima (R$)"
          inputMode="decimal"
          value={f.minimo}
          onChange={(e) => muda({ minimo: e.target.value })}
        />
        {area === 'admin' && (
          <>
            <div className="campo">
              <label htmlFor="produto-cupom">Vale para</label>
              <select
                id="produto-cupom"
                value={f.produtoTipo}
                onChange={(e) => muda({ produtoTipo: e.target.value as Form['produtoTipo'] })}
              >
                <option value="">Aulas avulsas e pacotes</option>
                <option value="aula_avulsa">Só aulas avulsas</option>
                <option value="pacote">Só pacotes</option>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="vendedor-cupom">Vendedor</label>
              <select
                id="vendedor-cupom"
                value={f.vendedor}
                onChange={(e) =>
                  muda({
                    vendedor: e.target.value,
                    bancadoPor: e.target.value ? f.bancadoPor : 'plataforma',
                  })
                }
              >
                <option value="">Todos</option>
                <optgroup label="Autoescolas">
                  {vendedores.autoescolas.map((a) => (
                    <option key={a.id} value={`a:${a.id}`}>
                      {a.nome}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Instrutores">
                  {vendedores.instrutores.map((i) => (
                    <option key={i.id} value={`i:${i.id}`}>
                      {i.nome}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="campo">
              <label htmlFor="bancado-cupom">Quem paga o desconto</label>
              <select
                id="bancado-cupom"
                value={f.bancadoPor}
                disabled={!f.vendedor}
                onChange={(e) => muda({ bancadoPor: e.target.value as Form['bancadoPor'] })}
              >
                <option value="plataforma">Plataforma (o vendedor recebe o valor cheio)</option>
                <option value="vendedor">Vendedor (comissão sobre o valor com desconto)</option>
              </select>
            </div>
          </>
        )}
        <Campo
          rotulo="Limite total de usos"
          type="number"
          min={1}
          value={f.limiteTotal}
          onChange={(e) => muda({ limiteTotal: e.target.value })}
          ajuda="Vazio = sem limite."
        />
        <Campo
          rotulo="Usos por aluno"
          type="number"
          min={1}
          value={f.limitePorAluno}
          onChange={(e) => muda({ limitePorAluno: e.target.value })}
        />
        <Campo
          rotulo="Válido até"
          type="date"
          value={f.fimEm}
          onChange={(e) => muda({ fimEm: e.target.value })}
          ajuda="Vazio = sem data de fim."
        />
      </div>
      <Campo
        rotulo="Descrição (o aluno vê)"
        maxLength={300}
        value={f.descricao}
        onChange={(e) => muda({ descricao: e.target.value })}
      />
      <div className="linha">
        <label className="linha" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={f.apenasPrimeiraCompra}
            onChange={(e) => muda({ apenasPrimeiraCompra: e.target.checked })}
          />
          Só na primeira compra do aluno
        </label>
        <label className="linha" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={f.ativo}
            onChange={(e) => muda({ ativo: e.target.checked })}
          />
          Ativo
        </label>
      </div>
      {area === 'autoescola' && (
        <span className="pequeno suave">
          O desconto sai do valor do pacote e vale só para os pacotes da sua autoescola. A comissão
          é calculada sobre o valor com desconto.
        </span>
      )}
      <div className="linha">
        <button className="botao" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="botao texto" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Lista e cadastro de cupons (admin: todos; autoescola: os dela). */
export function PainelCupons({ area }: { area: Area }) {
  const base = area === 'admin' ? '/admin/cupons' : '/autoescola/cupons';
  const q = useQuery({ queryKey: [base], queryFn: () => api<Cupom[]>(base) });
  const vendedores = useQuery({
    queryKey: ['admin', 'vendedores'],
    enabled: area === 'admin',
    queryFn: async () => {
      const [aes, ins] = await Promise.all([
        api<{ id: string; nomeFantasia: string }[]>('/admin/autoescolas?status=aprovada'),
        api<{ id: string; nome: string }[]>('/admin/instrutores?status=aprovado'),
      ]);
      return {
        autoescolas: aes.map((a) => ({ id: a.id, nome: a.nomeFantasia })),
        instrutores: ins.map((i) => ({ id: i.id, nome: i.nome })),
      };
    },
  });
  const [editando, setEditando] = useState<Cupom | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!q.data) return <Carregando />;

  async function salvar(dados: unknown) {
    setErro(null);
    try {
      if (editando === 'novo') await api(base, { corpo: dados });
      else if (editando) await api(`${base}/${editando.id}`, { metodo: 'PUT', corpo: dados });
      setEditando(null);
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  const situacao = (c: Cupom) => {
    if (!c.ativo) return <span className="selo">Inativo</span>;
    if (c.fimEm && new Date(c.fimEm) < new Date()) return <span className="selo">Expirado</span>;
    if (c.limiteTotal && c.usos >= c.limiteTotal)
      return <span className="selo amarelo">Esgotado</span>;
    return <span className="selo verde">Ativo</span>;
  };

  return (
    <div className="coluna">
      <div className="linha entre">
        <h1>Cupons</h1>
        {!editando && (
          <button className="botao" onClick={() => setEditando('novo')}>
            Novo cupom
          </button>
        )}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {editando && (
        <Formulario
          key={editando === 'novo' ? 'novo' : editando.id}
          area={area}
          inicial={editando === 'novo' ? null : editando}
          vendedores={vendedores.data ?? { autoescolas: [], instrutores: [] }}
          aoSalvar={salvar}
          aoCancelar={() => setEditando(null)}
        />
      )}
      <div className="cartao tabela-rolagem">
        {q.data.length ? (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Desconto</th>
                {area === 'admin' && <th>Vendedor / quem paga</th>}
                <th>Usos</th>
                <th style={{ textAlign: 'right' }}>Desconto concedido</th>
                <th>Validade</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.codigo}</strong>
                    {c.campanha && <div className="pequeno suave">{c.campanha}</div>}
                  </td>
                  <td>
                    {descreverCupom(c)}
                    <div className="pequeno suave">
                      {c.produtoTipo === 'pacote'
                        ? 'Pacotes'
                        : c.produtoTipo === 'aula_avulsa'
                          ? 'Aulas avulsas'
                          : 'Tudo'}
                      {c.valorMinimoCentavos ? ` · mínimo ${reais(c.valorMinimoCentavos)}` : ''}
                      {c.apenasPrimeiraCompra ? ' · 1ª compra' : ''}
                    </div>
                  </td>
                  {area === 'admin' && (
                    <td>
                      {c.vendedorNome ?? 'Todos'}
                      <div className="pequeno suave">
                        {c.bancadoPor === 'plataforma' ? 'Plataforma paga' : 'Vendedor paga'}
                      </div>
                    </td>
                  )}
                  <td>
                    {c.usos}
                    {c.limiteTotal ? ` / ${c.limiteTotal}` : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {reais(c.descontoTotalCentavos)}
                  </td>
                  <td>{c.fimEm ? dataHora(c.fimEm) : 'Sem fim'}</td>
                  <td>{situacao(c)}</td>
                  <td>
                    {(area === 'admin' || c.bancadoPor === 'vendedor') && (
                      <button className="botao secundario pequeno" onClick={() => setEditando(c)}>
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">
            Nenhum cupom ainda.{' '}
            {area === 'autoescola' && 'Crie um para atrair alunos nas suas campanhas.'}
          </p>
        )}
      </div>
    </div>
  );
}
