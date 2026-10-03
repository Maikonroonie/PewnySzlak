import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PREFERENCES, preferencesSchema, type Coordinate, type DataMode, type Preferences, type RouteResult } from '@pewnyszlak/domain';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setApiContext } from '../api/client';

export type Point = { coordinate: Coordinate; label: string; placeId?: string };

type Persisted = {
  preferences: Preferences;
  dataMode: DataMode;
  installationId: string;
  lastRoute: { route: RouteResult; origin: Point; destination: Point; savedAt: string } | null;
  recent: Point[];
  textMode: boolean;
};

type Store = Persisted & {
  ready: boolean;
  origin: Point | null;
  destination: Point | null;
  route: RouteResult | null;
  setPreferences: (p: Partial<Preferences>) => void;
  resetPreferences: () => void;
  setDataMode: (m: DataMode) => void;
  setOrigin: (p: Point | null) => void;
  setDestination: (p: Point | null) => void;
  swapPoints: () => void;
  setRoute: (r: RouteResult | null) => void;
  setTextMode: (v: boolean) => void;
  addRecent: (p: Point) => void;
};

const KEY = 'pewnyszlak.v1';
const StoreContext = createContext<Store | null>(null);

function randomId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const defaults = (): Persisted => ({ preferences: DEFAULT_PREFERENCES, dataMode: 'live', installationId: randomId(), lastRoute: null, recent: [], textMode: false });

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(defaults);
  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [route, setRouteState] = useState<RouteResult | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<Persisted>;
          setState((s) => ({
            ...s,
            ...parsed,
            preferences: preferencesSchema.parse({ ...s.preferences, ...(parsed.preferences ?? {}) }),
            installationId: parsed.installationId && parsed.installationId.length >= 16 ? parsed.installationId : s.installationId,
          }));
          if (parsed.lastRoute) { setOrigin(parsed.lastRoute.origin); setDestination(parsed.lastRoute.destination); setRouteState(parsed.lastRoute.route); }
        } catch { /* uszkodzony zapis – start od zera */ }
      }
    }).catch(() => {}).finally(() => { loaded.current = true; setReady(true); });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  // Ustawiane synchronicznie w trakcie renderu (przed efektami dzieci), aby pierwsze zapytania miały właściwy tryb danych.
  useMemo(() => setApiContext({ mode: state.dataMode, installationId: state.installationId }), [state.dataMode, state.installationId]);

  const setRoute = useCallback((r: RouteResult | null) => {
    setRouteState(r);
    if (r && origin && destination) setState((s) => ({ ...s, lastRoute: { route: r, origin, destination, savedAt: new Date().toISOString() } }));
  }, [origin, destination]);

  const value = useMemo<Store>(() => ({
    ...state,
    ready,
    origin,
    destination,
    route,
    setPreferences: (p) => setState((s) => ({ ...s, preferences: preferencesSchema.parse({ ...s.preferences, ...p }) })),
    resetPreferences: () => setState((s) => ({ ...s, preferences: DEFAULT_PREFERENCES })),
    setDataMode: (m) => setState((s) => ({ ...s, dataMode: m })),
    setOrigin: (p) => { setOrigin(p); setRouteState(null); },
    setDestination: (p) => { setDestination(p); setRouteState(null); },
    swapPoints: () => { setOrigin(destination); setDestination(origin); setRouteState(null); },
    setRoute,
    setTextMode: (v) => setState((s) => ({ ...s, textMode: v })),
    addRecent: (p) => setState((s) => ({ ...s, recent: [p, ...s.recent.filter((r) => r.label !== p.label)].slice(0, 6) })),
  }), [state, ready, origin, destination, route, setRoute]);

  // Do czasu odczytu zapisanych ustawień nie renderujemy ekranów (ułamek sekundy) – unikamy zapytań z domyślnym trybem.
  return <StoreContext.Provider value={value}>{ready ? children : null}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
