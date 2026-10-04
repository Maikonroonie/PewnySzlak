import { activityLabels, applyEffort, effortLabels, preferencesForActivity, type Activity, type Effort } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Screen } from '../src/components/Screen';
import { Button, Choice, Field, H1, H2, Row, Switch } from '../src/components/ui';
import { announce, useFocusOnMount } from '../src/lib/a11y';
import { useStore } from '../src/state/store';
import { spacing } from '../src/theme';

export default function PreferencesScreen() {
  const router = useRouter();
  const { preferences: p, setPreferences, resetPreferences, dataMode, setDataMode, textMode, setTextMode } = useStore();
  const h1 = useFocusOnMount<Text>([]);

  return (
    <Screen testID="screen-preferences">
      <H1 ref={h1}>Preferencje</H1>

      <H2>Tryb</H2>
      <Choice label="Tryb aktywności" value={p.activity} onChange={(v) => { setPreferences(preferencesForActivity(v as Activity, p)); announce(`Tryb: ${activityLabels[v as Activity]}`); }} options={(Object.keys(activityLabels) as Activity[]).map((v) => ({ value: v, label: activityLabels[v] }))} />

      {p.activity !== 'wheelchair' ? (
        <>
          <H2>Wysiłek</H2>
          <Choice label="Wysiłek" value={p.effort} onChange={(v) => { setPreferences(applyEffort({ ...p, effort: v as Effort })); announce(`Wysiłek: ${effortLabels[v as Effort]}`); }} options={(Object.keys(effortLabels) as Effort[]).map((v) => ({ value: v, label: effortLabels[v] }))} />
        </>
      ) : null}

      <H2>Co omijać</H2>
      <Switch label="Omijaj schody" value={p.avoidSteps} onChange={(v) => setPreferences({ avoidSteps: v })} />
      <Switch label="Omijaj złą nawierzchnię" value={p.avoidRoughSurface} onChange={(v) => setPreferences({ avoidRoughSurface: v })} />

      <H2>Limity</H2>
      <Field label={`Maksymalne nachylenie: ${p.maxIncline} %`}>
        <Choice label="Maksymalne nachylenie" value={p.maxIncline} onChange={(v) => setPreferences({ maxIncline: v })} options={[4, 6, 8, 10, 15, 30].map((v) => ({ value: v, label: `${v} %` }))} />
      </Field>
      <Field label={`Maksymalna wysokość krawężnika: ${p.maxKerbHeightCm} cm`}>
        <Choice label="Maksymalna wysokość krawężnika" value={p.maxKerbHeightCm} onChange={(v) => setPreferences({ maxKerbHeightCm: v })} options={[0, 2, 4, 6, 10].map((v) => ({ value: v, label: `${v} cm` }))} />
      </Field>
      <Field label={`Minimalna szerokość przejścia: ${p.minWidthCm} cm`}>
        <Choice label="Minimalna szerokość" value={p.minWidthCm} onChange={(v) => setPreferences({ minWidthCm: v })} options={[60, 70, 80, 90, 100, 120].map((v) => ({ value: v, label: `${v} cm` }))} />
      </Field>

      <H2>Gdy brak danych</H2>
      <Choice label="Odcinki bez danych" value={p.unknownPolicy} onChange={(v) => setPreferences({ unknownPolicy: v })} options={[{ value: 'penalize', label: 'Ostrzegaj' }, { value: 'exclude', label: 'Wykluczaj' }]} />

      <H2>Prezentacja</H2>
      <Switch label="Trasa jako tekst" value={textMode} onChange={setTextMode} />

      <H2>Dane</H2>
      <Choice label="Barier" value={dataMode} onChange={(v) => { setDataMode(v); announce(v === 'demo' ? 'Włączono tryb demo.' : 'Włączono dane bieżące.'); }} options={[{ value: 'live', label: 'Bieżące' }, { value: 'demo', label: 'Demo' }]} />

      <Row wrap style={{ marginTop: spacing(3) }}>
        <Button title="Gotowe" onPress={() => router.back()} />
        <Button title="Przywróć domyślne" variant="ghost" onPress={() => { resetPreferences(); announce('Przywrócono domyślne preferencje.'); }} />
      </Row>
    </Screen>
  );
}
