import type { PerfilAutoescolaPublico } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
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
import { api, fonteArquivo } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';
import { abrirConversa, comprarPacote } from '../../src/servicos/comercial';
import { raio } from '../../src/tema/cores';
import { useTema } from '../../src/tema/TemaProvider';
import { dataCurta, formatarCentavos } from '../../src/util/formatos';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function PerfilAutoescola() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { eu } = useAuth();
  const { cores } = useTema();
  const [comprando, setComprando] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['autoescola', id],
    queryFn: () => api<PerfilAutoescolaPublico>(`/publico/autoescolas/${id}`),
  });
  if (q.isLoading || !q.data) return <Carregando />;
  const a = q.data;

  return (
    <Tela>
      <Coluna gap={12} style={{ alignItems: 'center' }}>
        <Avatar nome={a.nomeFantasia} arquivoId={a.logoArquivoId} publico tamanho={88} />
        <Texto tipo="titulo" centro>
          {a.nomeFantasia}
        </Texto>
        <Selo texto="Credenciada no DETRAN" icone="shield-checkmark" />
        <Linha>
          <Estrelas nota={a.notaMedia ?? 0} />
          <Texto tipo="suave">
            {a.totalAvaliacoes
              ? `${a.notaMedia?.toFixed(1)} · ${a.totalAvaliacoes} avaliações`
              : 'Ainda sem avaliações'}
          </Texto>
        </Linha>
        <Texto tipo="suave" centro>
          {a.endereco}
        </Texto>
      </Coluna>

      {a.fotos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Linha gap={8}>
            {a.fotos.map((f) => (
              <Image
                key={f.arquivoId}
                source={fonteArquivo(f.arquivoId, true)}
                style={{
                  width: 220,
                  height: 140,
                  borderRadius: raio.md,
                  backgroundColor: cores.superficieAlt,
                }}
                accessibilityLabel={f.legenda ?? 'Foto da autoescola'}
              />
            ))}
          </Linha>
        </ScrollView>
      )}

      {a.descricao && (
        <Coluna>
          <Texto tipo="subtitulo">Sobre</Texto>
          <Texto>{a.descricao}</Texto>
        </Coluna>
      )}

      <Coluna>
        <Texto tipo="subtitulo">Pacotes</Texto>
        {a.pacotes.length ? (
          a.pacotes.map((p) => (
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
                {p.quantidadeAulas} aulas de {p.duracaoAulaMin} min ·{' '}
                {formatarCentavos(p.precoPorAulaCentavos)} por aula · categoria{' '}
                {p.categorias.join(', ')}
              </Texto>
              {p.descricao ? <Texto tipo="pequeno">{p.descricao}</Texto> : null}
              <Botao
                titulo="Comprar com Pix"
                icone="cart"
                compacto
                carregando={comprando === p.id}
                aoPressionar={async () => {
                  setComprando(p.id);
                  await comprarPacote(p.id, !!eu?.aluno);
                  setComprando(null);
                }}
              />
            </Cartao>
          ))
        ) : (
          <Texto tipo="suave">Esta autoescola ainda não publicou pacotes.</Texto>
        )}
        <Texto tipo="pequeno">
          O valor fica guardado até a autoescola confirmar sua matrícula. Se ela não responder no
          prazo ou recusar, você recebe tudo de volta.
        </Texto>
      </Coluna>

      {a.horarios.length > 0 && (
        <Coluna>
          <Texto tipo="subtitulo">Horário de atendimento</Texto>
          <Cartao>
            {a.horarios.map((h) => (
              <Linha key={`${h.diaSemana}-${h.abre}`} style={{ justifyContent: 'space-between' }}>
                <Texto>{DIAS[h.diaSemana]}</Texto>
                <Texto>
                  {h.abre} às {h.fecha}
                </Texto>
              </Linha>
            ))}
          </Cartao>
        </Coluna>
      )}

      {a.instrutores.length > 0 && (
        <Coluna>
          <Texto tipo="subtitulo">Instrutores da equipe</Texto>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Linha gap={16}>
              {a.instrutores.map((i) => (
                <Coluna key={i.id} gap={4} style={{ alignItems: 'center', width: 80 }}>
                  <Avatar nome={i.nome} arquivoId={i.fotoArquivoId} publico tamanho={56} />
                  <Texto tipo="pequeno" centro linhas={2}>
                    {i.nome.split(' ')[0]}
                  </Texto>
                </Coluna>
              ))}
            </Linha>
          </ScrollView>
        </Coluna>
      )}

      <Coluna>
        <Texto tipo="subtitulo">Avaliações</Texto>
        {a.avaliacoes.length ? (
          <Cartao>
            {a.avaliacoes.map((av, n) => (
              <Coluna key={av.id} gap={4}>
                {n > 0 && <Divisor />}
                <Linha style={{ justifyContent: 'space-between' }}>
                  <Texto negrito>{av.autorPrimeiroNome}</Texto>
                  <Texto tipo="pequeno">{dataCurta(av.criadoEm)}</Texto>
                </Linha>
                <Estrelas nota={av.nota} tamanho={14} />
                {av.comentario && <Texto>{av.comentario}</Texto>}
                {av.resposta && (
                  <View
                    style={{
                      backgroundColor: cores.superficieAlt,
                      padding: 8,
                      borderRadius: raio.sm,
                    }}
                  >
                    <Texto tipo="pequeno" negrito>
                      Resposta da autoescola
                    </Texto>
                    <Texto tipo="pequeno">{av.resposta}</Texto>
                  </View>
                )}
              </Coluna>
            ))}
          </Cartao>
        ) : (
          <Texto tipo="suave">Ainda sem avaliações.</Texto>
        )}
      </Coluna>

      {eu?.aluno && (
        <Botao
          titulo="Tirar dúvidas pelo chat"
          icone="chatbubbles"
          variante="secundario"
          aoPressionar={() => abrirConversa({ autoescolaId: a.id })}
        />
      )}
    </Tela>
  );
}
