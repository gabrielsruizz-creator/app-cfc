import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share } from 'react-native';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  Divisor,
  Interruptor,
  ItemLista,
  Tela,
  Texto,
} from '../src/componentes/ui';
import { api, ErroApi, mensagemDeErro } from '../src/servicos/api';
import { useAuth } from '../src/servicos/AuthProvider';

type Consentimento = { finalidade: string; aceito: boolean; registradoEm: string };

export default function Privacidade() {
  const { sair } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['consentimentos'],
    queryFn: () => api<Consentimento[]>('/privacidade/consentimentos'),
  });
  const aceito = (f: string) => q.data?.find((c) => c.finalidade === f)?.aceito ?? false;

  async function alternar(finalidade: string, valor: boolean) {
    try {
      await api('/privacidade/consentimentos', { corpo: { finalidade, aceito: valor } });
      await q.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function exportar() {
    try {
      const dados = await api('/privacidade/meus-dados');
      await Share.share({ message: JSON.stringify(dados, null, 2), title: 'Meus dados' });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  function excluir() {
    Alert.alert(
      'Excluir conta?',
      'Seus dados pessoais serão apagados e você não poderá mais entrar. Registros financeiros são mantidos de forma anônima pelo prazo legal. Esta ação não pode ser desfeita.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Excluir minha conta',
          style: 'destructive',
          onPress: async () => {
            try {
              await api('/privacidade/exclusao', { corpo: { confirmacao: 'EXCLUIR' } });
              await sair();
              router.replace('/boas-vindas');
            } catch (e) {
              const pend =
                e instanceof ErroApi
                  ? (e.detalhes as { pendencias?: string[] } | undefined)?.pendencias
                  : undefined;
              setErro(pend?.length ? `${mensagemDeErro(e)}: ${pend.join(' ')}` : mensagemDeErro(e));
            }
          },
        },
      ],
    );
  }

  if (q.isLoading) return <Carregando />;
  return (
    <Tela>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Cartao>
        <Texto tipo="rotulo">Consentimentos</Texto>
        <Interruptor
          rotulo="Novidades e promoções"
          descricao="Receber ofertas por e-mail e notificação"
          ligado={aceito('marketing')}
          aoMudar={(v) => alternar('marketing', v)}
        />
        <Divisor />
        <ItemLista
          icone="document-text"
          titulo="Termos de uso"
          descricao="Aceito no cadastro"
          aoPressionar={() => router.push('/documento-legal/termos_uso')}
        />
        <ItemLista
          icone="lock-closed"
          titulo="Política de privacidade"
          descricao="Aceita no cadastro"
          aoPressionar={() => router.push('/documento-legal/politica_privacidade')}
        />
      </Cartao>
      <Cartao>
        <Texto tipo="rotulo">Localização</Texto>
        <Texto tipo="suave">
          Usamos sua localização para encontrar instrutores e confirmar o check-in. A localização do
          instrutor só é compartilhada durante a aula.
        </Texto>
      </Cartao>
      <Cartao>
        <Texto tipo="rotulo">Seus dados</Texto>
        <Botao
          titulo="Baixar meus dados"
          variante="secundario"
          icone="download"
          aoPressionar={exportar}
        />
        <Botao
          titulo="Excluir minha conta"
          variante="perigo"
          icone="trash"
          aoPressionar={excluir}
        />
      </Cartao>
    </Tela>
  );
}
