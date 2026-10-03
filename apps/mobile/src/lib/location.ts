import type { Coordinate } from '@pewnyszlak/domain';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

export type LocationState =
  | { status: 'idle' | 'requesting' }
  | { status: 'denied'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'ok'; coordinate: Coordinate; accuracyM: number | null; heading: number | null; speedMps: number | null; at: number };

const DENIED_MSG = 'Nie udzielono dostępu do lokalizacji. Możesz wpisać adres startu ręcznie albo wskazać punkt na mapie; prowadzenie krok po kroku będzie działać w trybie tekstowym (bez automatycznego śledzenia).';
const UNAVAILABLE_MSG = 'Lokalizacja jest w tej chwili niedostępna (brak sygnału GPS lub usługa wyłączona). Możesz wpisać adres ręcznie.';

export function toCoordinate(p: Location.LocationObject): Coordinate {
  return { latitude: p.coords.latitude, longitude: p.coords.longitude };
}

/** Jednorazowe pobranie pozycji z jawną obsługą odmowy. Pozycja nigdy nie jest wysyłana poza żądanie trasy. */
export async function getCurrentPosition(): Promise<LocationState> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { status: 'denied', message: DENIED_MSG };
    const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!enabled) return { status: 'unavailable', message: UNAVAILABLE_MSG };
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { status: 'ok', coordinate: toCoordinate(p), accuracyM: p.coords.accuracy ?? null, heading: p.coords.heading ?? null, speedMps: p.coords.speed ?? null, at: p.timestamp };
  } catch (e) {
    return { status: 'unavailable', message: `${UNAVAILABLE_MSG} (${e instanceof Error ? e.message : 'błąd'})` };
  }
}

/** Śledzenie pozycji na potrzeby prowadzenia. */
export function useWatchPosition(active: boolean): LocationState {
  const [state, setState] = useState<LocationState>({ status: 'idle' });
  const sub = useRef<Location.LocationSubscription | null>(null);

  const stop = useCallback(() => { sub.current?.remove(); sub.current = null; }, []);

  useEffect(() => {
    if (!active) { stop(); return; }
    let cancelled = false;
    setState({ status: 'requesting' });
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== 'granted') { setState({ status: 'denied', message: DENIED_MSG }); return; }
      try {
        sub.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 }, (p) => {
          setState({ status: 'ok', coordinate: toCoordinate(p), accuracyM: p.coords.accuracy ?? null, heading: p.coords.heading ?? null, speedMps: p.coords.speed ?? null, at: p.timestamp });
        });
      } catch (e) {
        if (!cancelled) setState({ status: 'unavailable', message: `${UNAVAILABLE_MSG} (${e instanceof Error ? e.message : 'błąd'})` });
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [active, stop]);

  return state;
}
