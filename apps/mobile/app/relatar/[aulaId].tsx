import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Aviso, Botao, Campo, Chip, Coluna, Linha, Tela, Texto } from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';

const MOTIVOS = [
  'Aula mais curta que o combinado',
  'Instrutor não apareceu',
  'Aluno não apareceu',
  'Problema com o veículo',
  'Cobrança indevida',
  'Outro',
];

/** Relatar problema em uma aula (abre disputa: o valor fica retido até a análise). */
export default function Relatar() {
  const { aulaId, como = 'aluno' } = useLocalSearchParams<{ aulaId: string; como?: string }>();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!motivo) return;
    setErro(null);
    setEnviando(true);
    try {
      await api(`/${como === 'instrutor' ? 'instrutor' : 'aluno'}/aulas/${aulaId}/disputa`, {
        corpo: { motivo, descricao },
      });
      router.back();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela>
      <Texto tipo="titulo">Relatar problema</Texto>
      <Texto tipo="suave">
        Nossa equipe analisa o caso. Enquanto isso, o pagamento fica retido e a aula não é
        confirmada automaticamente.
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Coluna>
        <Texto tipo="rotulo">O que aconteceu?</Texto>
        <Linha style={{ flexWrap: 'wrap' }}>
          {MOTIVOS.map((m) => (
            <Chip key={m} rotulo={m} selecionado={motivo === m} aoPressionar={() => setMotivo(m)} />
          ))}
        </Linha>
      </Coluna>
      <Campo
        rotulo="Conte com detalhes"
        value={descricao}
        onChangeText={setDescricao}
        multiline
        maxLength={2000}
        style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }}
        ajuda="Mínimo de 10 caracteres."
      />
      <Botao
        titulo="Enviar"
        desabilitado={!motivo || descricao.trim().length < 10}
        carregando={enviando}
        aoPressionar={enviar}
      />
    </Tela>
  );
}
