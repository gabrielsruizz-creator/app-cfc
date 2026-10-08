import { CATEGORIAS_CNH } from '@volante/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { Aviso, Botao, Campo, Chip, Coluna, Linha, Tela, Texto } from '../src/componentes/ui';
import { api, enviarArquivo, mensagemDeErro } from '../src/servicos/api';
import { useAuth } from '../src/servicos/AuthProvider';
import { raio } from '../src/tema/cores';
import { useTema } from '../src/tema/TemaProvider';
import { escolherImagem } from '../src/util/dispositivo';

const PRINCIPAIS = ['A', 'B', 'AB'] as const;

export default function CompletarAluno() {
  const { recarregar, sair } = useAuth();
  const { cores } = useTema();
  const [categoria, setCategoria] = useState<string>('B');
  const [maisCategorias, setMaisCategorias] = useState(false);
  const [renach, setRenach] = useState('');
  const [selfie, setSelfie] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function concluir() {
    if (!selfie) return setErro('Tire uma selfie para que o instrutor possa reconhecer você.');
    setErro(null);
    setEnviando(true);
    try {
      const selfieArquivoId = await enviarArquivo(selfie, 'selfie');
      await api('/aluno/perfil', {
        corpo: {
          categoriaDesejada: categoria,
          renach: renach.trim() || undefined,
          selfieArquivoId,
        },
      });
      await recarregar();
      router.replace('/inicio');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela>
      <Texto tipo="titulo">Quase lá!</Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Coluna>
        <Texto tipo="subtitulo">Qual habilitação você quer tirar?</Texto>
        <Linha style={{ flexWrap: 'wrap' }}>
          {(maisCategorias ? CATEGORIAS_CNH : PRINCIPAIS).map((c) => (
            <Chip
              key={c}
              rotulo={c === 'A' ? 'A (moto)' : c === 'B' ? 'B (carro)' : c === 'AB' ? 'A + B' : c}
              selecionado={categoria === c}
              aoPressionar={() => setCategoria(c)}
            />
          ))}
          {!maisCategorias && <Chip rotulo="Outras" aoPressionar={() => setMaisCategorias(true)} />}
        </Linha>
      </Coluna>
      <Campo
        rotulo="RENACH (opcional)"
        value={renach}
        onChangeText={setRenach}
        autoCapitalize="characters"
        placeholder="Ex.: SP123456789"
        ajuda="É o número do seu processo no DETRAN. Se ainda não tem, deixe em branco."
      />
      <Coluna>
        <Texto tipo="subtitulo">Selfie de identificação</Texto>
        <Texto tipo="suave">
          O instrutor verá sua foto para reconhecer você no ponto de encontro.
        </Texto>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          {selfie ? (
            <Image
              source={{ uri: selfie }}
              style={{ width: 160, height: 160, borderRadius: raio.pilula }}
              accessibilityLabel="Sua selfie"
            />
          ) : (
            <View
              style={{
                width: 160,
                height: 160,
                borderRadius: raio.pilula,
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: cores.borda,
              }}
            />
          )}
        </View>
        <Botao
          titulo={selfie ? 'Tirar outra' : 'Tirar selfie'}
          variante="secundario"
          icone="camera"
          aoPressionar={async () => setSelfie((await escolherImagem('camera', true)) ?? selfie)}
        />
      </Coluna>
      <Botao titulo="Concluir cadastro" aoPressionar={concluir} carregando={enviando} />
      <Botao
        titulo="Sair"
        variante="texto"
        aoPressionar={async () => {
          await sair();
          router.replace('/boas-vindas');
        }}
      />
    </Tela>
  );
}
