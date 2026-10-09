import type { AulaDetalhe, Habilidade } from '@volante/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { StatusAula } from '../../../src/componentes/StatusAula';
import {
  Aviso,
  Avatar,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Chip,
  Coluna,
  Interruptor,
  Linha,
  Tela,
  Texto,
} from '../../../src/componentes/ui';
import { api, mensagemDeErro } from '../../../src/servicos/api';
import { useEnvioPosicao } from '../../../src/servicos/posicao';
import { abrirConversa } from '../../../src/servicos/comercial';
import { obterLocalizacao } from '../../../src/util/dispositivo';
import { dataHora, formatarCentavos, hora } from '../../../src/util/formatos';
import { TempoAula } from '../../../src/componentes/TempoAula';

function FormEvolucao({ aula, aoSalvar }: { aula: AulaDetalhe; aoSalvar: () => void }) {
  const habilidades = useQuery({
    queryKey: ['habilidades'],
    queryFn: () => api<Habilidade[]>('/publico/habilidades'),
  });
  const [niveis, setNiveis] = useState<Record<string, number>>({});
  const [anotacao, setAnotacao] = useState(aula.anotacao ?? '');
  const [visivel, setVisivel] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    setNiveis(Object.fromEntries(aula.evolucao.map((e) => [e.habilidadeId, e.nivel])));
  }, [aula.evolucao]);

  const daCategoria = (habilidades.data ?? []).filter((h) =>
    h.categorias.some((c) => aula.categoria.includes(c)),
  );

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      await api(`/instrutor/aulas/${aula.id}/evolucao`, {
        metodo: 'PUT',
        corpo: {
          registros: Object.entries(niveis).map(([habilidadeId, nivel]) => ({
            habilidadeId,
            nivel,
          })),
          anotacao: anotacao.trim() || undefined,
          anotacaoVisivelAluno: visivel,
        },
      });
      setMsg({ tipo: 'sucesso', texto: 'Evolução salva.' });
      aoSalvar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao>
      <Texto tipo="subtitulo">Evolução do aluno</Texto>
      <Texto tipo="pequeno">De 1 (iniciando) a 5 (dominado).</Texto>
      {daCategoria.map((h) => (
        <Coluna key={h.id} gap={4}>
          <Texto>{h.nome}</Texto>
          <Linha gap={6}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip
                key={n}
                rotulo={String(n)}
                selecionado={niveis[h.id] === n}
                aoPressionar={() => setNiveis({ ...niveis, [h.id]: n })}
              />
            ))}
          </Linha>
        </Coluna>
      ))}
      <Campo
        rotulo="Anotações da aula"
        value={anotacao}
        onChangeText={setAnotacao}
        multiline
        style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
      />
      <Interruptor rotulo="Mostrar anotação ao aluno" ligado={visivel} aoMudar={setVisivel} />
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <Botao titulo="Salvar evolução" compacto carregando={salvando} aoPressionar={salvar} />
    </Cartao>
  );
}

export default function AulaInstrutor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['instrutor', 'aula', id],
    queryFn: () => api<AulaDetalhe>(`/instrutor/aulas/${id}`),
  });
  const rastreando = q.data?.status === 'a_caminho' || q.data?.status === 'em_andamento';
  const envio = useEnvioPosicao(id, rastreando);

  if (q.isLoading || !q.data) return <Carregando />;
  const a = q.data;

  async function executar(nome: string, fn: () => Promise<unknown>) {
    setErro(null);
    setAcao(nome);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ['instrutor'] });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setAcao(null);
    }
  }

  async function comLocal(nome: string, rota: string, extra: Record<string, unknown> = {}) {
    await executar(nome, async () => {
      const local = await obterLocalizacao({ exigir: true });
      if (!local) throw new Error('Localização indisponível');
      await api(`/instrutor/aulas/${a.id}/${rota}`, { corpo: { ...extra, local } });
    });
  }

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${a.pontoEncontro.lat},${a.pontoEncontro.lng}`;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Linha style={{ justifyContent: 'space-between' }}>
        <StatusAula status={a.status} />
        <Texto negrito>{formatarCentavos(a.valorCentavos)}</Texto>
      </Linha>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Cartao>
        <Linha gap={12}>
          <Avatar nome={a.aluno.nome} arquivoId={a.aluno.fotoArquivoId} tamanho={72} />
          <Coluna gap={2} style={{ flex: 1 }}>
            <Texto negrito>{a.aluno.nome}</Texto>
            <Texto tipo="suave">
              {dataHora(a.inicio)} – {hora(a.fim)}
            </Texto>
            <Texto tipo="pequeno">Categoria {a.categoria}</Texto>
          </Coluna>
        </Linha>
        <Linha style={{ flexWrap: 'wrap' }}>
          <Botao
            titulo="Ficha do aluno"
            compacto
            variante="texto"
            aoPressionar={() => router.push(`/area-instrutor/aluno/${a.aluno.id}`)}
          />
          <Botao
            titulo="Mensagem"
            icone="chatbubbles"
            compacto
            variante="texto"
            aoPressionar={() => abrirConversa({ alunoId: a.aluno.id }, 'instrutor')}
          />
        </Linha>
      </Cartao>
      <Cartao>
        <Texto tipo="rotulo">Ponto de encontro</Texto>
        <Texto>{a.pontoEncontroEndereco}</Texto>
        {a.pontoEncontroReferencia && <Texto tipo="suave">{a.pontoEncontroReferencia}</Texto>}
        <Botao
          titulo="Abrir rota no mapa"
          compacto
          variante="secundario"
          icone="navigate"
          aoPressionar={() => Linking.openURL(mapsUrl)}
        />
      </Cartao>

      {a.status === 'solicitada' && (
        <Linha>
          <Coluna style={{ flex: 1 }}>
            <Botao
              titulo="Recusar"
              variante="perigo"
              aoPressionar={() =>
                Alert.alert('Recusar aula?', 'O aluno recebe o valor de volta.', [
                  { text: 'Voltar', style: 'cancel' },
                  {
                    text: 'Recusar',
                    style: 'destructive',
                    onPress: () =>
                      executar('recusar', () =>
                        api(`/instrutor/aulas/${a.id}/recusar`, {
                          corpo: { motivo: 'Recusada pelo instrutor' },
                        }),
                      ),
                  },
                ])
              }
            />
          </Coluna>
          <Coluna style={{ flex: 1 }}>
            <Botao
              titulo="Aceitar"
              carregando={acao === 'aceitar'}
              aoPressionar={() =>
                executar('aceitar', () =>
                  api(`/instrutor/aulas/${a.id}/aceitar`, { metodo: 'POST' }),
                )
              }
            />
          </Coluna>
        </Linha>
      )}

      {a.status === 'confirmada' && new Date(a.inicio).getTime() - Date.now() <= 3 * 3600_000 && (
        <Botao
          titulo="Estou a caminho"
          icone="navigate"
          variante="secundario"
          carregando={acao === 'a-caminho'}
          aoPressionar={() =>
            executar('a-caminho', async () => {
              const local = await obterLocalizacao({ exigir: true });
              await api(`/instrutor/aulas/${a.id}/a-caminho`, {
                corpo: local ? { posicao: local } : {},
              });
              await q.refetch();
            })
          }
        />
      )}

      {rastreando && (
        <Aviso
          tipo={envio === 'sem_permissao' ? 'alerta' : 'info'}
          titulo={envio === 'sem_permissao' ? 'Localização desligada' : 'Localização compartilhada'}
        >
          {envio === 'sem_permissao'
            ? 'Permita o acesso à localização para o aluno acompanhar sua chegada.'
            : 'O aluno (e quem ele escolher) vê sua posição enquanto esta tela estiver aberta, até o check-out.'}
        </Aviso>
      )}

      {['confirmada', 'a_caminho'].includes(a.status) && (
        <Cartao>
          <Texto tipo="subtitulo">Check-in</Texto>
          <Texto tipo="suave">
            No ponto de encontro, peça ao aluno o código de 4 dígitos que aparece no app dele.
          </Texto>
          <Campo
            rotulo="Código do aluno"
            value={codigo}
            onChangeText={(v) => setCodigo(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            style={{ fontSize: 28, letterSpacing: 10, textAlign: 'center' }}
          />
          <Botao
            titulo="Iniciar aula"
            icone="play"
            desabilitado={codigo.length !== 4}
            carregando={acao === 'checkin'}
            aoPressionar={() => comLocal('checkin', 'checkin', { codigo })}
          />
        </Cartao>
      )}

      {a.status === 'em_andamento' && (
        <Cartao>
          <Texto tipo="subtitulo">Aula em andamento</Texto>
          <Texto tipo="suave">
            Iniciada às {a.checkinEm ? hora(a.checkinEm) : '--'}. Ao terminar, faça o check-out.
          </Texto>
          <Botao
            titulo="Finalizar aula (check-out)"
            icone="stop"
            variante="destaque"
            carregando={acao === 'checkout'}
            aoPressionar={() => comLocal('checkout', 'checkout')}
          />
        </Cartao>
      )}
      <TempoAula aula={a} />

      {a.status === 'aguardando_confirmacao' && (
        <Aviso tipo="info">
          Aguardando o aluno confirmar o fim da aula. Se ele não responder em 24 h, a confirmação é
          automática.
        </Aviso>
      )}
      {(a.status === 'aguardando_confirmacao' ||
        (a.status === 'confirmada' && new Date(a.fim) < new Date())) && (
        <Botao
          titulo="Relatar problema (ex.: aluno não compareceu)"
          icone="alert-circle"
          variante="texto"
          aoPressionar={() => router.push(`/relatar/${a.id}?como=instrutor`)}
        />
      )}
      {a.status === 'concluida' && (
        <Aviso tipo="sucesso">
          Aula concluída. O valor foi liberado para você (menos a comissão).
        </Aviso>
      )}

      {['em_andamento', 'aguardando_confirmacao', 'concluida'].includes(a.status) && (
        <FormEvolucao aula={a} aoSalvar={() => void q.refetch()} />
      )}

      {['confirmada', 'a_caminho'].includes(a.status) && (
        <Botao
          titulo="Cancelar aula"
          variante="perigo"
          aoPressionar={() =>
            Alert.alert(
              'Cancelar aula?',
              'O aluno recebe o valor integral de volta. Cancelamentos frequentes afetam sua reputação.',
              [
                { text: 'Voltar', style: 'cancel' },
                {
                  text: 'Cancelar aula',
                  style: 'destructive',
                  onPress: () =>
                    executar('cancelar', () =>
                      api(`/instrutor/aulas/${a.id}/cancelar`, {
                        corpo: { motivo: 'Cancelada pelo instrutor' },
                      }),
                    ),
                },
              ],
            )
          }
        />
      )}
    </Tela>
  );
}
