import type { AulaDetalhe, PreviaCancelamento } from '@volante/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { CompartilharAula, MapaAoVivo } from '../../src/componentes/Rastreamento';
import { StatusAula } from '../../src/componentes/StatusAula';
import {
  Aviso,
  Avatar,
  Botao,
  Cartao,
  Carregando,
  Coluna,
  Divisor,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { abrirConversa } from '../../src/servicos/comercial';
import { raio } from '../../src/tema/cores';
import { useTema } from '../../src/tema/TemaProvider';
import {
  dataCurta,
  dataHora,
  formatarCentavos,
  hora,
  NOMES_STATUS_AULA,
} from '../../src/util/formatos';
import { TempoAula } from '../../src/componentes/TempoAula';

export default function AulaAluno() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cores } = useTema();
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['aula', id],
    queryFn: () => api<AulaDetalhe>(`/aluno/aulas/${id}`),
    refetchInterval: (c) =>
      ['confirmada', 'a_caminho', 'em_andamento', 'solicitada'].includes(c.state.data?.status ?? '')
        ? 15000
        : false,
  });

  if (q.isLoading || !q.data) return <Carregando />;
  const a = q.data;

  async function executar(nome: string, fn: () => Promise<unknown>) {
    setErro(null);
    setAcao(nome);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ['aluno'] });
      await q.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setAcao(null);
    }
  }

  async function cancelar() {
    try {
      const p = await api<PreviaCancelamento>(`/aluno/aulas/${a.id}/cancelamento`);
      const mensagem = p.gratuito
        ? `O cancelamento é gratuito. Você recebe ${formatarCentavos(p.reembolsoCentavos)} de volta.`
        : `Como faltam menos horas que o permitido, há multa de ${formatarCentavos(p.multaCentavos)}. Você recebe ${formatarCentavos(p.reembolsoCentavos)} de volta.`;
      Alert.alert('Cancelar aula?', mensagem, [
        { text: 'Manter aula', style: 'cancel' },
        {
          text: 'Cancelar aula',
          style: 'destructive',
          onPress: () =>
            executar('cancelar', () =>
              api(`/aluno/aulas/${a.id}/cancelar`, {
                corpo: { motivo: 'Cancelada pelo aluno no app' },
              }),
            ),
        },
      ]);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  const ativa = ['solicitada', 'confirmada', 'a_caminho'].includes(a.status);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${a.pontoEncontro.lat},${a.pontoEncontro.lng}`;

  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Linha style={{ justifyContent: 'space-between' }}>
        <StatusAula status={a.status} />
        <Texto tipo="pequeno">{formatarCentavos(a.valorCentavos)}</Texto>
      </Linha>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {a.status === 'aguardando_pagamento' && (
        <Aviso tipo="alerta" titulo="Falta pagar">
          <Botao
            titulo="Pagar com Pix"
            compacto
            aoPressionar={() => router.push(`/pagamento/${a.id}`)}
          />
        </Aviso>
      )}
      {a.status === 'solicitada' && a.aceiteAte && (
        <Aviso tipo="info">{`Aguardando o instrutor confirmar (até ${dataHora(a.aceiteAte)}). Se ele não responder, você recebe o valor de volta.`}</Aviso>
      )}

      {['confirmada', 'a_caminho'].includes(a.status) && a.codigoCheckin && (
        <Cartao
          style={{
            alignItems: 'center',
            backgroundColor: cores.primariaSuave,
            borderColor: cores.primaria,
          }}
        >
          <Texto tipo="rotulo">Código de check-in</Texto>
          <Texto
            style={{ fontSize: 44, fontWeight: '800', letterSpacing: 12, color: cores.primaria }}
          >
            {a.codigoCheckin}
          </Texto>
          <Texto tipo="pequeno" centro>
            Mostre este código ao instrutor no início da aula. Não compartilhe antes do encontro.
          </Texto>
        </Cartao>
      )}

      {(a.status === 'a_caminho' || a.status === 'em_andamento') && <MapaAoVivo aulaId={a.id} />}

      <TempoAula aula={a} />

      {a.status === 'aguardando_confirmacao' && (
        <Aviso tipo="alerta" titulo="O instrutor finalizou a aula">
          <Coluna>
            <Texto>Confirme que a aula aconteceu para liberarmos o pagamento ao instrutor.</Texto>
            <Botao
              titulo="Confirmar fim da aula"
              compacto
              carregando={acao === 'confirmar'}
              aoPressionar={() =>
                executar('confirmar', () =>
                  api(`/aluno/aulas/${a.id}/confirmar-fim`, { metodo: 'POST' }),
                )
              }
            />
          </Coluna>
        </Aviso>
      )}

      {(a.status === 'aguardando_confirmacao' ||
        (a.status === 'confirmada' && new Date(a.fim) < new Date())) && (
        <Botao
          titulo="Relatar problema nesta aula"
          icone="alert-circle"
          variante="texto"
          aoPressionar={() => router.push(`/relatar/${a.id}?como=aluno`)}
        />
      )}

      {a.status === 'concluida' && !a.avaliada && (
        <Botao
          titulo="Avaliar esta aula"
          icone="star"
          variante="destaque"
          aoPressionar={() => router.push(`/avaliar/${a.id}`)}
        />
      )}

      <Cartao>
        <Linha gap={12}>
          <Avatar nome={a.instrutor.nome} arquivoId={a.instrutor.fotoArquivoId} publico />
          <Coluna gap={2} style={{ flex: 1 }}>
            <Texto negrito>{a.instrutor.nome}</Texto>
            <Texto tipo="suave">
              {dataCurta(a.inicio)} · {hora(a.inicio)}–{hora(a.fim)}
            </Texto>
            <Texto tipo="pequeno">Categoria {a.categoria}</Texto>
          </Coluna>
        </Linha>
        {a.veiculo && (
          <>
            <Divisor />
            <Texto>
              🚗 {a.veiculo.marca} {a.veiculo.modelo}
              {a.veiculo.cor ? ` · ${a.veiculo.cor}` : ''} ·{' '}
              {a.veiculo.cambio === 'automatico' ? 'automático' : 'manual'}
            </Texto>
          </>
        )}
      </Cartao>

      <Cartao>
        <Texto tipo="rotulo">Ponto de encontro</Texto>
        <Texto>{a.pontoEncontroEndereco}</Texto>
        {a.pontoEncontroReferencia && <Texto tipo="suave">{a.pontoEncontroReferencia}</Texto>}
        <Botao
          titulo="Abrir no mapa"
          compacto
          variante="secundario"
          icone="navigate"
          aoPressionar={() => Linking.openURL(mapsUrl)}
        />
      </Cartao>

      {(a.anotacao || a.evolucao.length > 0) && (
        <Cartao>
          <Texto tipo="rotulo">Anotações do instrutor</Texto>
          {a.anotacao && <Texto>{a.anotacao}</Texto>}
          {a.evolucao.map((e) => (
            <Linha key={e.habilidadeId} style={{ justifyContent: 'space-between' }}>
              <Texto>{e.habilidade}</Texto>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <View
                    key={n}
                    style={{
                      width: 14,
                      height: 8,
                      borderRadius: raio.sm,
                      backgroundColor: n <= e.nivel ? cores.primaria : cores.borda,
                    }}
                  />
                ))}
              </View>
            </Linha>
          ))}
        </Cartao>
      )}

      <Cartao>
        <Texto tipo="rotulo">Histórico</Texto>
        {a.historico.map((h, i) => (
          <Linha key={i} style={{ justifyContent: 'space-between' }}>
            <Texto>{NOMES_STATUS_AULA[h.paraStatus] ?? h.paraStatus}</Texto>
            <Texto tipo="pequeno">{dataHora(h.criadoEm)}</Texto>
          </Linha>
        ))}
        {a.motivoCancelamento && <Texto tipo="suave">Motivo: {a.motivoCancelamento}</Texto>}
        {a.multaCancelamentoCentavos > 0 && (
          <Texto tipo="suave">
            Multa aplicada: {formatarCentavos(a.multaCancelamentoCentavos)}
          </Texto>
        )}
      </Cartao>

      <Linha style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Botao
          titulo="Conversar com o instrutor"
          icone="chatbubbles"
          variante="texto"
          aoPressionar={() => abrirConversa({ instrutorId: a.instrutor.id })}
        />
        <Botao
          titulo="Denunciar"
          icone="flag"
          variante="texto"
          aoPressionar={() =>
            router.push(`/denunciar?alvoTipo=instrutor&alvoId=${a.instrutor.id}&aulaId=${a.id}`)
          }
        />
      </Linha>

      {['solicitada', 'confirmada', 'a_caminho', 'em_andamento'].includes(a.status) && (
        <CompartilharAula aulaId={a.id} />
      )}

      {ativa && (
        <Coluna>
          <Botao
            titulo="Remarcar"
            variante="secundario"
            icone="calendar"
            aoPressionar={() => router.push(`/agendar/${a.instrutor.id}?remarcar=${a.id}`)}
          />
          <Botao
            titulo="Cancelar aula"
            variante="perigo"
            carregando={acao === 'cancelar'}
            aoPressionar={cancelar}
          />
        </Coluna>
      )}
    </Tela>
  );
}
