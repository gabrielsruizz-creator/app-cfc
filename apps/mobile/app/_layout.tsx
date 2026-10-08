import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/servicos/AuthProvider';
import { TemaProvider, useTema } from '../src/tema/TemaProvider';

function Navegacao() {
  const { cores, escuro } = useTema();
  return (
    <>
      <StatusBar style={escuro ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: cores.superficie },
          headerTintColor: cores.texto,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: cores.fundo },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="boas-vindas" options={{ headerShown: false }} />
        <Stack.Screen name="(aluno)" options={{ headerShown: false }} />
        <Stack.Screen name="(instrutor)" options={{ headerShown: false }} />
        <Stack.Screen name="entrar" options={{ title: 'Entrar' }} />
        <Stack.Screen name="cadastro" options={{ title: 'Criar conta' }} />
        <Stack.Screen name="completar-aluno" options={{ title: 'Seu perfil de aluno' }} />
        <Stack.Screen name="perfil-instrutor/[id]" options={{ title: 'Instrutor' }} />
        <Stack.Screen name="agendar/[instrutorId]" options={{ title: 'Agendar aula' }} />
        <Stack.Screen
          name="pagamento/[aulaId]"
          options={{ title: 'Pagamento', gestureEnabled: false }}
        />
        <Stack.Screen name="aula/[id]" options={{ title: 'Aula' }} />
        <Stack.Screen
          name="avaliar/[id]"
          options={{ title: 'Avaliar aula', presentation: 'modal' }}
        />
        <Stack.Screen name="evolucao" options={{ title: 'Minha evolução' }} />
        <Stack.Screen name="autoescola/[id]" options={{ title: 'Autoescola' }} />
        <Stack.Screen name="pedido/[id]" options={{ title: 'Pedido' }} />
        <Stack.Screen name="checkout/[pacoteId]" options={{ title: 'Resumo da compra' }} />
        <Stack.Screen name="pedidos" options={{ title: 'Meus pacotes' }} />
        <Stack.Screen name="creditos" options={{ title: 'Saldo de aulas' }} />
        <Stack.Screen name="conversas" options={{ title: 'Conversas' }} />
        <Stack.Screen name="conversa/[id]" options={{ title: 'Conversa' }} />
        <Stack.Screen name="relatar/[aulaId]" options={{ title: 'Relatar problema' }} />
        <Stack.Screen name="denunciar" options={{ title: 'Denunciar' }} />
        <Stack.Screen name="area-instrutor/pacotes" options={{ title: 'Meus pacotes' }} />
        <Stack.Screen name="area-instrutor/financeiro" options={{ title: 'Ganhos e saques' }} />
        <Stack.Screen name="area-instrutor/vinculos" options={{ title: 'Autoescolas' }} />
        <Stack.Screen name="recibos" options={{ title: 'Recibos' }} />
        <Stack.Screen name="notificacoes" options={{ title: 'Notificações' }} />
        <Stack.Screen name="privacidade" options={{ title: 'Privacidade e dados' }} />
        <Stack.Screen name="documento-legal/[tipo]" options={{ title: 'Termos' }} />
        <Stack.Screen name="area-instrutor/cadastro" options={{ title: 'Cadastro de instrutor' }} />
        <Stack.Screen name="area-instrutor/perfil" options={{ title: 'Perfil profissional' }} />
        <Stack.Screen name="area-instrutor/atendimento" options={{ title: 'Preço e região' }} />
        <Stack.Screen name="area-instrutor/documentos" options={{ title: 'Documentos' }} />
        <Stack.Screen name="area-instrutor/veiculo" options={{ title: 'Veículo' }} />
        <Stack.Screen name="area-instrutor/jornada" options={{ title: 'Jornada semanal' }} />
        <Stack.Screen name="area-instrutor/bloqueios" options={{ title: 'Folgas e férias' }} />
        <Stack.Screen name="area-instrutor/aula/[id]" options={{ title: 'Aula' }} />
        <Stack.Screen name="area-instrutor/aluno/[id]" options={{ title: 'Ficha do aluno' }} />
        <Stack.Screen name="area-instrutor/avaliacoes" options={{ title: 'Minhas avaliações' }} />
      </Stack>
    </>
  );
}

export default function Raiz() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <TemaProvider>
          <AuthProvider>
            <Navegacao />
          </AuthProvider>
        </TemaProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
