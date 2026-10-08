import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Carregando } from '../../componentes/comum';

type Resumo = {
  instrutoresEmAnalise: number;
  autoescolasEmAnalise: number;
  eventosComFalha: number;
  cobrancasPendentesConfiguracao: number;
};

export function AdminInicio() {
  const q = useQuery({
    queryKey: ['admin', 'resumo'],
    queryFn: () => api<Resumo>('/admin/resumo'),
  });
  if (!q.data) return <Carregando />;
  const r = q.data;
  return (
    <div className="coluna">
      <h1>Administração</h1>
      <div className="grade">
        <Link
          to="/admin/instrutores?status=em_analise"
          className="cartao"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <span className="suave">Instrutores aguardando análise</span>
          <span className="numero">{r.instrutoresEmAnalise}</span>
        </Link>
        <Link
          to="/admin/autoescolas?status=em_analise"
          className="cartao"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <span className="suave">Autoescolas aguardando análise</span>
          <span className="numero">{r.autoescolasEmAnalise}</span>
        </Link>
        <Link
          to="/admin/operacoes"
          className="cartao"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <span className="suave">Eventos com falha</span>
          <span className="numero">{r.eventosComFalha}</span>
        </Link>
        <Link
          to="/admin/operacoes"
          className="cartao"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <span className="suave">Cobranças pendentes de configuração</span>
          <span className="numero">{r.cobrancasPendentesConfiguracao}</span>
        </Link>
      </div>
      <p className="suave pequeno">
        O dashboard completo (faturamento, aulas, usuários ativos e cidades) chega na Fase 2.
      </p>
    </div>
  );
}
