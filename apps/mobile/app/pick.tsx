import type { Coordinate } from '@pewnyszlak/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import MapView from '../src/components/map/MapView';
import { Screen } from '../src/components/Screen';
import { Button, Choice, H1, P, Row, Small } from '../src/components/ui';
import { announce, useReduceMotion } from '../src/lib/a11y';
import { KRAKOW_CENTER } from '../src/lib/geo';
import { useStore } from '../src/state/store';
import { spacing } from '../src/theme';

const PRESETS: { value: string; label: string; c: Coordinate }[] = [
  { value: 'rynek', label: 'Rynek Główny', c: { latitude: 50.0617, longitude: 19.9373 } },
  { value: 'wawel', label: 'Wawel', c: { latitude: 50.0541, longitude: 19.9354 } },
  { value: 'dworzec', label: 'Dworzec Główny', c: { latitude: 50.0677, longitude: 19.9475 } },
  { value: 'kazimierz', label: 'Plac Nowy', c: { latitude: 50.0514, longitude: 19.9448 } },
  { value: 'nh', label: 'Plac Centralny (Nowa Huta)', c: { latitude: 50.0719, longitude: 20.0373 } },
];

/** Wskazanie punktu dotykiem na mapie – z alternatywą bez mapy (lista miejsc + ręczne współrzędne przez wyszukiwarkę). */
export default function PickScreen() {
  const router = useRouter();
  const store = useStore();
  const reduceMotion = useReduceMotion();
  const { target } = useLocalSearchParams<{ target: 'origin' | 'destination' }>();
  const [picked, setPicked] = useState<Coordinate | null>(null);
  const [preset, setPreset] = useState<string>('');
  const start = store.origin?.coordinate ?? store.destination?.coordinate ?? KRAKOW_CENTER;

  const confirm = () => {
    if (!picked) return;
    router.replace({ pathname: '/', params: { picked: `${picked.longitude},${picked.latitude}`, target: target ?? 'destination' } });
  };

  return (
    <Screen scroll={false}>
      <H1>{target === 'origin' ? 'Początek' : 'Cel'}: wskaż punkt</H1>
      <Small>Dotknij mapy. Bez mapy: wybierz jedno z miejsc poniżej albo wróć i użyj wyszukiwarki adresów.</Small>
      <View style={{ marginVertical: spacing(1) }}>
        <Choice label="Znane miejsca" value={preset} onChange={(v) => { setPreset(v); const p = PRESETS.find((x) => x.value === v); if (p) { setPicked(p.c); announce(`Wybrano ${p.label}`); } }} options={PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
      </View>
      <MapView
        style={{ flex: 1, minHeight: 280 }}
        center={picked ?? start}
        zoom={picked ? 16 : 14}
        markers={picked ? [{ id: 'p', coordinate: picked, kind: target === 'origin' ? 'origin' : 'destination' }] : []}
        reduceMotion={reduceMotion}
        accessibilityLabel={picked ? `Mapa z zaznaczonym punktem ${picked.latitude.toFixed(5)}, ${picked.longitude.toFixed(5)}` : 'Mapa Krakowa bez zaznaczonego punktu'}
        onPress={(c) => { setPicked(c); setPreset(''); announce(`Wybrano punkt ${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`); }}
      />
      <P style={{ marginTop: spacing(1) }}>{picked ? `Wybrany punkt: ${picked.latitude.toFixed(5)}, ${picked.longitude.toFixed(5)}` : 'Nie wybrano punktu.'}</P>
      <Row wrap style={{ marginTop: spacing(1) }}>
        <Button title="Użyj tego punktu" disabled={!picked} onPress={confirm} />
        <Button title="Anuluj" variant="secondary" onPress={() => router.back()} />
      </Row>
    </Screen>
  );
}
