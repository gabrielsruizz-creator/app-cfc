import { contemTelefone, type Mensagem } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Aviso, BotaoIcone, Carregando, Texto } from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { espaco, fonte, raio } from '../../src/tema/cores';
import { useTema } from '../../src/tema/TemaProvider';
import { hora } from '../../src/util/formatos';

export default function Conversa() {
  const { id, como = 'aluno' } = useLocalSearchParams<{ id: string; como?: string }>();
  const { cores } = useTema();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const lista = useRef<FlatList<Mensagem>>(null);
  const q = useQuery({
    queryKey: ['conversa', id, como],
    queryFn: () => api<Mensagem[]>(`/conversas/${id}/mensagens?como=${como}`),
    refetchInterval: 5_000,
  });
  const total = q.data?.length ?? 0;
  useEffect(() => {
    if (total) setTimeout(() => lista.current?.scrollToEnd({ animated: true }), 100);
  }, [total]);

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setErro(null);
    setEnviando(true);
    try {
      await api(`/conversas/${id}/mensagens?como=${como}`, { corpo: { texto: t } });
      setTexto('');
      await q.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  if (q.isLoading) return <Carregando />;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: cores.fundo }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={lista}
          data={q.data ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: espaco.lg, gap: espaco.sm }}
          ListEmptyComponent={
            <Texto tipo="suave" centro>
              Escreva a primeira mensagem.
            </Texto>
          }
          renderItem={({ item: m }) => (
            <View
              style={{
                alignSelf: m.minha ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                backgroundColor: m.minha ? cores.primariaSuave : cores.superficie,
                borderColor: cores.borda,
                borderWidth: m.minha ? 0 : 1,
                borderRadius: raio.lg,
                paddingHorizontal: espaco.md,
                paddingVertical: espaco.sm,
              }}
              accessible
              accessibilityLabel={`${m.minha ? 'Você' : 'Mensagem recebida'}: ${m.texto}, às ${hora(m.criadoEm)}`}
            >
              <Texto>{m.texto}</Texto>
              <Texto tipo="pequeno" style={{ alignSelf: 'flex-end' }}>
                {hora(m.criadoEm)}
                {m.minha && m.lidaEm ? ' · lida' : ''}
              </Texto>
            </View>
          )}
        />
        <View
          style={{
            padding: espaco.md,
            gap: espaco.sm,
            borderTopWidth: 1,
            borderColor: cores.borda,
            backgroundColor: cores.superficie,
          }}
        >
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {contemTelefone(texto) && (
            <Aviso tipo="alerta">
              Para sua segurança, combine aulas e pagamentos pelo app. Fora dele não há garantia de
              reembolso.
            </Aviso>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espaco.sm }}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Mensagem"
              placeholderTextColor={cores.textoSuave}
              accessibilityLabel="Mensagem"
              multiline
              maxLength={2000}
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
                borderWidth: 1.5,
                borderColor: cores.borda,
                borderRadius: raio.lg,
                paddingHorizontal: espaco.md,
                paddingVertical: espaco.sm,
                color: cores.texto,
                fontSize: fonte.normal,
                backgroundColor: cores.fundo,
              }}
            />
            <BotaoIcone
              icone="send"
              cor={cores.primaria}
              rotulo="Enviar mensagem"
              aoPressionar={enviar}
              desabilitado={enviando || !texto.trim()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
