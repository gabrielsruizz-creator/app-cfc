import type { ResumoConversa } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Avatar,
  Cartao,
  Carregando,
  Coluna,
  Linha,
  Selo,
  Tela,
  Texto,
  Vazio,
} from '../src/componentes/ui';
import { api } from '../src/servicos/api';
import { dataHora } from '../src/util/formatos';

/** Conversas do aluno (com instrutores e autoescolas) ou do instrutor (com alunos). */
export default function Conversas() {
  const { como = 'aluno' } = useLocalSearchParams<{ como?: 'aluno' | 'instrutor' }>();
  const q = useQuery({
    queryKey: ['conversas', como],
    queryFn: () => api<ResumoConversa[]>(`/conversas?como=${como}`),
    refetchInterval: 15_000,
  });
  if (q.isLoading) return <Carregando />;
  const lista = q.data ?? [];
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {!lista.length ? (
        <Vazio
          icone="chatbubbles-outline"
          titulo="Nenhuma conversa"
          texto={
            como === 'instrutor'
              ? 'Converse com seus alunos pela ficha de cada um.'
              : 'Tire dúvidas com autoescolas e instrutores pelo perfil deles.'
          }
        />
      ) : (
        <Coluna gap={8}>
          {lista.map((c) => (
            <Cartao
              key={c.id}
              aoPressionar={() => router.push(`/conversa/${c.id}?como=${como}`)}
              rotuloAcessivel={`Conversa com ${c.outraParte.nome}${c.naoLidas ? `, ${c.naoLidas} não lidas` : ''}`}
            >
              <Linha gap={12}>
                <Avatar
                  nome={c.outraParte.nome}
                  arquivoId={c.outraParte.fotoArquivoId}
                  publico={c.outraParte.papel !== 'aluno'}
                  tamanho={44}
                />
                <Coluna gap={2} style={{ flex: 1 }}>
                  <Linha style={{ justifyContent: 'space-between' }}>
                    <Texto negrito style={{ flex: 1 }} linhas={1}>
                      {c.outraParte.nome}
                    </Texto>
                    {c.ultimaMensagemEm && (
                      <Texto tipo="pequeno">{dataHora(c.ultimaMensagemEm)}</Texto>
                    )}
                  </Linha>
                  <Linha style={{ justifyContent: 'space-between' }}>
                    <Texto tipo="suave" linhas={1} style={{ flex: 1 }}>
                      {c.ultimaMensagem ?? 'Sem mensagens ainda'}
                    </Texto>
                    {c.naoLidas > 0 && <Selo texto={String(c.naoLidas)} />}
                  </Linha>
                </Coluna>
              </Linha>
            </Cartao>
          ))}
        </Coluna>
      )}
    </Tela>
  );
}
