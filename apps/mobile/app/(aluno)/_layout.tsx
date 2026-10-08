import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useAuth } from '../../src/servicos/AuthProvider';
import { useTema } from '../../src/tema/TemaProvider';

export default function AbasAluno() {
  const { cores } = useTema();
  const { eu, carregando } = useAuth();
  if (!carregando && !eu) return <Redirect href="/boas-vindas" />;
  const icone = (nome: React.ComponentProps<typeof Ionicons>['name']) =>
    function Icone({ color, size }: { color: ColorValue; size: number }) {
      return <Ionicons name={nome} color={color as string} size={size} />;
    };
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: cores.primaria,
        tabBarInactiveTintColor: cores.textoSuave,
        tabBarStyle: { backgroundColor: cores.superficie, borderTopColor: cores.borda },
        headerStyle: { backgroundColor: cores.superficie },
        headerTintColor: cores.texto,
        headerShadowVisible: false,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="inicio" options={{ title: 'Início', tabBarIcon: icone('home') }} />
      <Tabs.Screen
        name="buscar"
        options={{ title: 'Instrutores', tabBarIcon: icone('search'), headerShown: false }}
      />
      <Tabs.Screen
        name="autoescolas"
        options={{ title: 'Autoescolas', tabBarIcon: icone('business') }}
      />
      <Tabs.Screen
        name="aulas"
        options={{ title: 'Minhas aulas', tabBarIcon: icone('calendar') }}
      />
      <Tabs.Screen name="conta" options={{ title: 'Perfil', tabBarIcon: icone('person-circle') }} />
    </Tabs>
  );
}
