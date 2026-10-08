import type { RelatorioAdmin, RelatorioAutoescola } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, baixar, mensagem, reais, reaisCurto } from '../api';
import { Aviso, Campo, Carregando, GraficoColunas, Indicador, numero } from './comum';

const iso = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

function periodoPadrao() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { de: iso(inicio), ate: iso(hoje) };
}

function tempo(min: number | null) {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${(min / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${Math.round(min / 1440)} dias`;
}

function SeletorPeriodo({
  periodo,
  aoMudar,
  aoExportar,
}: {
  periodo: { de: string; ate: string };
  aoMudar: (p: { de: string; ate: string }) => void;
  aoExportar: () => void;
}) {
  const [p, setP] = useState(periodo);
  const atalho = (dias: number) => {
    const ate = new Date();
    const de = new Date(ate.getTime() - (dias - 1) * 86400_000);
    const novo = { de: iso(de), ate: iso(ate) };
    setP(novo);
    aoMudar(novo);
  };
  return (
    <form
      className="linha"
      onSubmit={(e) => {
        e.preventDefault();
        aoMudar(p);
      }}
    >
      <Campo
        rotulo="De"
        type="date"
        value={p.de}
        max={p.ate}
        onChange={(e) => setP({ ...p, de: e.target.value })}
      />
      <Campo
        rotulo="Até"
        type="date"
        value={p.ate}
        min={p.de}
        onChange={(e) => setP({ ...p, ate: e.target.value })}
      />
      <button className="botao" style={{ alignSelf: 'flex-end' }}>
        Aplicar
      </button>
      <button
        type="button"
        className="botao texto pequeno"
        style={{ alignSelf: 'flex-end' }}
        onClick={() => atalho(7)}
      >
        7 dias
      </button>
      <button
        type="button"
        className="botao texto pequeno"
        style={{ alignSelf: 'flex-end' }}
        onClick={() => atalho(30)}
      >
        30 dias
      </button>
      <button
        type="button"
        className="botao secundario"
        style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}
        onClick={aoExportar}
      >
        Exportar vendas (CSV)
      </button>
    </form>
  );
}

function rotulosSemana(semana: string) {
  const d = new Date(`${semana}T12:00:00`);
  return {
    rotulo: `Semana de ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`,
    rotuloCurto: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  };
}

export function RelatoriosAutoescola() {
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['autoescola', 'relatorios', periodo],
    queryFn: () =>
      api<RelatorioAutoescola>(`/autoescola/relatorios?de=${periodo.de}&ate=${periodo.ate}`),
  });
  const r = q.data;
  const exportar = () =>
    baixar(
      `/autoescola/relatorios/vendas.csv?de=${periodo.de}&ate=${periodo.ate}`,
      `vendas-${periodo.de}-a-${periodo.ate}.csv`,
    ).catch((e) => setErro(mensagem(e)));

  return (
    <div className="coluna">
      <h1>Relatórios</h1>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} aoExportar={exportar} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!r ? (
        <Carregando />
      ) : (
        <>
          <div className="grade">
            <Indicador
              heroi
              rotulo="Vendas pagas"
              valor={reais(r.vendas.pagoCentavos)}
              detalhe={`${numero(r.vendas.pedidos)} pedidos · ${reais(r.vendas.liquidoCentavos)} líquido`}
            />
            <Indicador
              rotulo="Conversão da fila"
              valor={
                r.fila.conversaoBp === null
                  ? '—'
                  : `${(r.fila.conversaoBp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
              }
              detalhe={`${r.fila.confirmados} confirmados · ${r.fila.recusados} recusados · ${r.fila.expirados} expirados`}
            />
            <Indicador
              rotulo="Tempo até o 1º contato"
              valor={tempo(r.fila.primeiroContatoMedioMin)}
              detalhe={`Até confirmar: ${tempo(r.fila.confirmacaoMediaMin)}`}
            />
            <Indicador
              rotulo="Descontos de cupons"
              valor={reais(r.vendas.descontoCentavos)}
              detalhe={
                r.vendas.estornadoCentavos
                  ? `${reais(r.vendas.estornadoCentavos)} devolvidos`
                  : undefined
              }
            />
          </div>
          <GraficoColunas
            titulo="Vendas pagas por semana"
            dados={r.vendasPorSemana.map((s) => ({
              ...rotulosSemana(s.semana),
              valor: s.pagoCentavos,
            }))}
            formatarValor={reais}
            formatarEixo={reaisCurto}
          />
          <div className="visualizador">
            <div className="cartao tabela-rolagem">
              <h2>Por pacote</h2>
              <TabelaSimples
                colunas={['Pacote', 'Pedidos', 'Vendido']}
                linhas={r.porPacote.map((p) => [
                  p.pacote,
                  numero(p.pedidos),
                  reais(p.pagoCentavos),
                ])}
              />
            </div>
            <div className="cartao tabela-rolagem">
              <h2>Aulas por instrutor</h2>
              <TabelaSimples
                colunas={['Instrutor', 'Concluídas', 'Agendadas', 'Canceladas']}
                linhas={r.aulasPorInstrutor.map((a) => [
                  a.instrutor,
                  numero(a.concluidas),
                  numero(a.agendadas),
                  numero(a.canceladas),
                ])}
              />
            </div>
          </div>
          {r.cupons.length > 0 && (
            <div className="cartao tabela-rolagem">
              <h2>Cupons usados</h2>
              <TabelaSimples
                colunas={['Cupom', 'Usos', 'Desconto']}
                linhas={r.cupons.map((c) => [c.codigo, numero(c.usos), reais(c.descontoCentavos)])}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RelatoriosAdmin() {
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'relatorios', periodo],
    queryFn: () => api<RelatorioAdmin>(`/admin/relatorios?de=${periodo.de}&ate=${periodo.ate}`),
  });
  const r = q.data;
  const exportar = () =>
    baixar(
      `/admin/relatorios/vendas.csv?de=${periodo.de}&ate=${periodo.ate}`,
      `vendas-${periodo.de}-a-${periodo.ate}.csv`,
    ).catch((e) => setErro(mensagem(e)));

  return (
    <div className="coluna">
      <h1>Relatórios</h1>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} aoExportar={exportar} />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!r ? (
        <Carregando />
      ) : (
        <>
          <div className="grade">
            <Indicador
              heroi
              rotulo="Vendas pagas"
              valor={reais(r.totais.pagoCentavos)}
              detalhe={`${numero(r.totais.pedidos)} pedidos`}
            />
            <Indicador
              rotulo="Comissão das vendas"
              valor={reais(r.totais.comissaoCentavos)}
              detalhe="Já descontados os cupons pagos pela plataforma"
            />
            <Indicador
              rotulo="Descontos de cupons"
              valor={reais(r.totais.descontoCentavos)}
              detalhe={`${reais(r.totais.estornadoCentavos)} devolvidos em estornos`}
            />
            <Indicador
              rotulo="Aulas concluídas"
              valor={numero(r.totais.aulasConcluidas)}
              detalhe={`${numero(r.totais.aulasCanceladas)} canceladas ou com falta`}
            />
          </div>
          <GraficoColunas
            titulo="Vendas pagas por dia"
            dados={r.vendasPorDia.map((d) => {
              const data = new Date(`${d.dia}T12:00:00`);
              return {
                rotulo: data.toLocaleDateString('pt-BR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: '2-digit',
                }),
                rotuloCurto: data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                valor: d.pagoCentavos,
              };
            })}
            formatarValor={reais}
            formatarEixo={reaisCurto}
          />
          <div className="visualizador">
            <div className="cartao tabela-rolagem">
              <h2>Maiores vendedores</h2>
              <TabelaSimples
                colunas={['Vendedor', 'Tipo', 'Pedidos', 'Vendido']}
                linhas={r.topVendedores.map((v) => [
                  v.nome,
                  v.tipo === 'autoescola' ? 'Autoescola' : 'Instrutor',
                  numero(v.pedidos),
                  reais(v.pagoCentavos),
                ])}
              />
            </div>
            <div className="cartao tabela-rolagem">
              <h2>Formas de pagamento</h2>
              <TabelaSimples
                colunas={['Forma', 'Pedidos', 'Vendido']}
                linhas={r.porMetodo.map((m) => [
                  m.metodo === 'cartao' ? `Cartão ${m.parcelas}x` : 'Pix',
                  numero(m.pedidos),
                  reais(m.pagoCentavos),
                ])}
              />
            </div>
          </div>
          {r.cupons.length > 0 && (
            <div className="cartao tabela-rolagem">
              <h2>Cupons</h2>
              <TabelaSimples
                colunas={['Cupom', 'Quem paga', 'Usos', 'Desconto']}
                linhas={r.cupons.map((c) => [
                  c.codigo,
                  c.bancadoPor === 'plataforma' ? 'Plataforma' : 'Vendedor',
                  numero(c.usos),
                  reais(c.descontoCentavos),
                ])}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Tabela de texto; colunas a partir da 2ª são numéricas (alinhadas à direita). */
function TabelaSimples({ colunas, linhas }: { colunas: string[]; linhas: string[][] }) {
  if (!linhas.length) return <p className="suave">Nada no período.</p>;
  const numerica = (i: number) => i > 0 && !(colunas[i] === 'Tipo' || colunas[i] === 'Quem paga');
  return (
    <table>
      <thead>
        <tr>
          {colunas.map((c, i) => (
            <th key={c} style={numerica(i) ? { textAlign: 'right' } : undefined}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, n) => (
          <tr key={n}>
            {l.map((v, i) => (
              <td
                key={i}
                style={
                  numerica(i)
                    ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
                    : undefined
                }
              >
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
