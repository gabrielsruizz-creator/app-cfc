import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  Chip,
  Coluna,
  Interruptor,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { usePerfilInstrutor } from '../../src/servicos/instrutor';
import { raio } from '../../src/tema/cores';
import { useTema } from '../../src/tema/TemaProvider';
import { obterLocalizacao, PONTO_PADRAO, type Ponto } from '../../src/util/dispositivo';

export default function Atendimento() {
  const { cores, escuro } = useTema();
  const queryClient = useQueryClient();
  const q = usePerfilInstrutor();
  const [preco, setPreco] = useState('');
  const [duracao, setDuracao] = useState(50);
  const [raioKm, setRaioKm] = useState(10);
  const [base, setBase] = useState<Ponto | null>(null);
  const [forneceVeiculo, setForneceVeiculo] = useState(true);
  const [aceitaVeiculoAluno, setAceitaVeiculoAluno] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const p = q.data;
    if (!p) return;
    if (p.precoAulaCentavos) setPreco((p.precoAulaCentavos / 100).toFixed(2).replace('.', ','));
    setDuracao(p.duracaoAulaMin);
    if (p.raioAtendimentoKm) setRaioKm(p.raioAtendimentoKm);
    setForneceVeiculo(p.forneceVeiculo);
    setAceitaVeiculoAluno(p.aceitaVeiculoAluno);
    if (p.baseLocalizacao) setBase(p.baseLocalizacao);
    else obterLocalizacao().then((l) => setBase(l ?? PONTO_PADRAO));
  }, [q.data]);

  async function salvar() {
    setErro(null);
    const centavos = Math.round(Number(preco.replace(/\./g, '').replace(',', '.')) * 100);
    if (!centavos || !base) return setErro('Informe o preço e a região de atendimento.');
    setSalvando(true);
    try {
      await api('/instrutor/atendimento', {
        metodo: 'PUT',
        corpo: {
          precoAulaCentavos: centavos,
          duracaoAulaMin: duracao,
          raioAtendimentoKm: raioKm,
          baseLocalizacao: base,
          forneceVeiculo,
          aceitaVeiculoAluno,
          fusoHorario: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['instrutor'] });
      router.back();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (q.isLoading || !base) return <Carregando />;
  return (
    <Tela>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Campo
        rotulo="Preço por aula (R$)"
        value={preco}
        onChangeText={(v) => setPreco(v.replace(/[^\d,]/g, ''))}
        keyboardType="decimal-pad"
        placeholder="Ex.: 90,00"
        ajuda="A comissão da plataforma é descontada na liberação do valor."
      />
      <Coluna>
        <Texto negrito>Duração da aula</Texto>
        <Linha>
          {[50, 60, 90].map((d) => (
            <Chip
              key={d}
              rotulo={`${d} min`}
              selecionado={duracao === d}
              aoPressionar={() => setDuracao(d)}
            />
          ))}
        </Linha>
      </Coluna>
      <Coluna>
        <Texto negrito>Região de atendimento</Texto>
        <Texto tipo="pequeno">
          Toque no mapa para marcar o centro da sua região. Sua localização exata nunca é mostrada
          aos alunos.
        </Texto>
        <View style={{ height: 260, borderRadius: raio.lg, overflow: 'hidden' }}>
          <MapView
            style={{ flex: 1 }}
            userInterfaceStyle={escuro ? 'dark' : 'light'}
            initialRegion={{
              latitude: base.lat,
              longitude: base.lng,
              latitudeDelta: 0.2,
              longitudeDelta: 0.2,
            }}
            onPress={(e) =>
              setBase({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              })
            }
          >
            <Marker
              coordinate={{ latitude: base.lat, longitude: base.lng }}
              pinColor={cores.primaria}
            />
            <Circle
              center={{ latitude: base.lat, longitude: base.lng }}
              radius={raioKm * 1000}
              strokeColor={cores.primaria}
              fillColor={`${cores.primaria}22`}
            />
          </MapView>
        </View>
        <Linha style={{ flexWrap: 'wrap' }}>
          {[5, 10, 15, 20, 30].map((r) => (
            <Chip
              key={r}
              rotulo={`${r} km`}
              selecionado={raioKm === r}
              aoPressionar={() => setRaioKm(r)}
            />
          ))}
        </Linha>
      </Coluna>
      <Interruptor
        rotulo="Eu forneço o veículo"
        ligado={forneceVeiculo}
        aoMudar={setForneceVeiculo}
      />
      <Interruptor
        rotulo="Aceito dar aula no veículo do aluno"
        ligado={aceitaVeiculoAluno}
        aoMudar={setAceitaVeiculoAluno}
      />
      <Botao titulo="Salvar" carregando={salvando} aoPressionar={salvar} />
    </Tela>
  );
}
