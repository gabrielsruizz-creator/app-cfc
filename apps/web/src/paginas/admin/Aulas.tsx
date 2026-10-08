import type { AulaResumo } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { api, dataHora, reais } from '../../api';
import { Carregando, Status } from '../../componentes/comum';

export function AdminAulas() {
  const q = useQuery({
    queryKey: ['admin', 'aulas'],
    queryFn: () => api<AulaResumo[]>('/admin/aulas'),
  });
  return (
    <div className="coluna">
      <h1>Aulas</h1>
      <div className="cartao tabela-rolagem">
        {q.isLoading ? (
          <Carregando />
        ) : q.data?.length ? (
          <table>
            <thead>
              <tr>
                <th>Início</th>
                <th>Aluno</th>
                <th>Instrutor</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id}>
                  <td>{dataHora(a.inicio)}</td>
                  <td>{a.aluno.nome}</td>
                  <td>{a.instrutor.nome}</td>
                  <td>{reais(a.valorCentavos)}</td>
                  <td>
                    <Status valor={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="suave">Nenhuma aula ainda.</p>
        )}
      </div>
    </div>
  );
}
