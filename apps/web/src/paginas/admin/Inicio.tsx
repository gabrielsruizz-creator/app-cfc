import { useQuery } from '@tanstack/react-query';
import { api, reais } from '../../api';
import { Carregando, GraficoColunas, Indicador, numero } from '../../componentes/comum';

type Resumo = {
  instrutoresEmAnalise: number;
  autoescolasEmAnalise: number;
  eventosComFalha: number;
  cobrancasPendentesConfiguracao: number;
};

type Dashboard = {
  aulasRealizadasMes: number;
  aulasAgendadas: number;
  faturamentoMesCentavos: number;
  receitaPlataformaMesCentavos: number;
  pedidosNaFila: number;
  usuariosAtivos30d: number;
  novosUsuariosMes: number;
  usuariosTotal: number;
  instrutoresAprovados: number;
  autoescolasAprovadas: number;
  alunos: number;
  cidades: { municipio: string; uf: string; autoescolas: number }[];
  aulasPorDia: { dia: string; total: number }[];
  denunciasAbertas: number;
  disputasAbertas: number;
};

/** Últimos 30 dias, com zero nos dias sem aula (a série não pode ter buracos). */
function serie30Dias(pontos: { dia: string; total: number }[]) {
  const mapa = new Map(pontos.map((p) => [p.dia, p.total]));
  const hoje = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - 29 + i);
    const chave = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    return {
      rotulo: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      rotuloCurto: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      valor: mapa.get(chave) ?? 0,
    };
  });
}

export function AdminInicio() {
  const resumo = useQuery({
    queryKey: ['admin', 'resumo'],
    queryFn: () => api<Resumo>('/admin/resumo'),
  });
  const dash = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api<Dashboard>('/admin/dashboard'),
    refetchInterval: 60_000,
  });
  if (!resumo.data || !dash.data) return <Carregando />;
  const r = resumo.data;
  const d = dash.data;
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  return (
    <div className="coluna">
      <h1>Administração</h1>
      <div className="grade">
        <Indicador
          heroi
          rotulo={`Aulas realizadas em ${mes}`}
          valor={numero(d.aulasRealizadasMes)}
          detalhe={`${numero(d.aulasAgendadas)} agendadas`}
          para="/admin/aulas"
        />
        <Indicador
          rotulo={`Faturamento em ${mes}`}
          valor={reais(d.faturamentoMesCentavos)}
          detalhe="Pago pelos alunos (bruto)"
        />
        <Indicador
          rotulo={`Receita da plataforma em ${mes}`}
          valor={reais(d.receitaPlataformaMesCentavos)}
          detalhe="Comissões já liberadas"
          para="/admin/comissoes"
        />
        <Indicador
          rotulo="Usuários ativos (30 dias)"
          valor={numero(d.usuariosAtivos30d)}
          detalhe={`${numero(d.novosUsuariosMes)} novos em ${mes} · ${numero(d.usuariosTotal)} no total`}
          para="/admin/usuarios"
        />
      </div>

      <GraficoColunas
        titulo="Aulas concluídas por dia (últimos 30 dias)"
        dados={serie30Dias(d.aulasPorDia)}
        unidade={['aula', 'aulas']}
      />

      <h2>Precisa de atenção</h2>
      <div className="grade">
        <Indicador
          rotulo="Instrutores aguardando análise"
          valor={r.instrutoresEmAnalise}
          para="/admin/instrutores?status=em_analise"
        />
        <Indicador
          rotulo="Autoescolas aguardando análise"
          valor={r.autoescolasEmAnalise}
          para="/admin/autoescolas?status=em_analise"
        />
        <Indicador rotulo="Disputas abertas" valor={d.disputasAbertas} para="/admin/disputas" />
        <Indicador rotulo="Denúncias abertas" valor={d.denunciasAbertas} para="/admin/denuncias" />
        <Indicador rotulo="Eventos com falha" valor={r.eventosComFalha} para="/admin/operacoes" />
        <Indicador
          rotulo="Cobranças pendentes de configuração"
          valor={r.cobrancasPendentesConfiguracao}
          para="/admin/operacoes"
        />
      </div>

      <div className="visualizador">
        <div className="cartao">
          <h2>Rede</h2>
          <table>
            <tbody>
              <tr>
                <td>Instrutores aprovados</td>
                <td style={{ textAlign: 'right' }}>{numero(d.instrutoresAprovados)}</td>
              </tr>
              <tr>
                <td>Autoescolas aprovadas</td>
                <td style={{ textAlign: 'right' }}>{numero(d.autoescolasAprovadas)}</td>
              </tr>
              <tr>
                <td>Alunos cadastrados</td>
                <td style={{ textAlign: 'right' }}>{numero(d.alunos)}</td>
              </tr>
              <tr>
                <td>Pedidos na fila das autoescolas</td>
                <td style={{ textAlign: 'right' }}>{numero(d.pedidosNaFila)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="cartao">
          <h2>Cidades com autoescolas</h2>
          {d.cidades.length ? (
            <table>
              <thead>
                <tr>
                  <th>Cidade</th>
                  <th style={{ textAlign: 'right' }}>Autoescolas</th>
                </tr>
              </thead>
              <tbody>
                {d.cidades.map((c) => (
                  <tr key={`${c.municipio}-${c.uf}`}>
                    <td>
                      {c.municipio}/{c.uf}
                    </td>
                    <td style={{ textAlign: 'right' }}>{numero(c.autoescolas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="suave">Nenhuma autoescola aprovada ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}
