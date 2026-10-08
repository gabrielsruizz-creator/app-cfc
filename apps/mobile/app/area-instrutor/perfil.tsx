import { CATEGORIAS_CNH } from '@volante/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { Aviso, Avatar, Botao, Campo, Carregando, Chip, Coluna, Linha, Tela, Texto } from '../../src/componentes/ui';
import { api, enviarArquivo, mensagemDeErro } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';
import { usePerfilInstrutor } from '../../src/servicos/instrutor';
import { perguntarOrigemImagem } from '../../src/util/dispositivo';
import { Image } from 'react-native';

export default function PerfilProfissional() {
  const { eu, recarregar } = useAuth();
  const queryClient = useQueryClient();
  const q = usePerfilInstrutor();
  const [bio, setBio] = useState('');
  const [atuaDesde, setAtuaDesde] = useState('');
  const [categorias, setCategorias] = useState<string[]>(['B']);
  const [foto, setFoto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (q.data) {
      setBio(q.data.bio ?? '');
      setAtuaDesde(q.data.atuaDesde ? String(q.data.atuaDesde) : '');
      setCategorias(q.data.categorias);
    }
  }, [q.data]);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const fotoArquivoId = foto ? await enviarArquivo(foto, 'foto_perfil') : undefined;
      if (!fotoArquivoId && !eu?.fotoArquivoId) throw new Error('Adicione uma foto de perfil');
      const corpo = { bio, atuaDesde: Number(atuaDesde), categorias, fotoArquivoId };
      await api('/instrutor/perfil', { metodo: q.data ? 'PUT' : 'POST', corpo });
      await queryClient.invalidateQueries({ queryKey: ['instrutor'] });
      await recarregar();
      router.back();
    } catch (e) {
      setErro(e instanceof Error && !('status' in e) ? e.message : mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (q.isLoading) return <Carregando />;
  return (
    <Tela>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Coluna style={{ alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Trocar foto de perfil" onPress={async () => setFoto((await perguntarOrigemImagem(true)) ?? foto)}>
          {foto ? (
            <Image source={{ uri: foto }} style={{ width: 112, height: 112, borderRadius: 56 }} />
          ) : (
            <Avatar nome={eu?.nome ?? ''} arquivoId={eu?.fotoArquivoId} tamanho={112} />
          )}
        </Pressable>
        <Texto tipo="pequeno">Toque para {eu?.fotoArquivoId || foto ? 'trocar' : 'adicionar'} a foto (rosto visível)</Texto>
      </Coluna>
      <Campo
        rotulo="Apresentação"
        value={bio}
        onChangeText={setBio}
        multiline
        style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }}
        ajuda="Conte sua experiência, seu jeito de ensinar e com quem gosta de trabalhar (mín. 20 caracteres)."
      />
      <Campo rotulo="Ano em que começou a dar aulas" value={atuaDesde} onChangeText={(v) => setAtuaDesde(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="Ex.: 2015" />
      <Coluna>
        <Texto negrito>Categorias que você ensina</Texto>
        <Linha style={{ flexWrap: 'wrap' }}>
          {CATEGORIAS_CNH.filter((c) => c.length === 1).map((c) => (
            <Chip
              key={c}
              rotulo={c}
              selecionado={categorias.includes(c)}
              aoPressionar={() => setCategorias(categorias.includes(c) ? categorias.filter((x) => x !== c) : [...categorias, c])}
            />
          ))}
        </Linha>
      </Coluna>
      <Botao titulo="Salvar" carregando={salvando} aoPressionar={salvar} />
    </Tela>
  );
}
