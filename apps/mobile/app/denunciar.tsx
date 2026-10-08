import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Aviso, Botao, Campo, Chip, Coluna, Linha, Tela, Texto } from '../src/componentes/ui';
import { api, mensagemDeErro } from '../src/servicos/api';

const MOTIVOS = ['Comportamento inadequado', 'Assédio', 'Direção perigosa', 'Fraude', 'Outro'];

/** Denúncia sigilosa sobre instrutor, autoescola ou aluno. */
export default function Denunciar() {
  const { alvoTipo, alvoId, aulaId } = useLocalSearchParams<{
    alvoTipo: 'instrutor' | 'autoescola' | 'aluno';
    alvoId: string;
    aulaId?: string;
  }>();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!motivo) return;
    setErro(null);
    setEnviando(true);
    try {
      await api('/denuncias', {
        corpo: {
          alvoTipo,
          alvoId,
          aulaId: aulaId || undefined,
          motivo,
          descricao: descricao || undefined,
        },
      });
      setEnviado(true);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  if (enviado)
    return (
      <Tela>
        <Aviso tipo="sucesso" titulo="Denúncia enviada">
          Obrigado. A denúncia é sigilosa e será analisada pela nossa equipe.
        </Aviso>
        <Botao titulo="Voltar" aoPressionar={() => router.back()} />
      </Tela>
    );

  return (
    <Tela>
      <Texto tipo="titulo">Denunciar</Texto>
      <Texto tipo="suave">A denúncia é sigilosa: a outra pessoa não sabe quem denunciou.</Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Coluna>
        <Texto tipo="rotulo">Motivo</Texto>
        <Linha style={{ flexWrap: 'wrap' }}>
          {MOTIVOS.map((m) => (
            <Chip key={m} rotulo={m} selecionado={motivo === m} aoPressionar={() => setMotivo(m)} />
          ))}
        </Linha>
      </Coluna>
      <Campo
        rotulo="Detalhes (opcional)"
        value={descricao}
        onChangeText={setDescricao}
        multiline
        maxLength={1500}
        style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }}
      />
      <Aviso tipo="info">Em caso de risco imediato, ligue 190.</Aviso>
      <Botao
        titulo="Enviar denúncia"
        variante="perigo"
        desabilitado={!motivo}
        carregando={enviando}
        aoPressionar={enviar}
      />
    </Tela>
  );
}
