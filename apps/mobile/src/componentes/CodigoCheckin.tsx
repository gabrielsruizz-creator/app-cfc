import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useTema } from '../tema/TemaProvider';
import { Cartao, Texto } from './ui';

/** Código de check-in do aluno. Tocar no quadro copia o código. */
export function CodigoCheckin({ codigo }: { codigo: string }) {
  const { cores } = useTema();
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Código de check-in ${codigo.split('').join(' ')}`}
      accessibilityHint="Toque para copiar o código"
      onPress={async () => {
        await Clipboard.setStringAsync(codigo);
        setCopiado(true);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Cartao
        style={{
          alignItems: 'center',
          backgroundColor: cores.primariaSuave,
          borderColor: cores.primaria,
        }}
      >
        <Texto tipo="rotulo">Código de check-in</Texto>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{
            fontSize: 44,
            // altura de linha folgada: sem ela os números ficam cortados
            lineHeight: 64,
            fontWeight: '800',
            letterSpacing: 12,
            // compensa o espaçamento após o último dígito para ficar centralizado
            paddingLeft: 12,
            color: cores.primaria,
            fontVariant: ['tabular-nums'],
          }}
        >
          {codigo}
        </Text>
        <Texto tipo="pequeno" centro cor={copiado ? cores.primaria : undefined}>
          {copiado
            ? 'Código copiado!'
            : 'Toque para copiar. Mostre este código ao instrutor no início da aula; não compartilhe antes do encontro.'}
        </Texto>
      </Cartao>
    </Pressable>
  );
}
