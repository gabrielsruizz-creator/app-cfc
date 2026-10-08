import type { AutoescolaCard } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  Campo,
  Coluna,
  Estrelas,
  Linha,
  Tela,
  Texto,
  Vazio,
} from '../../src/componentes/ui';
import { api, fonteArquivo, mensagemDeErro } from '../../src/servicos/api';
import { raio } from '../../src/tema/cores';
import { useTema } from '../../src/tema/TemaProvider';
import {
  obterLocalizacao,
  PONTO_PADRAO,
  pontoDeEndereco,
  type Ponto,
} from '../../src/util/dispositivo';
import { formatarCentavos } from '../../src/util/formatos';

/** Vitrine de autoescolas perto do aluno. */
export default function Autoescolas() {
  const { cores } = useTema();
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [regiao, setRegiao] = useState('');
  const [regiaoEscolhida, setRegiaoEscolhida] = useState<string | null>(null);
  const [erroRegiao, setErroRegiao] = useState<string | null>(null);

  useEffect(() => {
    obterLocalizacao().then((p) => setPonto(p ?? PONTO_PADRAO));
  }, []);

  const q = useQuery({
    queryKey: ['autoescolas', ponto],
    queryFn: () =>
      api<AutoescolaCard[]>(`/publico/autoescolas?lat=${ponto!.lat}&lng=${ponto!.lng}&raioKm=60`),
    enabled: !!ponto,
  });

  async function buscarRegiao() {
    setErroRegiao(null);
    const p = await pontoDeEndereco(regiao);
    if (!p) {
      setErroRegiao('Não encontramos esse lugar. Tente "cidade, UF".');
      return;
    }
    setPonto(p);
    setRegiaoEscolhida(regiao.trim());
  }

  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Texto tipo="suave">
        {regiaoEscolhida ? `Autoescolas perto de ${regiaoEscolhida}` : 'Autoescolas perto de você'}
      </Texto>
      <Linha>
        <View style={{ flex: 1 }}>
          <Campo
            rotulo="Buscar em outra região"
            placeholder="Ex.: Caraguatatuba, SP"
            value={regiao}
            onChangeText={setRegiao}
            returnKeyType="search"
            onSubmitEditing={buscarRegiao}
            erro={erroRegiao ?? undefined}
          />
        </View>
      </Linha>
      {regiao.trim() ? (
        <Botao titulo="Buscar" compacto variante="secundario" aoPressionar={buscarRegiao} />
      ) : null}

      {!ponto || q.isLoading ? (
        <Carregando texto="Procurando autoescolas..." />
      ) : q.isError ? (
        <Aviso tipo="erro" titulo="Não foi possível buscar">
          {mensagemDeErro(q.error)}
        </Aviso>
      ) : !q.data?.length ? (
        <Vazio
          icone="business-outline"
          titulo="Nenhuma autoescola por aqui ainda"
          texto="Tente buscar em outra região. Enquanto isso, você pode agendar aulas com instrutores autônomos."
        />
      ) : (
        <Coluna gap={12}>
          {q.data.map((a) => (
            <Cartao
              key={a.id}
              aoPressionar={() => router.push(`/autoescola/${a.id}`)}
              rotuloAcessivel={`${a.nomeFantasia}, a ${a.distanciaKm.toFixed(1)} quilômetros`}
            >
              {a.fotoCapaArquivoId && (
                <Image
                  source={fonteArquivo(a.fotoCapaArquivoId, true)}
                  style={{
                    height: 140,
                    borderRadius: raio.md,
                    backgroundColor: cores.superficieAlt,
                  }}
                  accessibilityIgnoresInvertColors
                />
              )}
              <Linha style={{ justifyContent: 'space-between' }}>
                <Texto tipo="subtitulo" style={{ flex: 1 }}>
                  {a.nomeFantasia}
                </Texto>
                <Texto tipo="pequeno">{a.distanciaKm.toFixed(1)} km</Texto>
              </Linha>
              <Texto tipo="suave">
                {a.bairro} · {a.municipio}/{a.uf}
              </Texto>
              <Linha style={{ justifyContent: 'space-between' }}>
                <Linha>
                  <Estrelas nota={a.notaMedia ?? 0} tamanho={14} />
                  <Texto tipo="pequeno">
                    {a.totalAvaliacoes
                      ? `${a.notaMedia?.toFixed(1)} (${a.totalAvaliacoes})`
                      : 'Nova'}
                  </Texto>
                </Linha>
                {a.aPartirDeCentavos !== null && (
                  <Texto tipo="pequeno" cor={cores.primaria} negrito>
                    Pacotes a partir de {formatarCentavos(a.aPartirDeCentavos)}
                  </Texto>
                )}
              </Linha>
            </Cartao>
          ))}
        </Coluna>
      )}
    </Tela>
  );
}
