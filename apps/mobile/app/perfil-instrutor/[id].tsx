import type { Pacote, PerfilInstrutorPublico } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import {
  Avatar,
  Botao,
  Cartao,
  Carregando,
  Coluna,
  Divisor,
  Estrelas,
  Linha,
  Selo,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';
import { comprarPacote } from '../../src/servicos/comercial';
import { useTema } from '../../src/tema/TemaProvider';
import { dataCurta, formatarCentavos } from '../../src/util/formatos';

export default function PerfilInstrutor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cores } = useTema();
  const { eu } = useAuth();
  const q = useQuery({
    queryKey: ['instrutor', id],
    queryFn: () => api<PerfilInstrutorPublico>(`/publico/instrutores/${id}`),
  });
  const pacotes = useQuery({
    queryKey: ['instrutor', id, 'pacotes'],
    queryFn: () => api<Pacote[]>(`/publico/instrutores/${id}/pacotes`),
  });
  if (q.isLoading || !q.data) return <Carregando />;
  const i = q.data;
  return (
    <View style={{ flex: 1 }}>
      <Tela>
        <Coluna gap={12} style={{ alignItems: 'center' }}>
          <Avatar nome={i.nome} arquivoId={i.fotoArquivoId} publico tamanho={104} />
          <Texto tipo="titulo" centro>
            {i.nome}
          </Texto>
          <Selo texto="Credencial DETRAN verificada" icone="shield-checkmark" />
          <Linha>
            <Estrelas nota={i.notaMedia ?? 0} />
            <Texto tipo="suave">
              {i.totalAvaliacoes
                ? `${i.notaMedia?.toFixed(1)} · ${i.totalAvaliacoes} avaliações`
                : 'Ainda sem avaliações'}
            </Texto>
          </Linha>
        </Coluna>
        <Linha gap={12}>
          <Cartao style={{ flex: 1, alignItems: 'center' }}>
            <Texto tipo="rotulo">Aula</Texto>
            <Texto tipo="subtitulo" cor={cores.primaria}>
              {formatarCentavos(i.precoAulaCentavos)}
            </Texto>
            <Texto tipo="pequeno">{i.duracaoAulaMin} minutos</Texto>
          </Cartao>
          <Cartao style={{ flex: 1, alignItems: 'center' }}>
            <Texto tipo="rotulo">Experiência</Texto>
            <Texto tipo="subtitulo">{i.anosExperiencia ?? '—'} anos</Texto>
            <Texto tipo="pequeno">{i.totalAulas} aulas no app</Texto>
          </Cartao>
        </Linha>
        {i.bio && (
          <Coluna>
            <Texto tipo="subtitulo">Sobre</Texto>
            <Texto>{i.bio}</Texto>
          </Coluna>
        )}
        <Coluna>
          <Texto tipo="subtitulo">Categorias</Texto>
          <Linha style={{ flexWrap: 'wrap' }}>
            {i.categorias.map((c) => (
              <Selo key={c} texto={`Categoria ${c}`} />
            ))}
          </Linha>
        </Coluna>
        <Coluna>
          <Texto tipo="subtitulo">Veículo</Texto>
          {i.forneceVeiculo && i.veiculos.length ? (
            i.veiculos.map((v) => (
              <Cartao key={v.id}>
                <Texto negrito>
                  {v.marca} {v.modelo} {v.ano}
                </Texto>
                <Texto tipo="suave">
                  {v.cambio === 'automatico' ? 'Câmbio automático' : 'Câmbio manual'}
                  {v.cor ? ` · ${v.cor}` : ''}
                </Texto>
                {v.adaptadoPcd && (
                  <Selo
                    texto={`Adaptado PcD${v.adaptacoes ? `: ${v.adaptacoes}` : ''}`}
                    icone="accessibility"
                  />
                )}
              </Cartao>
            ))
          ) : (
            <Texto tipo="suave">As aulas são feitas no veículo do aluno.</Texto>
          )}
        </Coluna>
        {pacotes.data && pacotes.data.length > 0 && (
          <Coluna>
            <Texto tipo="subtitulo">Pacotes</Texto>
            {pacotes.data.map((p) => (
              <Cartao key={p.id}>
                <Linha style={{ justifyContent: 'space-between' }}>
                  <Texto negrito style={{ flex: 1 }}>
                    {p.nome}
                  </Texto>
                  <Texto tipo="subtitulo" cor={cores.primaria}>
                    {formatarCentavos(p.precoCentavos)}
                  </Texto>
                </Linha>
                <Texto tipo="suave">
                  {p.quantidadeAulas} aulas · {formatarCentavos(p.precoPorAulaCentavos)} por aula
                  {p.precoPorAulaCentavos < i.precoAulaCentavos
                    ? ` (economia de ${formatarCentavos((i.precoAulaCentavos - p.precoPorAulaCentavos) * p.quantidadeAulas)})`
                    : ''}
                </Texto>
                <Botao
                  titulo="Comprar com Pix"
                  icone="cart"
                  compacto
                  variante="secundario"
                  aoPressionar={() => comprarPacote(p.id, !!eu?.aluno)}
                />
              </Cartao>
            ))}
            <Texto tipo="pequeno">
              O valor fica guardado e é repassado ao instrutor a cada aula realizada.
            </Texto>
          </Coluna>
        )}
        <Coluna>
          <Texto tipo="subtitulo">Avaliações</Texto>
          {i.avaliacoes.length ? (
            <Cartao>
              {i.avaliacoes.map((a, n) => (
                <Coluna key={a.id} gap={4}>
                  {n > 0 && <Divisor />}
                  <Linha style={{ justifyContent: 'space-between' }}>
                    <Texto negrito>{a.autorPrimeiroNome}</Texto>
                    <Texto tipo="pequeno">{dataCurta(a.criadoEm)}</Texto>
                  </Linha>
                  <Estrelas nota={a.nota} tamanho={14} />
                  {a.comentario && <Texto>{a.comentario}</Texto>}
                </Coluna>
              ))}
            </Cartao>
          ) : (
            <Texto tipo="suave">Seja o primeiro a avaliar.</Texto>
          )}
        </Coluna>
      </Tela>
      <View
        style={{
          padding: 16,
          backgroundColor: cores.superficie,
          borderTopWidth: 1,
          borderTopColor: cores.borda,
        }}
      >
        <Botao
          titulo="Ver horários e agendar"
          icone="calendar"
          aoPressionar={() => router.push(`/agendar/${i.id}`)}
        />
      </View>
    </View>
  );
}
