import type { AulaResumo } from '@volante/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import {
  Aviso,
  Avatar,
  Botao,
  Cartao,
  Carregando,
  Coluna,
  Linha,
  Tela,
  Texto,
  Vazio,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { dataHora, formatarCentavos } from '../../src/util/formatos';

export default function Solicitacoes() {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['instrutor', 'solicitacoes'], queryFn: () => api<AulaResumo[]>('/instrutor/solicitacoes'), refetchInterval: 30000 });

  async function responder(a: AulaResumo, aceitar: boolean, motivo?: string) {
    setErro(null);
    setProcessando(a.id);
    try {
      await api(`/instrutor/aulas/${a.id}/${aceitar ? 'aceitar' : 'recusar'}`, aceitar ? { metodo: 'POST' } : { corpo: { motivo } });
      await queryClient.invalidateQueries({ queryKey: ['instrutor'] });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setProcessando(null);
    }
  }

  function recusar(a: AulaResumo) {
    Alert.alert('Recusar aula?', 'O aluno recebe o valor de volta. Escolha o motivo:', [
      { text: 'Horário indisponível', onPress: () => responder(a, false, 'Horário indisponível') },
      { text: 'Local fora da minha região', onPress: () => responder(a, false, 'Local fora da região de atendimento') },
      { text: 'Voltar', style: 'cancel' },
    ]);
  }

  if (q.isLoading) return <Carregando />;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {q.data?.length ? (
        q.data.map((a) => (
          <Cartao key={a.id} aoPressionar={() => router.push(`/area-instrutor/aula/${a.id}`)}>
            <Linha gap={12}>
              <Avatar nome={a.aluno.nome} arquivoId={a.aluno.fotoArquivoId} />
              <Coluna gap={2} style={{ flex: 1 }}>
                <Texto negrito>{a.aluno.nome}</Texto>
                <Texto tipo="suave">{dataHora(a.inicio)}</Texto>
                <Texto tipo="pequeno">{a.pontoEncontroEndereco}</Texto>
              </Coluna>
              <Texto negrito>{formatarCentavos(a.valorCentavos)}</Texto>
            </Linha>
            {a.aceiteAte && <Texto tipo="pequeno">Responda até {dataHora(a.aceiteAte)}</Texto>}
            <Linha>
              <Coluna style={{ flex: 1 }}>
                <Botao titulo="Recusar" variante="perigo" compacto desabilitado={processando === a.id} aoPressionar={() => recusar(a)} />
              </Coluna>
              <Coluna style={{ flex: 1 }}>
                <Botao titulo="Aceitar" compacto carregando={processando === a.id} aoPressionar={() => responder(a, true)} />
              </Coluna>
            </Linha>
          </Cartao>
        ))
      ) : (
        <Vazio icone="mail-open-outline" titulo="Nenhuma solicitação pendente" texto="Quando um aluno agendar com você, a solicitação aparece aqui." />
      )}
    </Tela>
  );
}
