import type { Coordinate } from '@pewnyszlak/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import MapView from '../src/components/map/MapView';
import { Screen } from '../src/components/Screen';
import { Button, H1, Row } from '../src/components/ui';
import { announce, useReduceMotion } from '../src/lib/a11y';
import { KRAKOW_CENTER } from '../src/lib/geo';
import { useStore } from '../src/state/store';
import { spacing } from '../src/theme';

/** Wskazanie punktu dotykiem na mapie. */
export default function PickScreen() {
  const router = useRouter();
  const store = useStore();
  const reduceMotion = useReduceMotion();
  const { target } = useLocalSearchParams<{ target: string }>();
  const [picked, setPicked] = useState<Coordinate | null>(null);
  const start = store.origin?.coordinate ?? store.destination?.coordinate ?? KRAKOW_CENTER;

  /** Zawsze na ekran startowy — `back()` na web/WebView często nic nie robi. */
  const goHome = () => router.replace('/');

  const confirm = () => {
    if (!picked) return;
    router.replace({ pathname: '/', params: { picked: `${picked.longitude},${picked.latitude}`, target: target ?? 'destination' } });
  };

  const title =
    target === 'origin' ? 'Początek'
      : target === 'destination' ? 'Cel'
        : 'Punkt na trasie';

  return (
    <Screen scroll={false}>
      <H1>{title}</H1>
      <MapView
        style={{ flex: 1, minHeight: 280 }}
        center={picked ?? start}
        zoom={picked ? 16 : 14}
        markers={picked ? [{ id: 'p', coordinate: picked, kind: target === 'origin' ? 'origin' : 'destination' }] : []}
        reduceMotion={reduceMotion}
        accessibilityLabel={picked ? `Mapa z zaznaczonym punktem ${picked.latitude.toFixed(5)}, ${picked.longitude.toFixed(5)}` : 'Mapa Krakowa bez zaznaczonego punktu'}
        onPress={(c) => { setPicked(c); announce(`Wybrano punkt ${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`); }}
      />
      <Row wrap style={{ marginTop: spacing(1) }}>
        <Button title="Użyj tego punktu" disabled={!picked} onPress={confirm} />
        <Button title="Anuluj" variant="secondary" onPress={goHome} />
      </Row>
    </Screen>
  );
}
