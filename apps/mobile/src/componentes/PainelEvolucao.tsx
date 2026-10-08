import type { EvolucaoAluno } from '@volante/contracts';
import { View } from 'react-native';
import { Cartao, Coluna, Linha, Texto } from './ui';
import { raio } from '../tema/cores';
import { useTema } from '../tema/TemaProvider';
import { dataCurta } from '../util/formatos';

export function PainelEvolucao({ dados }: { dados: EvolucaoAluno }) {
  const { cores } = useTema();
  return (
    <>
      <Linha gap={12}>
        <Cartao style={{ flex: 1 }}>
          <Texto tipo="rotulo">Horas de aula</Texto>
          <Texto tipo="titulo" cor={cores.primaria}>
            {(dados.horasAcumuladasMin / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h
          </Texto>
        </Cartao>
        <Cartao style={{ flex: 1 }}>
          <Texto tipo="rotulo">Aulas concluídas</Texto>
          <Texto tipo="titulo" cor={cores.primaria}>
            {dados.aulasConcluidas}
          </Texto>
        </Cartao>
      </Linha>
      <Texto tipo="subtitulo">Habilidades</Texto>
      {dados.habilidades.length ? (
        <Cartao>
          {dados.habilidades.map((h) => (
            <Coluna key={h.habilidadeId} gap={4}>
              <Linha style={{ justifyContent: 'space-between' }}>
                <Texto>{h.nome}</Texto>
                <Texto tipo="pequeno">nível {h.nivelAtual} de 5</Texto>
              </Linha>
              <View
                accessibilityLabel={`${h.nome}: nível ${h.nivelAtual} de 5`}
                style={{
                  height: 10,
                  borderRadius: raio.pilula,
                  backgroundColor: cores.superficieAlt,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${(h.nivelAtual / 5) * 100}%`,
                    height: '100%',
                    backgroundColor: cores.primaria,
                  }}
                />
              </View>
            </Coluna>
          ))}
        </Cartao>
      ) : (
        <Texto tipo="suave">
          Depois das aulas, o instrutor registra sua evolução em baliza, rampa, trânsito e outras
          habilidades.
        </Texto>
      )}
      {dados.anotacoes.length > 0 && (
        <>
          <Texto tipo="subtitulo">Anotações</Texto>
          {dados.anotacoes.map((a) => (
            <Cartao key={a.aulaId}>
              <Texto tipo="pequeno">
                {dataCurta(a.data)} · {a.instrutor}
              </Texto>
              <Texto>{a.texto}</Texto>
            </Cartao>
          ))}
        </>
      )}
    </>
  );
}
