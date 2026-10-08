import type { AulaResumo } from '@volante/contracts';
import { Ionicons } from '@expo/vector-icons';
import { useTema } from '../tema/TemaProvider';
import { dataCurta, hora } from '../util/formatos';
import { StatusAula } from './StatusAula';
import { Avatar, Cartao, Coluna, Linha, Texto } from './ui';

export function CartaoAula({ aula, visao, aoPressionar }: { aula: AulaResumo; visao: 'aluno' | 'instrutor'; aoPressionar: () => void }) {
  const { cores } = useTema();
  const pessoa = visao === 'aluno' ? aula.instrutor : aula.aluno;
  return (
    <Cartao aoPressionar={aoPressionar} rotuloAcessivel={`Aula com ${pessoa.nome} em ${dataCurta(aula.inicio)} às ${hora(aula.inicio)}`}>
      <Linha gap={12}>
        <Avatar nome={pessoa.nome} arquivoId={pessoa.fotoArquivoId} tamanho={48} publico={visao === 'aluno'} />
        <Coluna gap={2} style={{ flex: 1 }}>
          <Texto negrito linhas={1}>{pessoa.nome}</Texto>
          <Texto tipo="suave">
            {dataCurta(aula.inicio)} · {hora(aula.inicio)}–{hora(aula.fim)}
          </Texto>
        </Coluna>
        <Ionicons name="chevron-forward" size={20} color={cores.textoSuave} />
      </Linha>
      <Linha style={{ justifyContent: 'space-between' }}>
        <StatusAula status={aula.status} />
        <Texto tipo="pequeno" linhas={1} style={{ flex: 1, textAlign: 'right' }}>
          {aula.pontoEncontroEndereco}
        </Texto>
      </Linha>
    </Cartao>
  );
}
