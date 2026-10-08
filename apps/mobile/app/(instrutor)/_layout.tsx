import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useAuth } from '../../src/servicos/AuthProvider';
import { useTema } from '../../src/tema/TemaProvider';

export default function AbasInstrutor() {
  const { cores } = useTema();
  const { eu, carregando } = useAuth();
  if (!carregando && !eu) return <Redirect href="/boas-vindas" />;
  if (!carregando && eu && !eu.instrutor) return <Redirect href="/area-instrutor/cadastro" />;
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
      <Tabs.Screen name="agenda" options={{ title: 'Agenda', tabBarIcon: icone('calendar') }} />
      <Tabs.Screen name="solicitacoes" options={{ title: 'Solicitações', tabBarIcon: icone('mail-unread') }} />
      <Tabs.Screen name="alunos" options={{ title: 'Alunos', tabBarIcon: icone('people') }} />
      <Tabs.Screen name="painel" options={{ title: 'Perfil', tabBarIcon: icone('person-circle') }} />
    </Tabs>
  );
}
