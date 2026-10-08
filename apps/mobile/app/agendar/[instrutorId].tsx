import type {
  AulaDetalhe,
  ConfiguracoesPublicas,
  HorarioLivre,
  PerfilInstrutorPublico,
} from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  Campo,
  Chip,
  Coluna,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';
import { espaco, raio } from '../../src/tema/cores';
import { useTema } from '../../src/tema/TemaProvider';
import {
  enderecoDe,
  obterLocalizacao,
  PONTO_PADRAO,
  pontoDeEndereco,
  type Ponto,
} from '../../src/util/dispositivo';
import { dataCurta, formatarCentavos, hora, partesData } from '../../src/util/formatos';

type Passo = 'quando' | 'onde' | 'resumo';

export default function Agendar() {
  const { instrutorId, remarcar } = useLocalSearchParams<{
    instrutorId: string;
    remarcar?: string;
  }>();
  const { eu } = useAuth();
  const { cores, escuro } = useTema();
  const [passo, setPasso] = useState<Passo>('quando');
  const [data, setData] = useState<string | null>(null);
  const [horario, setHorario] = useState<HorarioLivre | null>(null);
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [endereco, setEndereco] = useState('');
  const [referencia, setReferencia] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const chaveIdempotencia = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const mapa = useRef<MapView>(null);

  const instrutor = useQuery({
    queryKey: ['instrutor', instrutorId],
    queryFn: () => api<PerfilInstrutorPublico>(`/publico/instrutores/${instrutorId}`),
  });
  const config = useQuery({
    queryKey: ['config-publica'],
    queryFn: () => api<ConfiguracoesPublicas>('/publico/configuracoes'),
  });
  const dias = useQuery({
    queryKey: ['dias', instrutorId],
    queryFn: () =>
      api<{ dias: { data: string; quantidadeHorarios: number }[] }>(
        `/publico/instrutores/${instrutorId}/dias`,
      ),
  });
  const horarios = useQuery({
    queryKey: ['horarios', instrutorId, data],
    queryFn: () => api<HorarioLivre[]>(`/publico/instrutores/${instrutorId}/horarios?data=${data}`),
    enabled: !!data,
  });

  useEffect(() => {
    const primeiro = dias.data?.dias.find((d) => d.quantidadeHorarios > 0);
    if (primeiro && !data) setData(primeiro.data);
  }, [dias.data, data]);

  useEffect(() => {
    if (!instrutor.data || categoria) return;
    const desejada = eu?.aluno?.categoriaDesejada;
    setCategoria(
      instrutor.data.categorias.find((c) => desejada?.includes(c)) ??
        instrutor.data.categorias[0] ??
        null,
    );
  }, [instrutor.data, categoria, eu]);

  useEffect(() => {
    if (passo !== 'onde' || ponto) return;
    obterLocalizacao().then(async (p) => {
      const inicial = p ?? PONTO_PADRAO;
      setPonto(inicial);
      setEndereco(await enderecoDe(inicial));
    });
  }, [passo, ponto]);

  const fimDoHorario = useMemo(() => (horario ? hora(horario.fim) : ''), [horario]);

  async function buscarEndereco() {
    const p = await pontoDeEndereco(endereco);
    if (!p) return setErro('Endereço não encontrado. Arraste o pino no mapa.');
    setErro(null);
    setPonto(p);
    mapa.current?.animateToRegion({
      latitude: p.lat,
      longitude: p.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  }

  async function confirmarRemarcacao() {
    if (!horario || !remarcar) return;
    setErro(null);
    setEnviando(true);
    try {
      await api(`/aluno/aulas/${remarcar}/remarcar`, { corpo: { inicio: horario.inicio } });
      router.replace(`/aula/${remarcar}`);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar() {
    if (!horario || !ponto || !categoria) return;
    setErro(null);
    setEnviando(true);
    try {
      const aula = await api<AulaDetalhe>('/aluno/aulas', {
        corpo: {
          instrutorId,
          inicio: horario.inicio,
          categoria,
          pontoEncontro: ponto,
          pontoEncontroEndereco: endereco || 'Ponto marcado no mapa',
          pontoEncontroReferencia: referencia || undefined,
        },
        cabecalhos: { 'idempotency-key': chaveIdempotencia.current },
      });
      router.replace(`/pagamento/${aula.id}`);
    } catch (e) {
      setErro(mensagemDeErro(e));
      if ((e as { codigo?: string }).codigo === 'horario_indisponivel') {
        setHorario(null);
        setPasso('quando');
        void horarios.refetch();
        chaveIdempotencia.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    } finally {
      setEnviando(false);
    }
  }

  if (instrutor.isLoading || dias.isLoading || !instrutor.data) return <Carregando />;
  const i = instrutor.data;

  if (passo === 'quando') {
    return (
      <Tela>
        <Texto tipo="titulo">{remarcar ? 'Escolha o novo horário' : 'Quando?'}</Texto>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {i.categorias.length > 1 && (
          <Coluna>
            <Texto negrito>Categoria da aula</Texto>
            <Linha>
              {i.categorias.map((c) => (
                <Chip
                  key={c}
                  rotulo={`Categoria ${c}`}
                  selecionado={categoria === c}
                  aoPressionar={() => setCategoria(c)}
                />
              ))}
            </Linha>
          </Coluna>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: espaco.sm }}
        >
          {dias.data?.dias.map((d) => {
            const p = partesData(d.data);
            const ativo = data === d.data;
            const vazio = d.quantidadeHorarios === 0;
            return (
              <Chip
                key={d.data}
                rotulo={`${p.semana} ${p.dia}/${p.mes}`}
                selecionado={ativo}
                aoPressionar={
                  vazio
                    ? undefined
                    : () => {
                        setData(d.data);
                        setHorario(null);
                      }
                }
              />
            );
          })}
        </ScrollView>
        {horarios.isLoading ? (
          <Carregando />
        ) : horarios.data?.length ? (
          <Linha style={{ flexWrap: 'wrap' }}>
            {horarios.data.map((h) => (
              <Chip
                key={h.inicio}
                rotulo={hora(h.inicio)}
                selecionado={horario?.inicio === h.inicio}
                aoPressionar={() => setHorario(h)}
              />
            ))}
          </Linha>
        ) : (
          <Texto tipo="suave">Sem horários livres neste dia. Escolha outra data.</Texto>
        )}
        {remarcar ? (
          <Botao
            titulo="Confirmar novo horário"
            desabilitado={!horario}
            carregando={enviando}
            aoPressionar={confirmarRemarcacao}
          />
        ) : (
          <Botao
            titulo="Continuar"
            desabilitado={!horario || !categoria}
            aoPressionar={() => setPasso('onde')}
          />
        )}
      </Tela>
    );
  }

  if (passo === 'onde') {
    return (
      <View style={{ flex: 1, backgroundColor: cores.fundo }}>
        {ponto ? (
          <MapView
            ref={mapa}
            style={{ flex: 1 }}
            userInterfaceStyle={escuro ? 'dark' : 'light'}
            showsUserLocation
            initialRegion={{
              latitude: ponto.lat,
              longitude: ponto.lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={async (e) => {
              const p = {
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              };
              setPonto(p);
              setEndereco(await enderecoDe(p));
            }}
          >
            <Marker
              draggable
              coordinate={{ latitude: ponto.lat, longitude: ponto.lng }}
              pinColor={cores.primaria}
              onDragEnd={async (e) => {
                const p = {
                  lat: e.nativeEvent.coordinate.latitude,
                  lng: e.nativeEvent.coordinate.longitude,
                };
                setPonto(p);
                setEndereco(await enderecoDe(p));
              }}
            />
          </MapView>
        ) : (
          <Carregando texto="Carregando mapa..." />
        )}
        <View
          style={{
            padding: espaco.lg,
            gap: espaco.md,
            backgroundColor: cores.superficie,
            borderTopLeftRadius: raio.lg,
            borderTopRightRadius: raio.lg,
          }}
        >
          <Texto tipo="subtitulo">Ponto de encontro</Texto>
          <Texto tipo="pequeno">
            Toque no mapa ou arraste o pino até o local onde o instrutor vai buscar você.
          </Texto>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Campo
            rotulo="Endereço"
            value={endereco}
            onChangeText={setEndereco}
            onSubmitEditing={buscarEndereco}
            returnKeyType="search"
          />
          <Campo
            rotulo="Referência (opcional)"
            value={referencia}
            onChangeText={setReferencia}
            placeholder="Ex.: em frente à padaria"
          />
          <Linha>
            <View style={{ flex: 1 }}>
              <Botao
                titulo="Voltar"
                variante="secundario"
                aoPressionar={() => setPasso('quando')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Botao
                titulo="Continuar"
                desabilitado={!ponto}
                aoPressionar={() => setPasso('resumo')}
              />
            </View>
          </Linha>
        </View>
      </View>
    );
  }

  const cfg = config.data;
  return (
    <Tela>
      <Texto tipo="titulo">Confira sua aula</Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Cartao>
        <Texto tipo="rotulo">Instrutor</Texto>
        <Texto negrito>{i.nome}</Texto>
        <Texto tipo="rotulo">Quando</Texto>
        <Texto>
          {horario &&
            `${dataCurta(horario.inicio)}, das ${hora(horario.inicio)} às ${fimDoHorario}`}
        </Texto>
        <Texto tipo="rotulo">Onde</Texto>
        <Texto>{endereco || 'Ponto marcado no mapa'}</Texto>
        {referencia ? <Texto tipo="suave">{referencia}</Texto> : null}
        <Texto tipo="rotulo">Categoria</Texto>
        <Texto>{categoria}</Texto>
      </Cartao>
      <Cartao>
        <Linha style={{ justifyContent: 'space-between' }}>
          <Texto>Aula avulsa</Texto>
          <Texto tipo="subtitulo" cor={cores.primaria}>
            {formatarCentavos(i.precoAulaCentavos)}
          </Texto>
        </Linha>
        <Texto tipo="pequeno">
          Pagamento via Pix. O valor fica guardado e só é repassado ao instrutor depois da aula.
        </Texto>
      </Cartao>
      {cfg && (
        <Aviso tipo="info" titulo="Regra de cancelamento">
          {`Cancelamento grátis até ${cfg.cancelamentoGratisAteHoras} horas antes da aula. Depois disso, há multa de ${cfg.cancelamentoMultaBp / 100}% do valor. Se o instrutor não aceitar ou cancelar, você recebe tudo de volta.`}
        </Aviso>
      )}
      <Botao
        titulo="Ir para o pagamento"
        icone="qr-code"
        carregando={enviando}
        aoPressionar={confirmar}
      />
      <Botao titulo="Voltar" variante="texto" aoPressionar={() => setPasso('onde')} />
    </Tela>
  );
}
