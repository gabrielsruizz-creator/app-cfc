import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Image, Linking, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api, mensagemDeErro } from '../servicos/api';
import { useTema } from '../tema/TemaProvider';
import { formatarCentavos } from '../util/formatos';
import { Aviso, Botao, Cartao, Carregando, Coluna, Texto } from './ui';

type Cobranca = {
  id: string;
  status: string;
  metodo?: string;
  parcelas?: number;
  urlPagamento?: string | null;
  valorCentavos: number;
  pixCopiaCola: string | null;
  pixQrCodeBase64: string | null;
  pixExpiraEm: string | null;
  ambienteTeste: boolean;
};

function useContagem(ate: string | null | undefined) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!ate) return null;
  const resta = Math.max(0, new Date(ate).getTime() - agora);
  const h = Math.floor(resta / 3600_000);
  if (h >= 1) return `${h} h`;
  return `${Math.floor(resta / 60000)}:${String(Math.floor((resta % 60000) / 1000)).padStart(2, '0')}`;
}

/** QR Code, copia e cola e (em teste) "Simular pagamento" de uma cobrança Pix. */
export function PixCobranca({
  cobranca,
  aoSimular,
}: {
  cobranca: Cobranca | null;
  aoSimular: () => void;
}) {
  const { cores } = useTema();
  const [copiado, setCopiado] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const contagem = useContagem(cobranca?.pixExpiraEm);

  if (!cobranca || cobranca.status === 'pendente_envio')
    return (
      <Cartao style={{ alignItems: 'center' }}>
        <Carregando texto="Gerando o Pix..." />
      </Cartao>
    );
  if (cobranca.status === 'pendente_configuracao' || cobranca.status === 'falhou')
    return (
      <Aviso tipo="alerta" titulo="Pagamento indisponível no momento">
        O meio de pagamento ainda não está configurado. Nenhum valor foi cobrado. Tente novamente
        mais tarde.
      </Aviso>
    );

  async function simular() {
    setErro(null);
    setSimulando(true);
    try {
      await api(`/dev/cobrancas/${cobranca!.id}/simular-pagamento`, { metodo: 'POST' });
      setTimeout(aoSimular, 1500);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSimulando(false);
    }
  }

  const simulacao = cobranca.ambienteTeste && (
    <Aviso tipo="alerta" titulo="Ambiente de teste">
      <Coluna>
        <Texto>Este pagamento é simulado e não pode ser pago de verdade.</Texto>
        <Botao
          titulo="Simular pagamento"
          compacto
          variante="destaque"
          carregando={simulando}
          aoPressionar={simular}
        />
      </Coluna>
    </Aviso>
  );

  if (cobranca.metodo === 'cartao') {
    const parcelas = cobranca.parcelas ?? 1;
    return (
      <Coluna gap={12}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Cartao style={{ alignItems: 'center', gap: 12 }}>
          <Texto tipo="subtitulo" cor={cores.primaria}>
            {formatarCentavos(cobranca.valorCentavos)}
          </Texto>
          <Texto tipo="suave">
            {parcelas > 1
              ? `${parcelas}x de ${formatarCentavos(Math.ceil(cobranca.valorCentavos / parcelas))} sem juros no cartão`
              : 'À vista no cartão de crédito'}
          </Texto>
          {cobranca.urlPagamento && (
            <Botao
              titulo="Pagar com cartão"
              icone="card"
              aoPressionar={() => void Linking.openURL(cobranca.urlPagamento!)}
            />
          )}
          {contagem && <Texto tipo="pequeno">O link de pagamento vale por mais {contagem}</Texto>}
        </Cartao>
        <Texto tipo="pequeno" centro>
          Os dados do cartão são digitados na página segura do meio de pagamento. A confirmação
          aparece aqui automaticamente.
        </Texto>
        {simulacao}
      </Coluna>
    );
  }

  return (
    <Coluna gap={12}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Cartao style={{ alignItems: 'center', gap: 16 }}>
        <Texto tipo="subtitulo" cor={cores.primaria}>
          {formatarCentavos(cobranca.valorCentavos)}
        </Texto>
        <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
          {cobranca.pixQrCodeBase64 ? (
            <Image
              source={{ uri: `data:image/png;base64,${cobranca.pixQrCodeBase64}` }}
              style={{ width: 220, height: 220 }}
              accessibilityLabel="QR Code do Pix"
            />
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
        Abra o app do seu banco, escolha Pix copia e cola ou leia o QR Code. A confirmação aparece
        aqui automaticamente.
      </Texto>
      {simulacao}
    </Coluna>
  );
}
