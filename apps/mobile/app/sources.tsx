import { useQuery } from '@tanstack/react-query';
import type { SourceStatus } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { api, API_URL } from '../src/api/client';
import { formatDate } from '../src/components/EvidenceList';
import { MAP_ATTRIBUTION, MAP_STYLE_URL } from '../src/components/map/types';
import { Screen } from '../src/components/Screen';
import { Badge, Button, Card, H1, H2, Loading, Notice, P, Row, Small } from '../src/components/ui';
import { useFocusOnMount } from '../src/lib/a11y';
import { useStore } from '../src/state/store';
import { spacing } from '../src/theme';

const stateLabel: Record<SourceStatus['state'], { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }> = {
  available: { text: 'Dostępne', tone: 'ok' },
  stale: { text: 'Nieodświeżane – mogą być nieaktualne', tone: 'warn' },
  unavailable: { text: 'Niedostępne – używamy ostatnich pobranych danych', tone: 'danger' },
  disabled: { text: 'Wyłączone w konfiguracji', tone: 'muted' },
  never: { text: 'Jeszcze nie pobrano', tone: 'muted' },
};

export default function SourcesScreen() {
  const router = useRouter();
  const { dataMode } = useStore();
  const h1 = useFocusOnMount<Text>([]);
  const q = useQuery({ queryKey: ['sources', dataMode], queryFn: api.sources, staleTime: 30_000 });

  return (
    <Screen testID="screen-sources">
      <H1 ref={h1}>Źródła danych i ich stan</H1>
      <Small>Każda informacja w aplikacji ma źródło, datę zmiany w źródle i – osobno – datę sprawdzenia w terenie. Gdy źródło nie odpowiada, mówimy to wprost i korzystamy z ostatnich pobranych danych.</Small>
      {q.isLoading ? <Loading text="Sprawdzam źródła…" /> : null}
      {q.isError ? <Notice tone="danger" title="Serwer PewnySzlak nie odpowiada" text={`${(q.error as Error).message} Adres: ${API_URL}`} /> : null}
      {q.data ? (
        <>
          <Card style={{ marginTop: spacing(1) }}>
            <P style={{ fontWeight: '700' }}>Sieć pieszych dróg</P>
            <Small>Zasięg: {q.data.coverage}</Small>
            <Small>Wersja grafu: {q.data.graphVersion ?? 'brak'} · odcinków: {q.data.edgeCount.toLocaleString('pl-PL')}</Small>
            <Small>Stan danych OSM: {formatDate(q.data.graphDataTimestamp)} (data wyciągu; poszczególne obiekty mają własne daty edycji)</Small>
            {q.data.mode === 'demo' ? <Badge text="Tryb demo: symulowana awaria jednego źródła + bariery pokazowe" tone="warn" /> : null}
          </Card>
          <H2>Źródła</H2>
          {q.data.sources.map((s) => {
            const st = stateLabel[s.state];
            return (
              <Card key={s.source} tone={st.tone === 'muted' ? undefined : st.tone}>
                <Row wrap><P style={{ fontWeight: '700' }}>{s.name}</P><Badge text={st.text} tone={st.tone} /></Row>
                <Small>{s.message}</Small>
                <Small>Rekordów: {s.recordCount.toLocaleString('pl-PL')} · ostatnia udana synchronizacja: {formatDate(s.lastSuccessAt)} · ostatnia próba: {formatDate(s.lastAttemptAt)}</Small>
                <Small>Odświeżanie: {s.updateFrequency} · licencja: {s.licence}</Small>
              </Card>
            );
          })}
        </>
      ) : null}
      <H2>Mapa podkładowa</H2>
      <Card>
        <Small>{MAP_ATTRIBUTION}</Small>
        <Small>Styl: {MAP_STYLE_URL}</Small>
        <Small>Kafelki są pobierane na bieżąco wyłącznie dla oglądanego obszaru – aplikacja nie pobiera map masowo.</Small>
      </Card>
      <H2>Czego ta aplikacja nie robi</H2>
      <P>• Nie potwierdza, że droga jest dostępna – pokazuje, co wynika z danych i czego w nich brakuje.</P>
      <P>• Nie traktuje potwierdzeń użytkowników jako weryfikacji formalnej.</P>
      <P>• Nie zapisuje Twojej trasy GPS ani nie wymaga konta.</P>
      <Row wrap style={{ marginTop: spacing(2) }}>
        <Button title="Odśwież" variant="secondary" onPress={() => q.refetch()} loading={q.isFetching} />
        <Button title="Wróć" variant="secondary" onPress={() => router.back()} />
      </Row>
    </Screen>
  );
}
