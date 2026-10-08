import type { AulaResumo } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CartaoAula } from '../../src/componentes/CartaoAula';
import { Aviso, Botao, Cartao, Coluna, Linha, Tela, Texto } from '../../src/componentes/ui';
import { api } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';
import { useTema } from '../../src/tema/TemaProvider';

type Evolucao = { horasAcumuladasMin: number; aulasConcluidas: number };
type Notificacao = { lida: boolean };

export default function InicioAluno() {
  const { eu } = useAuth();
  const { cores } = useTema();
  const aulas = useQuery({
    queryKey: ['aluno', 'aulas', 'proximas'],
    queryFn: () => api<AulaResumo[]>('/aluno/aulas'),
  });
  const evolucao = useQuery({
    queryKey: ['aluno', 'evolucao'],
    queryFn: () => api<Evolucao>('/aluno/evolucao'),
  });
  const notif = useQuery({
    queryKey: ['notificacoes'],
    queryFn: () => api<Notificacao[]>('/notificacoes'),
  });
  const naoLidas = notif.data?.filter((n) => !n.lida).length ?? 0;
  const proxima = aulas.data?.[0];
  const pendenteConfirmacao = aulas.data?.find((a) => a.status === 'aguardando_confirmacao');

  return (
    <Tela
      aoAtualizar={() => {
        void aulas.refetch();
        void evolucao.refetch();
        void notif.refetch();
      }}
      atualizando={aulas.isRefetching}
    >
      <Linha style={{ justifyContent: 'space-between' }}>
        <Texto tipo="titulo">Olá, {eu?.nome.split(' ')[0]}!</Texto>
        <Botao
          titulo={naoLidas ? `${naoLidas}` : ''}
          icone="notifications"
          variante="texto"
          compacto
          rotuloAcessivel={`Notificações, ${naoLidas} não lidas`}
          aoPressionar={() => router.push('/notificacoes')}
        />
      </Linha>
      {pendenteConfirmacao && (
        <Aviso tipo="alerta" titulo="Confirme o fim da sua aula">
          <Botao
            titulo="Confirmar agora"
            compacto
            aoPressionar={() => router.push(`/aula/${pendenteConfirmacao.id}`)}
          />
        </Aviso>
      )}
      <Coluna>
        <Texto tipo="rotulo">Próxima aula</Texto>
        {proxima ? (
          <CartaoAula
            aula={proxima}
            visao="aluno"
            aoPressionar={() => router.push(`/aula/${proxima.id}`)}
          />
        ) : (
          <Cartao>
            <Texto tipo="subtitulo">Nenhuma aula agendada</Texto>
            <Texto tipo="suave">
              Encontre um instrutor perto de você e agende sua primeira aula.
            </Texto>
            <Botao
              titulo="Encontrar instrutor"
              icone="search"
              aoPressionar={() => router.push('/buscar')}
            />
          </Cartao>
        )}
      </Coluna>
      <Linha gap={12}>
        <Cartao
          style={{ flex: 1 }}
          aoPressionar={() => router.push('/evolucao')}
          rotuloAcessivel="Ver minha evolução"
        >
          <Texto tipo="rotulo">Horas de aula</Texto>
          <Texto tipo="titulo" cor={cores.primaria}>
            {Math.floor((evolucao.data?.horasAcumuladasMin ?? 0) / 60)}h
            {String((evolucao.data?.horasAcumuladasMin ?? 0) % 60).padStart(2, '0')}
          </Texto>
        </Cartao>
        <Cartao
          style={{ flex: 1 }}
          aoPressionar={() => router.push('/evolucao')}
          rotuloAcessivel="Ver aulas concluídas"
        >
          <Texto tipo="rotulo">Aulas feitas</Texto>
          <Texto tipo="titulo" cor={cores.primaria}>
            {evolucao.data?.aulasConcluidas ?? 0}
          </Texto>
        </Cartao>
      </Linha>
      <Botao
        titulo="Agendar nova aula"
        icone="add-circle"
        variante="destaque"
        aoPressionar={() => router.push('/buscar')}
      />
    </Tela>
  );
}
