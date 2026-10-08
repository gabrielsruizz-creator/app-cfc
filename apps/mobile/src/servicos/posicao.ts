import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { api } from './api';

export type EstadoEnvio = 'parado' | 'enviando' | 'sem_permissao';

/**
 * Envia a posição do instrutor enquanto a tela da aula está aberta e a aula está
 * "a caminho" ou em andamento (a API ignora envios mais frequentes que 5 s).
 */
export function useEnvioPosicao(aulaId: string, ativo: boolean): EstadoEnvio {
  const [estado, setEstado] = useState<EstadoEnvio>('parado');
  useEffect(() => {
    if (!ativo) {
      setEstado('parado');
      return;
    }
    let assinatura: Location.LocationSubscription | null = null;
    let encerrado = false;
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (encerrado) return;
      if (status !== 'granted') {
        setEstado('sem_permissao');
        return;
      }
      setEstado('enviando');
      assinatura = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 15 },
        (p) => {
          void api(`/instrutor/aulas/${aulaId}/posicao`, {
            corpo: {
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              precisaoM: p.coords.accuracy ?? undefined,
            },
          }).catch(() => {
            // sem sinal: a próxima leitura tenta de novo
          });
        },
      );
      if (encerrado) assinatura.remove();
    })();
    return () => {
      encerrado = true;
      assinatura?.remove();
    };
  }, [aulaId, ativo]);
  return estado;
}
