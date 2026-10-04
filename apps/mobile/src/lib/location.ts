import type { Coordinate } from '@pewnyszlak/domain';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type LocationState =
  | { status: 'idle' | 'requesting' }
  | { status: 'denied'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'ok'; coordinate: Coordinate; accuracyM: number | null; heading: number | null; speedMps: number | null; at: number };

function insecureWebHint(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const secure = typeof window.isSecureContext === 'boolean' ? window.isSecureContext : window.location.protocol === 'https:';
  if (secure) return null;
  return 'Chrome na adresie http://… (nie localhost) blokuje GPS. Opcje: włącz „Symuluj przejście”, albo w Chrome otwórz chrome://flags → „Insecure origins treated as secure” i dodaj ten adres (np. http://10.x.x.x:8081), ewentualnie zainstaluj APK.';
}

const DENIED_MSG = 'Brak dostępu do lokalizacji. Włącz GPS w ustawieniach przeglądarki / telefonu albo użyj symulacji przejścia.';
const UNAVAILABLE_MSG = 'Lokalizacja niedostępna (brak sygnału lub usługa wyłączona). Możesz użyć symulacji przejścia.';

export function toCoordinate(p: Location.LocationObject): Coordinate {
  return { latitude: p.coords.latitude, longitude: p.coords.longitude };
}

function webGeolocationAvailable(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.geolocation;
}

function readWebPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function watchWebPosition(
  onOk: (p: GeolocationPosition) => void,
  onErr: (e: GeolocationPositionError) => void,
): number {
  return navigator.geolocation.watchPosition(onOk, onErr, {
    enableHighAccuracy: true,
    maximumAge: 2_000,
    timeout: 15_000,
  });
}

function fromWebCoords(p: GeolocationPosition): LocationState {
  return {
    status: 'ok',
    coordinate: { latitude: p.coords.latitude, longitude: p.coords.longitude },
    accuracyM: p.coords.accuracy ?? null,
    heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
    speedMps: Number.isFinite(p.coords.speed) ? p.coords.speed : null,
    at: p.timestamp,
  };
}

function mapWebError(err: GeolocationPositionError): LocationState {
  const insecure = insecureWebHint();
  if (err.code === err.PERMISSION_DENIED) {
    return { status: 'denied', message: insecure ? `${DENIED_MSG} ${insecure}` : DENIED_MSG };
  }
  return { status: 'unavailable', message: insecure ? `${UNAVAILABLE_MSG} ${insecure}` : `${UNAVAILABLE_MSG} (${err.message})` };
}

/** Jednorazowe pobranie pozycji z jawną obsługą odmowy. Pozycja nigdy nie jest wysyłana poza żądanie trasy. */
export async function getCurrentPosition(): Promise<LocationState> {
  const insecure = insecureWebHint();
  try {
    if (webGeolocationAvailable()) {
      try {
        const p = await readWebPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 });
        return fromWebCoords(p);
      } catch (e) {
        if (e && typeof e === 'object' && 'code' in e) return mapWebError(e as GeolocationPositionError);
        if (insecure) return { status: 'unavailable', message: `${UNAVAILABLE_MSG} ${insecure}` };
      }
    }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      return { status: 'denied', message: insecure ? `${DENIED_MSG} ${insecure}` : DENIED_MSG };
    }
    const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!enabled) return { status: 'unavailable', message: UNAVAILABLE_MSG };
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { status: 'ok', coordinate: toCoordinate(p), accuracyM: p.coords.accuracy ?? null, heading: p.coords.heading ?? null, speedMps: p.coords.speed ?? null, at: p.timestamp };
  } catch (e) {
    return { status: 'unavailable', message: insecure ? `${UNAVAILABLE_MSG} ${insecure}` : `${UNAVAILABLE_MSG} (${e instanceof Error ? e.message : 'błąd'})` };
  }
}

/** Śledzenie pozycji na potrzeby prowadzenia. */
export function useWatchPosition(active: boolean): LocationState {
  const [state, setState] = useState<LocationState>({ status: 'idle' });
  const sub = useRef<Location.LocationSubscription | null>(null);
  const webWatch = useRef<number | null>(null);

  const stop = useCallback(() => {
    sub.current?.remove();
    sub.current = null;
    if (webWatch.current != null && webGeolocationAvailable()) {
      navigator.geolocation.clearWatch(webWatch.current);
      webWatch.current = null;
    }
  }, []);

  useEffect(() => {
    if (!active) { stop(); setState({ status: 'idle' }); return; }
    let cancelled = false;
    setState({ status: 'requesting' });
    (async () => {
      const insecure = insecureWebHint();

      if (webGeolocationAvailable()) {
        webWatch.current = watchWebPosition(
          (p) => { if (!cancelled) setState(fromWebCoords(p)); },
          (err) => { if (!cancelled) setState(mapWebError(err)); },
        );
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== 'granted') {
        setState({ status: 'denied', message: insecure ? `${DENIED_MSG} ${insecure}` : DENIED_MSG });
        return;
      }
      try {
        sub.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 },
          (p) => {
            setState({ status: 'ok', coordinate: toCoordinate(p), accuracyM: p.coords.accuracy ?? null, heading: p.coords.heading ?? null, speedMps: p.coords.speed ?? null, at: p.timestamp });
          },
        );
      } catch (e) {
        if (!cancelled) {
          setState({
            status: 'unavailable',
            message: insecure
              ? `${UNAVAILABLE_MSG} ${insecure}`
              : `${UNAVAILABLE_MSG} (${e instanceof Error ? e.message : 'błąd'})`,
          });
        }
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [active, stop]);

  return state;
}
