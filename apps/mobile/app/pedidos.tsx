import type { ResumoPedido } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Cartao,
  Carregando,
  Coluna,
  Linha,
  Selo,
  Tela,
  Texto,
  Vazio,
  Botao,
} from '../src/componentes/ui';
import { api } from '../src/servicos/api';
import { NOMES_ATENDIMENTO } from '../src/servicos/comercial';
import { useTema } from '../src/tema/TemaProvider';
import { dataCurta, formatarCentavos } from '../src/util/formatos';

function situacao(p: ResumoPedido): {
  texto: string;
  tipo: 'alerta' | 'sucesso' | 'erro' | 'info';
} {
  if (p.status === 'aguardando_pagamento') return { texto: 'Aguardando pagamento', tipo: 'alerta' };
  if (p.status === 'cancelado') return { texto: 'Cancelado', tipo: 'erro' };
  if (p.status === 'estornado') return { texto: 'Valor devolvido', tipo: 'erro' };
  if (p.vendedorTipo === 'autoescola' && p.statusAtendimento) {
    const t = NOMES_ATENDIMENTO[p.statusAtendimento] ?? p.statusAtendimento;
    return {
      texto: t,
      tipo:
        p.statusAtendimento === 'confirmado'
          ? 'sucesso'
          : ['recusado', 'expirado'].includes(p.statusAtendimento)
            ? 'erro'
            : 'info',
    };
  }
  return { texto: 'Pacote ativo', tipo: 'sucesso' };
}

/** Pacotes comprados (de instrutores e autoescolas). As aulas avulsas ficam em "Minhas aulas". */
export default function Pedidos() {
  const { cores } = useTema();
  const q = useQuery({
    queryKey: ['pedidos'],
    queryFn: () => api<ResumoPedido[]>('/aluno/pedidos'),
  });
  if (q.isLoading) return <Carregando />;
  const pacotes = (q.data ?? []).filter((p) => p.tipo === 'pacote');
  const cor = {
    alerta: cores.alerta,
    sucesso: cores.sucesso,
    erro: cores.erro,
    info: cores.primaria,
  };
  const fundo = {
    alerta: cores.alertaSuave,
    sucesso: cores.sucessoSuave,
    erro: cores.erroSuave,
    info: cores.primariaSuave,
  };
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {!pacotes.length ? (
        <Vazio
          icone="bag-handle-outline"
          titulo="Nenhum pacote ainda"
          texto="Compre pacotes de aulas com autoescolas ou instrutores e pague menos por aula."
          acao={
            <Botao
              titulo="Ver autoescolas"
              compacto
              aoPressionar={() => router.push('/autoescolas')}
            />
          }
        />
      ) : (
        <Coluna gap={12}>
          {pacotes.map((p) => {
            const s = situacao(p);
            return (
              <Cartao key={p.id} aoPressionar={() => router.push(`/pedido/${p.id}`)}>
                <Linha style={{ justifyContent: 'space-between' }}>
                  <Texto negrito style={{ flex: 1 }}>
                    {p.descricao}
                  </Texto>
                  <Texto>{formatarCentavos(p.valorTotalCentavos)}</Texto>
                </Linha>
                <Texto tipo="suave">
                  {p.vendedorNome} · {dataCurta(p.criadoEm)}
                </Texto>
                <Selo texto={s.texto} cor={cor[s.tipo]} fundo={fundo[s.tipo]} />
              </Cartao>
            );
          })}
        </Coluna>
      )}
    </Tela>
  );
}
