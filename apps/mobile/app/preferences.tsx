import { DEFAULT_PREFERENCES } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Screen } from '../src/components/Screen';
import { Button, Card, Choice, Field, H1, H2, P, Row, Small, Switch } from '../src/components/ui';
import { announce, useFocusOnMount } from '../src/lib/a11y';
import { useStore } from '../src/state/store';
import { spacing } from '../src/theme';

export default function PreferencesScreen() {
  const router = useRouter();
  const { preferences: p, setPreferences, resetPreferences, dataMode, setDataMode, textMode, setTextMode } = useStore();
  const h1 = useFocusOnMount<Text>([]);

  return (
    <Screen testID="screen-preferences">
      <H1 ref={h1}>Moje preferencje</H1>
      <Small>Ustawienia dotyczą tylko trasy. Nie pytamy o stan zdrowia ani nie zakładamy konta – wszystko zostaje na tym urządzeniu.</Small>

      <Card style={{ marginTop: spacing(2) }}>
        <P style={{ fontWeight: '700' }}>Szybkie ustawienie</P>
        <Small>Wózek ręczny: nachylenie ≤ 6 %, krawężnik ≤ 2 cm, szerokość ≥ 90 cm, bez schodów.</Small>
        <Row wrap style={{ marginTop: spacing(1) }}>
          <Button title="Ustaw dla wózka" variant="secondary" onPress={() => { setPreferences(DEFAULT_PREFERENCES); announce('Ustawiono preferencje dla wózka.'); }} />
          <Button title="Komfortowy spacer" variant="secondary" onPress={() => { setPreferences({ avoidSteps: true, avoidRoughSurface: false, maxIncline: 10, maxKerbHeightCm: 6, minWidthCm: 60, unknownPolicy: 'penalize' }); announce('Ustawiono preferencje: komfortowy spacer.'); }} />
          <Button title="Wózek dziecięcy" variant="secondary" onPress={() => { setPreferences({ avoidSteps: true, avoidRoughSurface: true, maxIncline: 8, maxKerbHeightCm: 4, minWidthCm: 70, unknownPolicy: 'penalize' }); announce('Ustawiono preferencje dla wózka dziecięcego.'); }} />
        </Row>
      </Card>

      <H2>Co omijać</H2>
      <Switch label="Omijaj schody" hint="Odcinki oznaczone jako schody są wykluczone z trasy." value={p.avoidSteps} onChange={(v) => setPreferences({ avoidSteps: v })} />
      <Switch label="Omijaj złą nawierzchnię" hint="Kocie łby, żwir, piasek i nawierzchnie opisane jako bardzo nierówne." value={p.avoidRoughSurface} onChange={(v) => setPreferences({ avoidRoughSurface: v })} />

      <H2>Limity</H2>
      <Field label={`Maksymalne nachylenie: ${p.maxIncline} %`} hint="Dotyczy odcinków z danymi o nachyleniu; o brakujących informujemy osobno.">
        <Choice label="Maksymalne nachylenie" value={p.maxIncline} onChange={(v) => setPreferences({ maxIncline: v })} options={[4, 6, 8, 10, 15].map((v) => ({ value: v, label: `${v} %` }))} />
      </Field>
      <Field label={`Maksymalna wysokość krawężnika: ${p.maxKerbHeightCm} cm`} hint="Krawężnik bez podanej wysokości szacujemy z opisu (np. „obniżony” ≈ 2 cm) i oznaczamy jako szacunek.">
        <Choice label="Maksymalna wysokość krawężnika" value={p.maxKerbHeightCm} onChange={(v) => setPreferences({ maxKerbHeightCm: v })} options={[0, 2, 4, 6, 10].map((v) => ({ value: v, label: `${v} cm` }))} />
      </Field>
      <Field label={`Minimalna szerokość przejścia: ${p.minWidthCm} cm`}>
        <Choice label="Minimalna szerokość" value={p.minWidthCm} onChange={(v) => setPreferences({ minWidthCm: v })} options={[60, 70, 80, 90, 100, 120].map((v) => ({ value: v, label: `${v} cm` }))} />
      </Field>

      <H2>Gdy brak danych</H2>
      <Small style={{ marginBottom: spacing(1) }}>Większość chodników w OSM nie ma pełnych danych o krawężnikach i nachyleniu. Zdecyduj, jak to traktować.</Small>
      <Choice label="Odcinki bez danych" value={p.unknownPolicy} onChange={(v) => setPreferences({ unknownPolicy: v })} options={[{ value: 'penalize', label: 'Pokazuj i ostrzegaj (zalecane)' }, { value: 'exclude', label: 'Wykluczaj (trasa może nie istnieć)' }]} />

      <H2>Prezentacja</H2>
      <Switch label="Domyślnie pokazuj trasę jako tekst" hint="Po wyznaczeniu trasy otwiera się lista kroków zamiast mapy." value={textMode} onChange={setTextMode} />

      <H2>Dane</H2>
      <Choice label="Źródło danych o barierach" value={dataMode} onChange={(v) => { setDataMode(v); announce(v === 'demo' ? 'Włączono tryb demo: prawdziwa mapa i scenariusze pokazowe barier.' : 'Włączono dane bieżące.'); }} options={[{ value: 'live', label: 'Bieżące' }, { value: 'demo', label: 'Demo (scenariusz pokazowy)' }]} />
      <Small style={{ marginTop: spacing(1) }}>Tryb demo używa prawdziwej sieci dróg z OSM i dodaje odizolowany zestaw barier pokazowych (remont na Grodzkiej, sporny krawężnik, nieaktualne zgłoszenie windy, sygnał z przetargu) oraz symuluje awarię jednego źródła. Nic z demo nie trafia do danych bieżących.</Small>

      <Row wrap style={{ marginTop: spacing(3) }}>
        <Button title="Gotowe" onPress={() => router.back()} />
        <Button title="Przywróć domyślne" variant="ghost" onPress={() => { resetPreferences(); announce('Przywrócono domyślne preferencje.'); }} />
      </Row>
    </Screen>
  );
}
