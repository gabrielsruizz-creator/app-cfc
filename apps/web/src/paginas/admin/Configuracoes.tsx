import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, mensagem } from '../../api';
import { Aviso, Carregando } from '../../componentes/comum';

type Item = { chave: string; valor: unknown; padrao: unknown; descricao: string };

export function AdminConfiguracoes() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'configuracoes'],
    queryFn: () => api<Item[]>('/admin/configuracoes'),
  });
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (q.data)
      setValores(
        Object.fromEntries(
          q.data.map((i) => [
            i.chave,
            Array.isArray(i.valor) ? (i.valor as number[]).join(', ') : String(i.valor),
          ]),
        ),
      );
  }, [q.data]);

  async function salvar() {
    setErro(null);
    setOk(false);
    const corpo: Record<string, unknown> = {};
    for (const item of q.data ?? []) {
      const texto = valores[item.chave] ?? '';
      const valor = Array.isArray(item.padrao)
        ? texto
            .split(',')
            .map((x) => Number(x.trim()))
            .filter((n) => !Number.isNaN(n))
        : Number(texto);
      if (JSON.stringify(valor) !== JSON.stringify(item.valor)) corpo[item.chave] = valor;
    }
    if (!Object.keys(corpo).length) return;
    try {
      await api('/admin/configuracoes', { metodo: 'PUT', corpo });
      setOk(true);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'configuracoes'] });
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  if (!q.data) return <Carregando />;
  return (
    <div className="coluna">
      <h1>Configurações</h1>
      <p className="suave">
        Regras de prazos, cancelamento e agenda. Alterações valem para novos agendamentos e ficam
        registradas na auditoria.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">Configurações salvas.</Aviso>}
      <div className="cartao">
        <div className="campos">
          {q.data.map((i) => (
            <div className="campo" key={i.chave}>
              <label htmlFor={i.chave}>{i.descricao}</label>
              <input
                id={i.chave}
                value={valores[i.chave] ?? ''}
                onChange={(e) => setValores({ ...valores, [i.chave]: e.target.value })}
              />
              <span className="ajuda">
                Padrão:{' '}
                {Array.isArray(i.padrao) ? (i.padrao as number[]).join(', ') : String(i.padrao)}
              </span>
            </div>
          ))}
        </div>
        <div>
          <button className="botao" onClick={salvar}>
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}
