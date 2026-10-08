import type { Pacote, PacoteEntrada } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, mensagem, reais } from '../../api';
import { Aviso, Campo, Carregando } from '../../componentes/comum';

const CATEGORIAS = ['A', 'B', 'C', 'D', 'E'] as const;

const VAZIO: PacoteEntrada = {
  nome: '',
  descricao: '',
  categorias: ['B'],
  quantidadeAulas: 10,
  duracaoAulaMin: 50,
  precoCentavos: 0,
  parcelasMax: 1,
  validadeDias: 180,
  publicado: true,
};

function Formulario({
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  inicial: PacoteEntrada;
  aoSalvar: (d: PacoteEntrada) => Promise<void>;
  aoCancelar: () => void;
}) {
  const [d, setD] = useState(inicial);
  const [preco, setPreco] = useState(
    inicial.precoCentavos ? (inicial.precoCentavos / 100).toFixed(2).replace('.', ',') : '',
  );
  const [salvando, setSalvando] = useState(false);
  const centavos = Math.round(Number(preco.replace(/\./g, '').replace(',', '.')) * 100) || 0;
  return (
    <form
      className="cartao"
      onSubmit={async (e) => {
        e.preventDefault();
        setSalvando(true);
        try {
          await aoSalvar({ ...d, precoCentavos: centavos });
        } finally {
          setSalvando(false);
        }
      }}
    >
      <div className="campos">
        <Campo
          rotulo="Nome do pacote"
          value={d.nome}
          required
          minLength={3}
          onChange={(e) => setD({ ...d, nome: e.target.value })}
        />
        <Campo
          rotulo="Preço total (R$)"
          inputMode="decimal"
          value={preco}
          required
          onChange={(e) => setPreco(e.target.value)}
          ajuda={
            centavos && d.quantidadeAulas
              ? `${reais(Math.round(centavos / d.quantidadeAulas))} por aula`
              : undefined
          }
        />
        <Campo
          rotulo="Quantidade de aulas"
          type="number"
          min={1}
          max={100}
          value={d.quantidadeAulas}
          onChange={(e) => setD({ ...d, quantidadeAulas: Number(e.target.value) })}
        />
        <Campo
          rotulo="Duração de cada aula (min)"
          type="number"
          min={30}
          max={120}
          value={d.duracaoAulaMin}
          onChange={(e) => setD({ ...d, duracaoAulaMin: Number(e.target.value) })}
        />
        <Campo
          rotulo="Validade (dias)"
          type="number"
          min={7}
          max={730}
          value={d.validadeDias ?? ''}
          ajuda="Depois disso, aulas não usadas expiram."
          onChange={(e) =>
            setD({ ...d, validadeDias: e.target.value ? Number(e.target.value) : undefined })
          }
        />
        <div className="campo">
          <label htmlFor="parcelas">Parcelas no cartão</label>
          <select
            id="parcelas"
            value={d.parcelasMax}
            onChange={(e) => setD({ ...d, parcelasMax: Number(e.target.value) })}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'À vista' : `Até ${n}x`}
              </option>
            ))}
          </select>
          <span className="ajuda">Cartão parcelado chega na Fase 3; hoje o pagamento é Pix.</span>
        </div>
      </div>
      <fieldset className="linha" style={{ border: 0, padding: 0 }}>
        <legend className="pequeno" style={{ fontWeight: 600, marginBottom: 6 }}>
          Categorias
        </legend>
        {CATEGORIAS.map((c) => (
          <label key={c} className="linha" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={d.categorias.includes(c)}
              onChange={(e) =>
                setD({
                  ...d,
                  categorias: e.target.checked
                    ? [...d.categorias, c]
                    : d.categorias.filter((x) => x !== c),
                })
              }
            />
            {c}
          </label>
        ))}
      </fieldset>
      <div className="campo">
        <label htmlFor="descricao">Descrição</label>
        <textarea
          id="descricao"
          maxLength={600}
          value={d.descricao ?? ''}
          onChange={(e) => setD({ ...d, descricao: e.target.value })}
        />
      </div>
      <label className="linha" style={{ gap: 6 }}>
        <input
          type="checkbox"
          checked={d.publicado}
          onChange={(e) => setD({ ...d, publicado: e.target.checked })}
        />
        Publicado na vitrine do app
      </label>
      <div className="linha">
        <button className="botao" disabled={salvando || !d.categorias.length || centavos < 1000}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="botao texto" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function AutoescolaPacotes() {
  const q = useQuery({
    queryKey: ['autoescola', 'pacotes'],
    queryFn: () => api<Pacote[]>('/autoescola/pacotes'),
  });
  const [editando, setEditando] = useState<Pacote | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (!q.data) return <Carregando />;

  async function salvar(d: PacoteEntrada) {
    setErro(null);
    try {
      if (editando === 'novo') await api('/autoescola/pacotes', { corpo: d });
      else if (editando)
        await api(`/autoescola/pacotes/${editando.id}`, { metodo: 'PUT', corpo: d });
      setEditando(null);
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  return (
    <div className="coluna">
      <div className="linha entre">
        <h1>Pacotes</h1>
        {!editando && (
          <button className="botao" onClick={() => setEditando('novo')}>
            Novo pacote
          </button>
        )}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {editando && (
        <Formulario
          key={editando === 'novo' ? 'novo' : editando.id}
          inicial={editando === 'novo' ? VAZIO : editando}
          aoSalvar={salvar}
          aoCancelar={() => setEditando(null)}
        />
      )}
      {!q.data.length && !editando && (
        <div className="cartao">
          <p className="suave">
            Crie seu primeiro pacote. Ele aparece na vitrine da autoescola no app.
          </p>
        </div>
      )}
      <div className="grade">
        {q.data.map((p) => (
          <div key={p.id} className="cartao">
            <div className="linha entre">
              <strong>{p.nome}</strong>
              <span className={`selo ${p.publicado ? 'verde' : ''}`}>
                {p.publicado ? 'Publicado' : 'Oculto'}
              </span>
            </div>
            <span className="numero">{reais(p.precoCentavos)}</span>
            <span className="suave pequeno">
              {p.quantidadeAulas} aulas de {p.duracaoAulaMin} min · {reais(p.precoPorAulaCentavos)}
              /aula · categoria {p.categorias.join(', ')}
            </span>
            <div className="linha">
              <button className="botao secundario pequeno" onClick={() => setEditando(p)}>
                Editar
              </button>
              <button
                className="botao perigo pequeno"
                onClick={async () => {
                  if (!window.confirm(`Arquivar "${p.nome}"? Quem já comprou não é afetado.`))
                    return;
                  try {
                    await api(`/autoescola/pacotes/${p.id}`, { metodo: 'DELETE' });
                    await q.refetch();
                  } catch (e) {
                    setErro(mensagem(e));
                  }
                }}
              >
                Arquivar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
