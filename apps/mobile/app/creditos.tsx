import type { SaldoCredito } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Avatar,
  Botao,
  Cartao,
  Carregando,
  Coluna,
  ItemLista,
  Linha,
  Tela,
  Texto,
  Vazio,
} from '../src/componentes/ui';
import { api } from '../src/servicos/api';
import { useTema } from '../src/tema/TemaProvider';
import { dataCurta } from '../src/util/formatos';

type InstrutorEquipe = { id: string; nome: string; fotoArquivoId: string | null };

/** Instrutores vinculados à autoescola (para escolher com quem usar o saldo). */
function EscolherInstrutor({ credito }: { credito: SaldoCredito }) {
  const q = useQuery({
    queryKey: ['autoescola', credito.autoescolaId, 'instrutores'],
    queryFn: () =>
      api<InstrutorEquipe[]>(`/publico/autoescolas/${credito.autoescolaId}/instrutores`),
  });
  if (q.isLoading) return <Carregando />;
  if (!q.data?.length)
    return (
      <Texto tipo="suave">
        A autoescola ainda não tem instrutores no app. Fale com ela para agendar.
      </Texto>
    );
  return (
    <Coluna gap={4}>
      <Texto tipo="rotulo">Escolha o instrutor</Texto>
      {q.data.map((i) => (
        <ItemLista
          key={i.id}
          titulo={i.nome}
          direita={<Avatar nome={i.nome} arquivoId={i.fotoArquivoId} publico tamanho={36} />}
          aoPressionar={() => router.push(`/agendar/${i.id}?credito=${credito.id}`)}
        />
      ))}
    </Coluna>
  );
}

/** Saldo de aulas dos pacotes comprados. */
export default function Creditos() {
  const { cores } = useTema();
  const [aberto, setAberto] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['creditos'],
    queryFn: () => api<SaldoCredito[]>('/aluno/creditos'),
  });
  if (q.isLoading) return <Carregando />;
  const lista = q.data ?? [];
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {!lista.length ? (
        <Vazio
          icone="albums-outline"
          titulo="Sem saldo de aulas"
          texto="Quando você comprar um pacote, as aulas aparecem aqui para agendar."
          acao={
            <Botao titulo="Meus pedidos" compacto aoPressionar={() => router.push('/pedidos')} />
          }
        />
      ) : (
        <Coluna gap={12}>
          {lista.map((c) => (
            <Cartao key={c.id}>
              <Texto negrito>{c.descricao}</Texto>
              <Texto tipo="suave">{c.vendedorNome}</Texto>
              <Linha style={{ justifyContent: 'space-between' }}>
                <Texto tipo="subtitulo" cor={cores.primaria}>
                  {c.disponiveis} de {c.quantidadeTotal} aulas
                </Texto>
                {c.validoAte && <Texto tipo="pequeno">até {dataCurta(c.validoAte)}</Texto>}
              </Linha>
              {c.status === 'bloqueado' ? (
                <Texto tipo="pequeno">
                  Liberado para agendar quando a autoescola confirmar sua matrícula.
                </Texto>
              ) : c.status !== 'ativo' || c.disponiveis <= 0 ? (
                <Texto tipo="pequeno">Sem aulas disponíveis neste pacote.</Texto>
              ) : c.vendedorTipo === 'instrutor' && c.instrutorId ? (
                <Botao
                  titulo="Agendar aula"
                  icone="calendar"
                  compacto
                  aoPressionar={() => router.push(`/agendar/${c.instrutorId}?credito=${c.id}`)}
                />
              ) : aberto === c.id ? (
                <EscolherInstrutor credito={c} />
              ) : (
                <Botao
                  titulo="Agendar aula"
                  icone="calendar"
                  compacto
                  aoPressionar={() => setAberto(c.id)}
                />
              )}
            </Cartao>
          ))}
        </Coluna>
      )}
    </Tela>
  );
}
