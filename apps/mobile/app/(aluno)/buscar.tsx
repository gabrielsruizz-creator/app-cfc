import type { InstrutorCard } from '@volante/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Aviso,
  Avatar,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Chip,
  Coluna,
  Estrelas,
  Interruptor,
  Linha,
  Selo,
  Texto,
  Vazio,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';
import { espaco, raio } from '../../src/tema/cores';
import { useTema } from '../../src/tema/TemaProvider';
import {
  obterLocalizacao,
  PONTO_PADRAO,
  pontoDeEndereco,
  type Ponto,
} from '../../src/util/dispositivo';
import { formatarCentavos } from '../../src/util/formatos';

type Filtros = {
  categoria?: string;
  precoMaxCentavos?: number;
  notaMin?: number;
  genero?: string;
  cambio?: string;
  adaptadoPcd?: boolean;
  forneceVeiculo?: boolean;
  ordenar: 'distancia' | 'preco' | 'avaliacao';
};

function paraQuery(ponto: Ponto, f: Filtros) {
  const p = new URLSearchParams({
    lat: String(ponto.lat),
    lng: String(ponto.lng),
    ordenar: f.ordenar,
  });
  for (const [k, v] of Object.entries(f))
    if (v !== undefined && v !== false && k !== 'ordenar') p.set(k, String(v));
  return p.toString();
}

function CartaoInstrutor({ i }: { i: InstrutorCard }) {
  const { cores } = useTema();
  return (
    <Cartao
      aoPressionar={() => router.push(`/perfil-instrutor/${i.id}`)}
      rotuloAcessivel={`${i.nome}, ${formatarCentavos(i.precoAulaCentavos)} por aula, a ${i.distanciaKm} quilômetros`}
    >
      <Linha gap={12}>
        <Avatar nome={i.nome} arquivoId={i.fotoArquivoId} publico tamanho={56} />
        <Coluna gap={2} style={{ flex: 1 }}>
          <Texto negrito linhas={1}>
            {i.nome}
          </Texto>
          <Linha gap={6}>
            <Estrelas nota={i.notaMedia ?? 0} tamanho={14} />
            <Texto tipo="pequeno">
              {i.totalAvaliacoes ? `${i.notaMedia?.toFixed(1)} (${i.totalAvaliacoes})` : 'Novo'}
            </Texto>
          </Linha>
          <Texto tipo="pequeno">
            {i.distanciaKm.toLocaleString('pt-BR')} km ·{' '}
            {i.anosExperiencia ? `${i.anosExperiencia} anos de experiência` : 'Instrutor'}
          </Texto>
        </Coluna>
        <Coluna gap={0} style={{ alignItems: 'flex-end' }}>
          <Texto negrito cor={cores.primaria}>
            {formatarCentavos(i.precoAulaCentavos)}
          </Texto>
          <Texto tipo="pequeno">/ {i.duracaoAulaMin} min</Texto>
        </Coluna>
      </Linha>
      <Linha style={{ flexWrap: 'wrap' }} gap={6}>
        {i.credencialVerificada && <Selo texto="Credencial verificada" icone="shield-checkmark" />}
        {i.categorias.map((c) => (
          <Selo key={c} texto={`Cat. ${c}`} cor={cores.texto} fundo={cores.superficieAlt} />
        ))}
        {i.cambios.includes('automatico') && (
          <Selo texto="Automático" cor={cores.texto} fundo={cores.superficieAlt} />
        )}
        {i.adaptadoPcd && (
          <Selo
            texto="Adaptado PcD"
            icone="accessibility"
            cor={cores.texto}
            fundo={cores.superficieAlt}
          />
        )}
        {!i.forneceVeiculo && (
          <Selo texto="Usa seu veículo" cor={cores.alerta} fundo={cores.alertaSuave} />
        )}
      </Linha>
    </Cartao>
  );
}

export default function Buscar() {
  const { cores, escuro } = useTema();
  const { eu } = useAuth();
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [visao, setVisao] = useState<'mapa' | 'lista'>('lista');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>({
    ordenar: 'distancia',
    categoria: eu?.aluno?.categoriaDesejada === 'AB' ? 'B' : eu?.aluno?.categoriaDesejada,
  });
  const [rascunho, setRascunho] = useState<Filtros>(filtros);
  const [semLocalizacao, setSemLocalizacao] = useState(false);
  const [regiao, setRegiao] = useState('');
  const [regiaoEscolhida, setRegiaoEscolhida] = useState<string | null>(null);
  const [erroRegiao, setErroRegiao] = useState<string | null>(null);

  async function buscarRegiao() {
    if (!regiao.trim()) return;
    setErroRegiao(null);
    const p = await pontoDeEndereco(regiao);
    if (!p) return setErroRegiao('Endereço não encontrado. Tente incluir a cidade.');
    setPonto(p);
    setRegiaoEscolhida(regiao.trim());
  }

  async function usarMinhaLocalizacao() {
    const p = await obterLocalizacao({ exigir: true });
    if (!p) return;
    setPonto(p);
    setRegiaoEscolhida(null);
    setRegiao('');
    setSemLocalizacao(false);
  }

  useEffect(() => {
    obterLocalizacao().then((p) => {
      if (!p) setSemLocalizacao(true);
      setPonto(p ?? PONTO_PADRAO);
    });
  }, []);

  const q = useQuery({
    queryKey: ['busca-instrutores', ponto, filtros],
    queryFn: () => api<InstrutorCard[]>(`/publico/instrutores?${paraQuery(ponto!, filtros)}`),
    enabled: !!ponto,
  });

  const quantidadeFiltros = useMemo(
    () =>
      Object.entries(filtros).filter(([k, v]) => k !== 'ordenar' && v !== undefined && v !== false)
        .length,
    [filtros],
  );

  if (!ponto) return <Carregando texto="Buscando sua localização..." />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: cores.fundo }}>
      <View style={{ padding: espaco.lg, gap: espaco.md }}>
        <Texto tipo="titulo">
          {regiaoEscolhida
            ? `Instrutores perto de ${regiaoEscolhida}`
            : 'Instrutores perto de você'}
        </Texto>
        {semLocalizacao && !regiaoEscolhida && (
          <Texto tipo="pequeno">
            Localização não liberada — mostrando a região central de São Paulo.
          </Texto>
        )}
        <Linha>
          <View style={{ flex: 1 }}>
            <Campo
              rotulo="Buscar em outra região"
              value={regiao}
              onChangeText={setRegiao}
              onSubmitEditing={buscarRegiao}
              returnKeyType="search"
              placeholder="Ex.: Av. Paulista, São Paulo"
              erro={erroRegiao ?? undefined}
            />
          </View>
        </Linha>
        {regiaoEscolhida && (
          <Chip
            rotulo="Usar minha localização"
            icone="locate"
            aoPressionar={usarMinhaLocalizacao}
          />
        )}
        <Linha>
          <Chip
            rotulo="Lista"
            icone="list"
            selecionado={visao === 'lista'}
            aoPressionar={() => setVisao('lista')}
          />
          <Chip
            rotulo="Mapa"
            icone="map"
            selecionado={visao === 'mapa'}
            aoPressionar={() => setVisao('mapa')}
          />
          <View style={{ flex: 1 }} />
          <Chip
            rotulo={quantidadeFiltros ? `Filtros (${quantidadeFiltros})` : 'Filtros'}
            icone="options"
            selecionado={quantidadeFiltros > 0}
            aoPressionar={() => {
              setRascunho(filtros);
              setMostrarFiltros(true);
            }}
          />
        </Linha>
      </View>

      {q.isLoading ? (
        <Carregando />
      ) : q.isError ? (
        <View style={{ padding: espaco.lg, gap: espaco.md }}>
          <Aviso tipo="erro" titulo="Não foi possível buscar instrutores">
            {mensagemDeErro(q.error)}
          </Aviso>
          <Botao
            titulo="Tentar de novo"
            variante="secundario"
            aoPressionar={() => void q.refetch()}
          />
        </View>
      ) : visao === 'mapa' ? (
        <MapView
          style={{ flex: 1 }}
          userInterfaceStyle={escuro ? 'dark' : 'light'}
          showsUserLocation
          initialRegion={{
            latitude: ponto.lat,
            longitude: ponto.lng,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
        >
          {q.data?.map((i) => (
            <Marker
              key={i.id}
              coordinate={{ latitude: i.posicaoAproximada.lat, longitude: i.posicaoAproximada.lng }}
              title={i.nome}
              description={`${formatarCentavos(i.precoAulaCentavos)} · toque para ver o perfil`}
              pinColor={cores.primaria}
              onCalloutPress={() => router.push(`/perfil-instrutor/${i.id}`)}
            />
          ))}
        </MapView>
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{
            padding: espaco.lg,
            paddingTop: 0,
            gap: espaco.md,
            paddingBottom: espaco.xxl,
          }}
          renderItem={({ item }) => <CartaoInstrutor i={item} />}
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          ListEmptyComponent={
            <Vazio
              icone="search"
              titulo="Nenhum instrutor encontrado"
              texto="Tente remover alguns filtros ou buscar em outra região."
            />
          }
        />
      )}

      <Modal
        visible={mostrarFiltros}
        animationType="slide"
        transparent
        onRequestClose={() => setMostrarFiltros(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: '#0008' }}
          onPress={() => setMostrarFiltros(false)}
          accessibilityLabel="Fechar filtros"
        />
        <ScrollView
          style={{
            backgroundColor: cores.superficie,
            borderTopLeftRadius: raio.lg,
            borderTopRightRadius: raio.lg,
            maxHeight: '85%',
          }}
          contentContainerStyle={{ padding: espaco.lg, gap: espaco.lg }}
        >
          <Linha style={{ justifyContent: 'space-between' }}>
            <Texto tipo="subtitulo">Filtros</Texto>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={() => setMostrarFiltros(false)}
            >
              <Ionicons name="close" size={26} color={cores.texto} />
            </Pressable>
          </Linha>
          <Coluna>
            <Texto negrito>Categoria</Texto>
            <Linha style={{ flexWrap: 'wrap' }}>
              {['A', 'B', 'C', 'D', 'E'].map((c) => (
                <Chip
                  key={c}
                  rotulo={c}
                  selecionado={rascunho.categoria === c}
                  aoPressionar={() =>
                    setRascunho({
                      ...rascunho,
                      categoria: rascunho.categoria === c ? undefined : c,
                    })
                  }
                />
              ))}
            </Linha>
          </Coluna>
          <Coluna>
            <Texto negrito>Preço máximo por aula</Texto>
            <Linha style={{ flexWrap: 'wrap' }}>
              {[8000, 10000, 12000, 15000].map((v) => (
                <Chip
                  key={v}
                  rotulo={`até ${formatarCentavos(v)}`}
                  selecionado={rascunho.precoMaxCentavos === v}
                  aoPressionar={() =>
                    setRascunho({
                      ...rascunho,
                      precoMaxCentavos: rascunho.precoMaxCentavos === v ? undefined : v,
                    })
                  }
                />
              ))}
            </Linha>
          </Coluna>
          <Coluna>
            <Texto negrito>Avaliação mínima</Texto>
            <Linha>
              {[4, 4.5].map((v) => (
                <Chip
                  key={v}
                  rotulo={`${v}+ ★`}
                  selecionado={rascunho.notaMin === v}
                  aoPressionar={() =>
                    setRascunho({ ...rascunho, notaMin: rascunho.notaMin === v ? undefined : v })
                  }
                />
              ))}
            </Linha>
          </Coluna>
          <Coluna>
            <Texto negrito>Gênero do instrutor</Texto>
            <Linha>
              {[
                ['feminino', 'Mulher'],
                ['masculino', 'Homem'],
              ].map(([v, r]) => (
                <Chip
                  key={v}
                  rotulo={r!}
                  selecionado={rascunho.genero === v}
                  aoPressionar={() =>
                    setRascunho({ ...rascunho, genero: rascunho.genero === v ? undefined : v })
                  }
                />
              ))}
            </Linha>
          </Coluna>
          <Coluna>
            <Texto negrito>Câmbio</Texto>
            <Linha>
              {[
                ['manual', 'Manual'],
                ['automatico', 'Automático'],
              ].map(([v, r]) => (
                <Chip
                  key={v}
                  rotulo={r!}
                  selecionado={rascunho.cambio === v}
                  aoPressionar={() =>
                    setRascunho({ ...rascunho, cambio: rascunho.cambio === v ? undefined : v })
                  }
                />
              ))}
            </Linha>
          </Coluna>
          <Interruptor
            rotulo="Carro adaptado (PcD)"
            ligado={!!rascunho.adaptadoPcd}
            aoMudar={(v) => setRascunho({ ...rascunho, adaptadoPcd: v })}
          />
          <Interruptor
            rotulo="Instrutor fornece o veículo"
            ligado={!!rascunho.forneceVeiculo}
            aoMudar={(v) => setRascunho({ ...rascunho, forneceVeiculo: v })}
          />
          <Coluna>
            <Texto negrito>Ordenar por</Texto>
            <Linha>
              {(
                [
                  ['distancia', 'Distância'],
                  ['preco', 'Menor preço'],
                  ['avaliacao', 'Avaliação'],
                ] as const
              ).map(([v, r]) => (
                <Chip
                  key={v}
                  rotulo={r}
                  selecionado={rascunho.ordenar === v}
                  aoPressionar={() => setRascunho({ ...rascunho, ordenar: v })}
                />
              ))}
            </Linha>
          </Coluna>
          <Linha>
            <View style={{ flex: 1 }}>
              <Botao
                titulo="Limpar"
                variante="secundario"
                aoPressionar={() => setRascunho({ ordenar: 'distancia' })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Botao
                titulo="Aplicar"
                aoPressionar={() => {
                  setFiltros(rascunho);
                  setMostrarFiltros(false);
                }}
              />
            </View>
          </Linha>
        </ScrollView>
      </Modal>
    </SafeAreaView>
  );
}
