import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, dataHora } from '../../api';
import { Aviso, Carregando } from '../../componentes/comum';

type Registro = {
  id: string;
  seq: number;
  ocorridoEm: string;
  atorTipo: string;
  atorUsuarioId: string | null;
  entidadeTipo: string;
  entidadeId: string;
  acao: string;
  antes: unknown;
  depois: unknown;
  motivo: string | null;
};

export function AdminAuditoria() {
  const [entidadeTipo, setEntidadeTipo] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'auditoria', entidadeTipo],
    queryFn: () =>
      api<{ cadeiaIntegra: boolean; registros: Registro[] }>(
        `/admin/auditoria?limite=100${entidadeTipo ? `&entidadeTipo=${entidadeTipo}` : ''}`,
      ),
  });
  return (
    <div className="coluna">
      <h1>Auditoria</h1>
      <p className="suave">
        Registro imutável de alterações sensíveis (preços, comissões, aprovações, estornos,
        documentos visualizados).
      </p>
      {q.data &&
        (q.data.cadeiaIntegra ? (
          <Aviso tipo="sucesso">Cadeia de registros íntegra (nenhuma adulteração detectada).</Aviso>
        ) : (
          <Aviso tipo="erro">
            Atenção: a cadeia de registros não confere. Possível adulteração.
          </Aviso>
        ))}
      <div className="campo" style={{ maxWidth: 320 }}>
        <label htmlFor="ent">Tipo de registro</label>
        <select id="ent" value={entidadeTipo} onChange={(e) => setEntidadeTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="instrutor">Instrutor</option>
          <option value="instrutor_documento">Documento de instrutor</option>
          <option value="autoescola">Autoescola</option>
          <option value="regra_comissao">Comissão</option>
          <option value="configuracao">Configuração</option>
          <option value="arquivo">Arquivo visualizado</option>
          <option value="usuario">Usuário</option>
        </select>
      </div>
      <div className="cartao tabela-rolagem">
        {q.isLoading ? (
          <Carregando />
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Quando</th>
                <th>Ator</th>
                <th>Ação</th>
                <th>Registro</th>
                <th>Antes → Depois</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.registros.map((r) => (
                <tr key={r.id}>
                  <td>{r.seq}</td>
                  <td>{dataHora(r.ocorridoEm)}</td>
                  <td>{r.atorTipo}</td>
                  <td>{r.acao}</td>
                  <td className="pequeno">
                    {r.entidadeTipo}
                    <br />
                    <span className="suave">{r.entidadeId.slice(0, 8)}…</span>
                  </td>
                  <td>
                    <pre>
                      {JSON.stringify(r.antes)} → {JSON.stringify(r.depois)}
                    </pre>
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
