import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

export type Ponto = { lat: number; lng: number };

/** São Paulo (Av. Paulista) — usado quando o usuário não libera a localização. */
export const PONTO_PADRAO: Ponto = { lat: -23.5614, lng: -46.6559 };

export async function obterLocalizacao(opcoes: { exigir?: boolean } = {}): Promise<Ponto | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    if (opcoes.exigir) {
      Alert.alert('Localização necessária', 'Permita o acesso à localização nas configurações do aparelho para continuar.');
    }
    return null;
  }
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    const ultima = await Location.getLastKnownPositionAsync();
    return ultima ? { lat: ultima.coords.latitude, lng: ultima.coords.longitude } : null;
  }
}

export async function enderecoDe(p: Ponto): Promise<string> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
    if (!r) return '';
    return [r.street && `${r.street}${r.streetNumber ? `, ${r.streetNumber}` : ''}`, r.district, r.city ?? r.subregion]
      .filter(Boolean)
      .join(' - ');
  } catch {
    return '';
  }
}

export async function pontoDeEndereco(endereco: string): Promise<Ponto | null> {
  try {
    const [r] = await Location.geocodeAsync(endereco);
    return r ? { lat: r.latitude, lng: r.longitude } : null;
  } catch {
    return null;
  }
}

/** Tira uma foto (câmera) ou escolhe da galeria. Devolve a URI local. */
export async function escolherImagem(origem: 'camera' | 'galeria', frontal = false): Promise<string | null> {
  if (origem === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Câmera necessária', 'Permita o acesso à câmera nas configurações do aparelho.');
      return null;
    }
    const r = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      cameraType: frontal ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
    return r.canceled ? null : (r.assets[0]?.uri ?? null);
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
  return r.canceled ? null : (r.assets[0]?.uri ?? null);
}

/** Pergunta se o usuário quer usar a câmera ou a galeria. */
export function perguntarOrigemImagem(frontal = false): Promise<string | null> {
  return new Promise((resolver) => {
    Alert.alert('Enviar foto', 'Como você quer enviar?', [
      { text: 'Câmera', onPress: () => escolherImagem('camera', frontal).then(resolver) },
      { text: 'Galeria', onPress: () => escolherImagem('galeria').then(resolver) },
      { text: 'Cancelar', style: 'cancel', onPress: () => resolver(null) },
    ]);
  });
}
