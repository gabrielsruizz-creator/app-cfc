import type { Compartilhamento, RastreamentoAula } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { api, mensagemDeErro } from '../servicos/api';
import { raio } from '../tema/cores';
import { useTema } from '../tema/TemaProvider';
import { dataHora, hora } from '../util/formatos';
import { Aviso, Botao, Cartao, Coluna, Divisor, Linha, Texto } from './ui';

/** Mapa ao vivo: posição do instrutor (de "a caminho" ao fim da aula) e o ponto de encontro. */
export function MapaAoVivo({ aulaId }: { aulaId: string }) {
  const { cores, escuro } = useTema();
  const mapa = useRef<MapView>(null);
  const enquadrado = useRef(false);
  const q = useQuery({
    queryKey: ['rastreamento', aulaId],
    queryFn: () => api<RastreamentoAula>(`/aluno/aulas/${aulaId}/rastreamento`),
    refetchInterval: 5_000,
  });
  const r = q.data;

  useEffect(() => {
    if (!r?.posicao || enquadrado.current) return;
    enquadrado.current = true;
    mapa.current?.fitToCoordinates(
      [
        { latitude: r.posicao.lat, longitude: r.posicao.lng },
        { latitude: r.pontoEncontro.lat, longitude: r.pontoEncontro.lng },
      ],
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true },
    );
  }, [r?.posicao, r?.pontoEncontro]);

  if (!r) return null;
  return (
    <Cartao>
      <Texto tipo="subtitulo">
        {r.status === 'a_caminho' ? 'Instrutor a caminho' : 'Aula em andamento'}
      </Texto>
      {r.status === 'a_caminho' && r.chegadaEstimadaMin !== null && (
        <Texto>
          Chegada em cerca de <Texto negrito>{r.chegadaEstimadaMin} min</Texto>
          {r.distanciaMetros !== null
            ? ` (${(r.distanciaMetros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km)`
            : ''}
        </Texto>
      )}
      {r.veiculo && (
        <Texto tipo="suave">
          {r.veiculo.modelo}
          {r.veiculo.cor ? ` ${r.veiculo.cor.toLowerCase()}` : ''} · placa {r.veiculo.placa}
        </Texto>
      )}
      <View style={{ height: 240, borderRadius: raio.md, overflow: 'hidden' }}>
        <MapView
          ref={mapa}
          style={{ flex: 1 }}
          userInterfaceStyle={escuro ? 'dark' : 'light'}
          initialRegion={{
            latitude: r.pontoEncontro.lat,
            longitude: r.pontoEncontro.lng,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
          accessibilityLabel="Mapa com a posição do instrutor e o ponto de encontro"
        >
          <Marker
            coordinate={{ latitude: r.pontoEncontro.lat, longitude: r.pontoEncontro.lng }}
            title="Ponto de encontro"
            description={r.pontoEncontroEndereco}
            pinColor={cores.destaque}
          />
          {r.posicao && (
            <Marker
              coordinate={{ latitude: r.posicao.lat, longitude: r.posicao.lng }}
              title={r.instrutor.nome}
              description={`Atualizado às ${hora(r.posicao.registradoEm)}`}
              pinColor={cores.primaria}
            />
          )}
        </MapView>
      </View>
      <Texto tipo="pequeno">
        {r.posicao
          ? `Posição atualizada às ${hora(r.posicao.registradoEm)}`
          : 'Aguardando a primeira posição do instrutor…'}
      </Texto>
    </Cartao>
  );
}

type LinkAtivo = { id: string; contatoNome: string | null; expiraEm: string };

/** Compartilhar a aula com um contato de confiança (link temporário, sem login). */
export function CompartilharAula({ aulaId }: { aulaId: string }) {
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['compartilhamentos', aulaId],
    queryFn: () => api<LinkAtivo[]>(`/aluno/aulas/${aulaId}/compartilhamentos`),
  });

  async function compartilhar() {
    setErro(null);
    setCriando(true);
    try {
      const c = await api<Compartilhamento>(`/aluno/aulas/${aulaId}/compartilhamentos`, {
        corpo: {},
      });
      await q.refetch();
      await Share.share({
        message: `Estou fazendo uma aula de direção. Acompanhe por aqui até ${dataHora(c.expiraEm)}: ${c.url}`,
      });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCriando(false);
    }
  }

  function desativar(l: LinkAtivo) {
    Alert.alert('Desativar link?', 'Quem recebeu não conseguirá mais acompanhar a aula.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Desativar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/aluno/aulas/${aulaId}/compartilhamentos/${l.id}`, { metodo: 'DELETE' });
            await q.refetch();
          } catch (e) {
            setErro(mensagemDeErro(e));
          }
        },
      },
    ]);
  }

  return (
    <Cartao>
      <Texto tipo="subtitulo">Contato de confiança</Texto>
      <Texto tipo="suave">
        Envie um link para alguém acompanhar sua aula e a chegada do instrutor no mapa. O link
        expira 2 horas depois do fim da aula.
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Botao
        titulo="Compartilhar aula"
        icone="share-social"
        variante="secundario"
        carregando={criando}
        aoPressionar={compartilhar}
      />
      {!!q.data?.length && (
        <Coluna gap={4}>
          <Texto tipo="rotulo">Links ativos</Texto>
          {q.data.map((l, i) => (
            <Coluna key={l.id} gap={4}>
              {i > 0 && <Divisor />}
              <Linha style={{ justifyContent: 'space-between' }}>
                <Texto tipo="pequeno" style={{ flex: 1 }}>
                  Válido até {dataHora(l.expiraEm)}
                </Texto>
                <Botao
                  titulo="Desativar"
                  compacto
                  variante="texto"
                  aoPressionar={() => desativar(l)}
                />
              </Linha>
            </Coluna>
          ))}
        </Coluna>
      )}
    </Cartao>
  );
}
