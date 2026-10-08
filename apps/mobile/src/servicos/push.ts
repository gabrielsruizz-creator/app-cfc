import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registra o aparelho para receber push. Exige aparelho físico e um projectId do EAS;
 * no Expo Go (Android) o push remoto não é suportado — o app continua mostrando as
 * notificações na tela "Notificações".
 */
export async function registrarPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('padrao', {
        name: 'Avisos',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const atual = await Notifications.getPermissionsAsync();
    const permissao = atual.granted ? atual : await Notifications.requestPermissionsAsync();
    if (!permissao.granted) return;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/eu/dispositivos-push', {
      corpo: { expoPushToken: token.data, plataforma: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
  } catch {
    // Push é opcional: falhas aqui nunca bloqueiam o uso do app.
  }
}
