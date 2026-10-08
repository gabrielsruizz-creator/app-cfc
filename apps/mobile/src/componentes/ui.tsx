import { Ionicons } from '@expo/vector-icons';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonteArquivo } from '../servicos/api';
import { espaco, fonte, raio } from '../tema/cores';
import { useTema } from '../tema/TemaProvider';

export type NomeIcone = ComponentProps<typeof Ionicons>['name'];

// ---------- Estrutura ----------

export function Tela({
  children,
  rolagem = true,
  aoAtualizar,
  atualizando = false,
  semMargem = false,
  bordas = ['bottom'],
}: {
  children: ReactNode;
  rolagem?: boolean;
  aoAtualizar?: () => void;
  atualizando?: boolean;
  semMargem?: boolean;
  bordas?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  const { cores } = useTema();
  const conteudo = rolagem ? (
    <ScrollView
      contentContainerStyle={[!semMargem && { padding: espaco.lg, gap: espaco.lg }, { paddingBottom: espaco.xxl * 2 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        aoAtualizar ? <RefreshControl refreshing={atualizando} onRefresh={aoAtualizar} tintColor={cores.primaria} /> : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, !semMargem && { padding: espaco.lg, gap: espaco.lg }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={bordas} style={{ flex: 1, backgroundColor: cores.fundo }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {conteudo}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Linha({ children, gap = espaco.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Coluna({ children, gap = espaco.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

// ---------- Texto ----------

type TipoTexto = 'titulo' | 'subtitulo' | 'corpo' | 'suave' | 'pequeno' | 'rotulo';

export function Texto({
  children,
  tipo = 'corpo',
  cor,
  style,
  centro,
  negrito,
  linhas,
}: {
  children: ReactNode;
  tipo?: TipoTexto;
  cor?: string;
  style?: StyleProp<TextStyle>;
  centro?: boolean;
  negrito?: boolean;
  linhas?: number;
}) {
  const { cores } = useTema();
  const estilos: Record<TipoTexto, TextStyle> = {
    titulo: { fontSize: fonte.titulo, fontWeight: '700', color: cores.texto },
    subtitulo: { fontSize: fonte.media, fontWeight: '700', color: cores.texto },
    corpo: { fontSize: fonte.normal, color: cores.texto, lineHeight: 22 },
    suave: { fontSize: fonte.normal, color: cores.textoSuave, lineHeight: 22 },
    pequeno: { fontSize: fonte.pequena, color: cores.textoSuave },
    rotulo: { fontSize: fonte.pequena, fontWeight: '600', color: cores.textoSuave, textTransform: 'uppercase', letterSpacing: 0.5 },
  };
  return (
    <Text
      numberOfLines={linhas}
      accessibilityRole={tipo === 'titulo' || tipo === 'subtitulo' ? 'header' : undefined}
      style={[estilos[tipo], cor ? { color: cor } : null, centro && { textAlign: 'center' }, negrito && { fontWeight: '700' }, style]}
    >
      {children}
    </Text>
  );
}

// ---------- Botões ----------

type VarianteBotao = 'primario' | 'secundario' | 'texto' | 'perigo' | 'destaque';

export function Botao({
  titulo,
  aoPressionar,
  variante = 'primario',
  carregando = false,
  desabilitado = false,
  icone,
  compacto = false,
  rotuloAcessivel,
}: {
  titulo: string;
  aoPressionar: () => void;
  variante?: VarianteBotao;
  carregando?: boolean;
  desabilitado?: boolean;
  icone?: NomeIcone;
  compacto?: boolean;
  rotuloAcessivel?: string;
}) {
  const { cores } = useTema();
  const mapa: Record<VarianteBotao, { fundo: string; texto: string; borda: string }> = {
    primario: { fundo: cores.primaria, texto: cores.sobrePrimaria, borda: cores.primaria },
    destaque: { fundo: cores.destaque, texto: cores.sobreDestaque, borda: cores.destaque },
    secundario: { fundo: 'transparent', texto: cores.primaria, borda: cores.primaria },
    texto: { fundo: 'transparent', texto: cores.primaria, borda: 'transparent' },
    perigo: { fundo: 'transparent', texto: cores.erro, borda: cores.erro },
  };
  const c = mapa[variante];
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotuloAcessivel ?? titulo}
      accessibilityState={{ disabled: inativo, busy: carregando }}
      onPress={aoPressionar}
      disabled={inativo}
      style={({ pressed }) => [
        {
          minHeight: compacto ? 40 : 52,
          paddingHorizontal: compacto ? espaco.md : espaco.xl,
          borderRadius: raio.pilula,
          backgroundColor: c.fundo,
          borderWidth: 1.5,
          borderColor: c.borda,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: espaco.sm,
          opacity: inativo ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={c.texto} />
      ) : (
        <>
          {icone && <Ionicons name={icone} size={20} color={c.texto} />}
          <Text style={{ color: c.texto, fontSize: compacto ? fonte.pequena + 1 : fonte.normal, fontWeight: '700' }}>{titulo}</Text>
        </>
      )}
    </Pressable>
  );
}

export function BotaoIcone({ icone, aoPressionar, rotulo, cor }: { icone: NomeIcone; aoPressionar: () => void; rotulo: string; cor?: string }) {
  const { cores } = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={aoPressionar}
      hitSlop={8}
      style={({ pressed }) => ({ padding: espaco.sm, borderRadius: raio.pilula, opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icone} size={24} color={cor ?? cores.texto} />
    </Pressable>
  );
}

// ---------- Formulário ----------

export const Campo = forwardRef<TextInput, TextInputProps & { rotulo: string; erro?: string; ajuda?: string }>(
  function Campo({ rotulo, erro, ajuda, style, ...props }, ref) {
    const { cores } = useTema();
    return (
      <View style={{ gap: espaco.xs }}>
        <Text style={{ color: cores.texto, fontWeight: '600', fontSize: fonte.pequena + 1 }}>{rotulo}</Text>
        <TextInput
          ref={ref}
          accessibilityLabel={rotulo}
          placeholderTextColor={cores.textoSuave}
          style={[
            {
              minHeight: 52,
              borderWidth: 1.5,
              borderColor: erro ? cores.erro : cores.borda,
              borderRadius: raio.md,
              paddingHorizontal: espaco.md,
              fontSize: fonte.normal,
              color: cores.texto,
              backgroundColor: cores.superficie,
            },
            style,
          ]}
          {...props}
        />
        {erro ? (
          <Text accessibilityLiveRegion="polite" style={{ color: cores.erro, fontSize: fonte.pequena }}>
            {erro}
          </Text>
        ) : ajuda ? (
          <Text style={{ color: cores.textoSuave, fontSize: fonte.pequena }}>{ajuda}</Text>
        ) : null}
      </View>
    );
  },
);

export function Chip({
  rotulo,
  selecionado,
  aoPressionar,
  icone,
}: {
  rotulo: string;
  selecionado?: boolean;
  aoPressionar?: () => void;
  icone?: NomeIcone;
}) {
  const { cores } = useTema();
  return (
    <Pressable
      accessibilityRole={aoPressionar ? 'button' : 'text'}
      accessibilityState={{ selected: selecionado }}
      onPress={aoPressionar}
      disabled={!aoPressionar}
      style={{
        minHeight: 36,
        paddingHorizontal: espaco.md,
        borderRadius: raio.pilula,
        borderWidth: 1.5,
        borderColor: selecionado ? cores.primaria : cores.borda,
        backgroundColor: selecionado ? cores.primariaSuave : cores.superficie,
        flexDirection: 'row',
        alignItems: 'center',
        gap: espaco.xs,
      }}
    >
      {icone && <Ionicons name={icone} size={16} color={selecionado ? cores.primaria : cores.textoSuave} />}
      <Text style={{ color: selecionado ? cores.primaria : cores.texto, fontWeight: selecionado ? '700' : '500' }}>{rotulo}</Text>
    </Pressable>
  );
}

export function Interruptor({ rotulo, ligado, aoMudar, descricao }: { rotulo: string; ligado: boolean; aoMudar: (v: boolean) => void; descricao?: string }) {
  const { cores } = useTema();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: ligado }}
      onPress={() => aoMudar(!ligado)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.md, minHeight: 48 }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: cores.texto, fontSize: fonte.normal }}>{rotulo}</Text>
        {descricao && <Text style={{ color: cores.textoSuave, fontSize: fonte.pequena }}>{descricao}</Text>}
      </View>
      <View
        style={{
          width: 52,
          height: 30,
          borderRadius: 15,
          backgroundColor: ligado ? cores.primaria : cores.borda,
          padding: 3,
          alignItems: ligado ? 'flex-end' : 'flex-start',
        }}
      >
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} />
      </View>
    </Pressable>
  );
}

export function CaixaSelecao({ rotulo, marcado, aoMudar }: { rotulo: ReactNode; marcado: boolean; aoMudar: (v: boolean) => void }) {
  const { cores } = useTema();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcado }}
      onPress={() => aoMudar(!marcado)}
      style={{ flexDirection: 'row', gap: espaco.md, alignItems: 'center', minHeight: 44 }}
    >
      <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={26} color={marcado ? cores.primaria : cores.textoSuave} />
      <View style={{ flex: 1 }}>{typeof rotulo === 'string' ? <Text style={{ color: cores.texto }}>{rotulo}</Text> : rotulo}</View>
    </Pressable>
  );
}

// ---------- Superfícies ----------

export function Cartao({
  children,
  aoPressionar,
  style,
  rotuloAcessivel,
}: {
  children: ReactNode;
  aoPressionar?: () => void;
  style?: StyleProp<ViewStyle>;
  rotuloAcessivel?: string;
}) {
  const { cores } = useTema();
  const base: ViewStyle = {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: cores.borda,
    padding: espaco.lg,
    gap: espaco.sm,
  };
  if (!aoPressionar) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotuloAcessivel}
      onPress={aoPressionar}
      style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

type TipoAviso = 'info' | 'sucesso' | 'alerta' | 'erro';

export function Aviso({ tipo = 'info', titulo, children, icone }: { tipo?: TipoAviso; titulo?: string; children?: ReactNode; icone?: NomeIcone }) {
  const { cores } = useTema();
  const mapa = {
    info: { fundo: cores.primariaSuave, cor: cores.primaria, icone: 'information-circle' as NomeIcone },
    sucesso: { fundo: cores.sucessoSuave, cor: cores.sucesso, icone: 'checkmark-circle' as NomeIcone },
    alerta: { fundo: cores.alertaSuave, cor: cores.alerta, icone: 'warning' as NomeIcone },
    erro: { fundo: cores.erroSuave, cor: cores.erro, icone: 'alert-circle' as NomeIcone },
  }[tipo];
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: mapa.fundo, borderRadius: raio.md, padding: espaco.md, flexDirection: 'row', gap: espaco.md }}
    >
      <Ionicons name={icone ?? mapa.icone} size={22} color={mapa.cor} />
      <View style={{ flex: 1, gap: 2 }}>
        {titulo && <Text style={{ color: mapa.cor, fontWeight: '700' }}>{titulo}</Text>}
        {typeof children === 'string' ? <Text style={{ color: cores.texto }}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function Selo({ texto, cor, fundo, icone }: { texto: string; cor?: string; fundo?: string; icone?: NomeIcone }) {
  const { cores } = useTema();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: fundo ?? cores.primariaSuave,
        paddingHorizontal: espaco.sm,
        paddingVertical: 3,
        borderRadius: raio.pilula,
      }}
    >
      {icone && <Ionicons name={icone} size={14} color={cor ?? cores.primaria} />}
      <Text style={{ color: cor ?? cores.primaria, fontSize: fonte.pequena, fontWeight: '700' }}>{texto}</Text>
    </View>
  );
}

export function Avatar({ nome, arquivoId, tamanho = 56, publico = false }: { nome: string; arquivoId?: string | null; tamanho?: number; publico?: boolean }) {
  const { cores } = useTema();
  const fonteImg = fonteArquivo(arquivoId, publico);
  const iniciais = nome
    .replace(/\(.*\)/, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return fonteImg ? (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={`Foto de ${nome}`}
      source={fonteImg}
      style={{ width: tamanho, height: tamanho, borderRadius: tamanho / 2, backgroundColor: cores.superficieAlt }}
    />
  ) : (
    <View
      accessibilityLabel={`Iniciais de ${nome}`}
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: tamanho / 2,
        backgroundColor: cores.primariaSuave,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: cores.primaria, fontWeight: '700', fontSize: tamanho / 2.6 }}>{iniciais}</Text>
    </View>
  );
}

export function Estrelas({ nota, tamanho = 16, aoEscolher }: { nota: number; tamanho?: number; aoEscolher?: (n: number) => void }) {
  const { cores } = useTema();
  return (
    <View style={{ flexDirection: 'row', gap: aoEscolher ? espaco.sm : 2 }} accessibilityLabel={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const nome: NomeIcone = nota >= n ? 'star' : nota >= n - 0.5 ? 'star-half' : 'star-outline';
        const estrela = <Ionicons name={nome} size={tamanho} color={cores.destaque} />;
        return aoEscolher ? (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} estrela${n > 1 ? 's' : ''}`} onPress={() => aoEscolher(n)} hitSlop={6}>
            {estrela}
          </Pressable>
        ) : (
          <View key={n}>{estrela}</View>
        );
      })}
    </View>
  );
}

export function Carregando({ texto }: { texto?: string }) {
  const { cores } = useTema();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaco.xl, gap: espaco.md, backgroundColor: cores.fundo }}>
      <ActivityIndicator size="large" color={cores.primaria} />
      {texto && <Text style={{ color: cores.textoSuave }}>{texto}</Text>}
    </View>
  );
}

export function Vazio({ icone = 'file-tray-outline', titulo, texto, acao }: { icone?: NomeIcone; titulo: string; texto?: string; acao?: ReactNode }) {
  const { cores } = useTema();
  return (
    <View style={{ alignItems: 'center', padding: espaco.xl, gap: espaco.md }}>
      <Ionicons name={icone} size={48} color={cores.textoSuave} />
      <Text style={{ color: cores.texto, fontWeight: '700', fontSize: fonte.media, textAlign: 'center' }}>{titulo}</Text>
      {texto && <Text style={{ color: cores.textoSuave, textAlign: 'center' }}>{texto}</Text>}
      {acao}
    </View>
  );
}

export function ItemLista({
  icone,
  titulo,
  descricao,
  aoPressionar,
  direita,
}: {
  icone?: NomeIcone;
  titulo: string;
  descricao?: string;
  aoPressionar?: () => void;
  direita?: ReactNode;
}) {
  const { cores } = useTema();
  return (
    <Pressable
      accessibilityRole={aoPressionar ? 'button' : undefined}
      onPress={aoPressionar}
      disabled={!aoPressionar}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: espaco.md, minHeight: 56, opacity: pressed ? 0.7 : 1 })}
    >
      {icone && <Ionicons name={icone} size={22} color={cores.primaria} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: cores.texto, fontSize: fonte.normal }}>{titulo}</Text>
        {descricao && <Text style={{ color: cores.textoSuave, fontSize: fonte.pequena }}>{descricao}</Text>}
      </View>
      {direita ?? (aoPressionar && <Ionicons name="chevron-forward" size={20} color={cores.textoSuave} />)}
    </Pressable>
  );
}

export function Divisor() {
  const { cores } = useTema();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: cores.borda }} />;
}
