import type { AulaDetalhe } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Aviso, Botao, Cartao, Carregando, Coluna, Tela, Texto } from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { useTema } from '../../src/tema/TemaProvider';
import { dataHora, formatarCentavos } from '../../src/util/formatos';

function useContagem(ate: string | null | undefined) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!ate) return null;
  const resta = Math.max(0, new Date(ate).getTime() - agora);
  return `${Math.floor(resta / 60000)}:${String(Math.floor((resta % 60000) / 1000)).padStart(2, '0')}`;
}

export default function Pagamento() {
  const { aulaId } = useLocalSearchParams<{ aulaId: string }>();
  const { cores } = useTema();
  const [copiado, setCopiado] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['aula', aulaId],
    queryFn: () => api<AulaDetalhe>(`/aluno/aulas/${aulaId}`),
    refetchInterval: (consulta) => (consulta.state.data?.status === 'aguardando_pagamento' ? 3000 : false),
  });
  const contagem = useContagem(q.data?.cobranca?.pixExpiraEm);

  if (q.isLoading || !q.data) return <Carregando />;
  const aula = q.data;
  const cobranca = aula.cobranca;

  if (aula.status !== 'aguardando_pagamento') {
    const pago = ['solicitada', 'confirmada'].includes(aula.status);
    return (
      <Tela>
        <Coluna gap={16} style={{ alignItems: 'center', paddingTop: 32 }}>
          <Texto tipo="titulo" centro>
            {pago ? 'Pagamento confirmado!' : 'Pagamento não concluído'}
          </Texto>
          <Texto tipo="suave" centro>
            {pago
              ? `Sua solicitação foi enviada para ${aula.instrutor.nome}. Avisaremos quando ele confirmar. O valor fica guardado até a aula acontecer.`
              : 'O prazo do Pix terminou e o horário foi liberado. Você pode agendar novamente.'}
          </Texto>
          <Botao titulo="Ver minha aula" aoPressionar={() => router.replace(`/aula/${aula.id}`)} />
          <Botao titulo="Ir para o início" variante="texto" aoPressionar={() => router.replace('/inicio')} />
        </Coluna>
      </Tela>
    );
  }

  async function simular() {
    setErro(null);
    setSimulando(true);
    try {
      await api(`/dev/cobrancas/${cobranca!.id}/simular-pagamento`, { metodo: 'POST' });
      setTimeout(() => void q.refetch(), 1500);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSimulando(false);
    }
  }

  async function cancelar() {
    try {
      await api(`/aluno/aulas/${aula.id}/cancelar`, { corpo: { motivo: 'Desistiu antes de pagar' } });
      router.replace('/inicio');
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <Tela>
      <Texto tipo="titulo">Pague com Pix</Texto>
      <Texto tipo="suave">
        Aula com {aula.instrutor.nome} · {dataHora(aula.inicio)}
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {!cobranca || cobranca.status === 'pendente_envio' ? (
        <Cartao style={{ alignItems: 'center' }}>
          <Carregando texto="Gerando o Pix..." />
        </Cartao>
      ) : cobranca.status === 'pendente_configuracao' || cobranca.status === 'falhou' ? (
        <>
          <Aviso tipo="alerta" titulo="Pagamento indisponível no momento">
            O meio de pagamento ainda não está configurado. Nenhum valor foi cobrado. Tente novamente mais tarde.
          </Aviso>
          <Botao titulo="Cancelar solicitação" variante="perigo" aoPressionar={cancelar} />
        </>
      ) : (
        <>
          <Cartao style={{ alignItems: 'center', gap: 16 }}>
            <Texto tipo="subtitulo" cor={cores.primaria}>
              {formatarCentavos(cobranca.valorCentavos)}
            </Texto>
            <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
              {cobranca.pixQrCodeBase64 ? (
                <Image source={{ uri: `data:image/png;base64,${cobranca.pixQrCodeBase64}` }} style={{ width: 220, height: 220 }} accessibilityLabel="QR Code do Pix" />
              ) : cobranca.pixCopiaCola ? (
                <QRCode value={cobranca.pixCopiaCola} size={220} />
              ) : null}
            </View>
            {contagem && <Texto tipo="suave">O código expira em {contagem}</Texto>}
            <Botao
              titulo={copiado ? 'Código copiado!' : 'Copiar código Pix'}
              icone={copiado ? 'checkmark' : 'copy'}
              variante="secundario"
              aoPressionar={async () => {
                await Clipboard.setStringAsync(cobranca.pixCopiaCola ?? '');
                setCopiado(true);
                setTimeout(() => setCopiado(false), 3000);
              }}
            />
          </Cartao>
          <Texto tipo="pequeno" centro>
            Abra o app do seu banco, escolha Pix copia e cola ou leia o QR Code. A confirmação aparece aqui automaticamente.
          </Texto>
          {cobranca.ambienteTeste && (
            <Aviso tipo="alerta" titulo="Ambiente de teste">
              <Coluna>
                <Texto>Este Pix é simulado e não pode ser pago de verdade.</Texto>
                <Botao titulo="Simular pagamento" compacto variante="destaque" carregando={simulando} aoPressionar={simular} />
              </Coluna>
            </Aviso>
          )}
          <Botao titulo="Cancelar solicitação" variante="texto" aoPressionar={cancelar} />
        </>
      )}
    </Tela>
  );
}
