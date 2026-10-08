import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Aviso, Botao, Campo, Coluna, Estrelas, Tela, Texto } from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';

const LEGENDAS = ['', 'Muito ruim', 'Ruim', 'Ok', 'Boa', 'Excelente'];

export default function Avaliar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      await api(`/aluno/aulas/${id}/avaliacao`, {
        corpo: { nota, comentario: comentario.trim() || undefined },
      });
      await queryClient.invalidateQueries({ queryKey: ['aula', id] });
      router.back();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela>
      <Coluna gap={16} style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Texto tipo="titulo" centro>
          Como foi sua aula?
        </Texto>
        <Estrelas nota={nota} tamanho={44} aoEscolher={setNota} />
        <Texto tipo="suave">{LEGENDAS[nota]}</Texto>
      </Coluna>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Campo
        rotulo="Comentário (opcional)"
        value={comentario}
        onChangeText={setComentario}
        multiline
        style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }}
      />
      <Botao
        titulo="Enviar avaliação"
        desabilitado={!nota}
        carregando={enviando}
        aoPressionar={enviar}
      />
    </Tela>
  );
}
