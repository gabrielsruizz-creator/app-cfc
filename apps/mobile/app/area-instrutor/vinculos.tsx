import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  Linha,
  Selo,
  Tela,
  Texto,
  Vazio,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';

type Vinculo = {
  id: string;
  status: 'convidado' | 'ativo';
  autoescolaId: string;
  nomeFantasia: string;
  municipio: string;
  uf: string;
};

/** Convites e equipes de autoescolas. Instrutor vinculado dá as aulas dos pacotes da autoescola. */
export default function Vinculos() {
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['instrutor', 'vinculos'],
    queryFn: () => api<Vinculo[]>('/instrutor/vinculos'),
  });
  if (q.isLoading) return <Carregando />;

  async function responder(id: string, acao: 'aceitar' | 'recusar' | 'encerrar') {
    setErro(null);
    try {
      await api(`/instrutor/vinculos/${id}/${acao}`, { metodo: 'POST' });
      await q.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Texto tipo="suave">
        Fazendo parte da equipe de uma autoescola, você recebe agendamentos dos alunos dela (pagos
        pelos pacotes da autoescola). Você continua autônomo no app.
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!q.data?.length ? (
        <Vazio
          icone="business-outline"
          titulo="Nenhum convite"
          texto="Quando uma autoescola convidar você, o convite aparece aqui."
        />
      ) : (
        q.data.map((v) => (
          <Cartao key={v.id}>
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto negrito style={{ flex: 1 }}>
                {v.nomeFantasia}
              </Texto>
              <Selo texto={v.status === 'ativo' ? 'Na equipe' : 'Convite'} />
            </Linha>
            <Texto tipo="suave">
              {v.municipio}/{v.uf}
            </Texto>
            {v.status === 'convidado' ? (
              <Linha>
                <Botao titulo="Aceitar" compacto aoPressionar={() => responder(v.id, 'aceitar')} />
                <Botao
                  titulo="Recusar"
                  compacto
                  variante="texto"
                  aoPressionar={() => responder(v.id, 'recusar')}
                />
              </Linha>
            ) : (
              <Botao
                titulo="Sair da equipe"
                compacto
                variante="texto"
                aoPressionar={() =>
                  Alert.alert(
                    'Sair da equipe?',
                    `Você deixará de atender os alunos da ${v.nomeFantasia}.`,
                    [
                      { text: 'Voltar', style: 'cancel' },
                      {
                        text: 'Sair',
                        style: 'destructive',
                        onPress: () => void responder(v.id, 'encerrar'),
                      },
                    ],
                  )
                }
              />
            )}
          </Cartao>
        ))
      )}
    </Tela>
  );
}
