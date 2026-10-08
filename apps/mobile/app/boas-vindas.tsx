import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Botao, Coluna, Linha, Tela, Texto } from '../src/componentes/ui';
import { espaco, raio } from '../src/tema/cores';
import { useTema } from '../src/tema/TemaProvider';

const SLIDES = [
  { icone: 'car-sport' as const, titulo: 'Aprenda a dirigir do seu jeito', texto: 'Encontre instrutores credenciados pelo DETRAN perto de você.' },
  { icone: 'calendar' as const, titulo: 'Agende em poucos toques', texto: 'Escolha o dia, o horário e o ponto de encontro. Pague com Pix.' },
  { icone: 'shield-checkmark' as const, titulo: 'Com segurança', texto: 'Instrutores com documentos verificados, check-in com código e pagamento protegido.' },
];

export default function BoasVindas() {
  const { cores } = useTema();
  const [i, setI] = useState(0);
  const s = SLIDES[i]!;
  return (
    <Tela rolagem={false} bordas={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: espaco.xl }}>
        <View style={{ width: 140, height: 140, borderRadius: raio.pilula, backgroundColor: cores.primariaSuave, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={s.icone} size={72} color={cores.primaria} />
        </View>
        <Coluna gap={espaco.md} style={{ paddingHorizontal: espaco.lg }}>
          <Texto tipo="titulo" centro>
            {s.titulo}
          </Texto>
          <Texto tipo="suave" centro>
            {s.texto}
          </Texto>
        </Coluna>
        <Linha gap={8}>
          {SLIDES.map((_, n) => (
            <View
              key={n}
              accessibilityLabel={`Página ${n + 1} de ${SLIDES.length}`}
              style={{ width: n === i ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: n === i ? cores.primaria : cores.borda }}
            />
          ))}
        </Linha>
      </View>
      <Coluna gap={espaco.md}>
        {i < SLIDES.length - 1 ? (
          <Botao titulo="Continuar" aoPressionar={() => setI(i + 1)} />
        ) : (
          <Botao titulo="Quero aprender a dirigir" icone="school" aoPressionar={() => router.push('/cadastro?perfil=aluno')} />
        )}
        <Botao titulo="Sou instrutor credenciado" variante="secundario" icone="id-card" aoPressionar={() => router.push('/cadastro?perfil=instrutor')} />
        <Botao titulo="Já tenho conta — Entrar" variante="texto" aoPressionar={() => router.push('/entrar')} />
      </Coluna>
    </Tela>
  );
}
