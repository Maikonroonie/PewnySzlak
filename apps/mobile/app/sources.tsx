import { useQuery } from '@tanstack/react-query';
import type { SourceStatus } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { api, API_URL } from '../src/api/client';
import { formatDate } from '../src/components/EvidenceList';
import { MAP_ATTRIBUTION, MAP_STYLE_URL } from '../src/components/map/types';
import { Screen } from '../src/components/Screen';
import { Badge, Button, Card, H1, H2, Loading, Notice, P, Row, Small } from '../src/components/ui';
import { useFocusOnMount } from '../src/lib/a11y';
import { useStore } from '../src/state/store';
import { spacing } from '../src/theme';

const stateLabel: Record<SourceStatus['state'], { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }> = {
  available: { text: 'OK', tone: 'ok' },
  stale: { text: 'Nieodświeżane', tone: 'warn' },
  unavailable: { text: 'Niedostępne', tone: 'danger' },
  disabled: { text: 'Wyłączone', tone: 'muted' },
  never: { text: 'Brak pobrania', tone: 'muted' },
};

export default function SourcesScreen() {
  const router = useRouter();
  const { dataMode } = useStore();
  const h1 = useFocusOnMount<Text>([]);
  const q = useQuery({ queryKey: ['sources', dataMode], queryFn: api.sources, staleTime: 30_000 });

  return (
    <Screen testID="screen-sources">
      <H1 ref={h1}>Źródła</H1>
      {q.isLoading ? <Loading text="Sprawdzam źródła…" /> : null}
      {q.isError ? <Notice tone="danger" title="Serwer PewnySzlak nie odpowiada" text={`${(q.error as Error).message} Adres: ${API_URL}`} /> : null}
      {q.data ? (
        <>
          <Card style={{ marginTop: spacing(1) }}>
            <P style={{ fontWeight: '700' }}>Sieć pieszych dróg</P>
            <Small>Zasięg: {q.data.coverage}</Small>
            <Small>Wersja grafu: {q.data.graphVersion ?? 'brak'} · odcinków: {q.data.edgeCount.toLocaleString('pl-PL')}</Small>
            <Small>OSM: {formatDate(q.data.graphDataTimestamp)}</Small>
            {q.data.mode === 'demo' ? <Badge text="Demo" tone="warn" /> : null}
          </Card>
          {q.data.mode === 'demo' ? (
            <View testID="demo-scenarios-sources">
            <Card tone="warn" style={{ marginTop: spacing(1) }}>
              <P style={{ fontWeight: '700' }}>Demo: awaria źródła</P>
              <Small>psoz.pl niedostępne — używamy ostatniej kopii.</Small>
            </Card>
            </View>
          ) : null}
          <H2>Źródła</H2>
          {q.data.sources.map((s) => {
            const st = stateLabel[s.state];
            return (
              <Card key={s.source} tone={st.tone === 'muted' ? undefined : st.tone}>
                <Row wrap><P style={{ fontWeight: '700' }}>{s.name}</P><Badge text={st.text} tone={st.tone} /></Row>
                <Small>{s.message}</Small>
                <Small>{s.recordCount.toLocaleString('pl-PL')} rek. · sync: {formatDate(s.lastSuccessAt)} · próba: {formatDate(s.lastAttemptAt)}</Small>
                <Small>{s.updateFrequency} · {s.licence}</Small>
              </Card>
            );
          })}
        </>
      ) : null}
      <H2>Mapa</H2>
      <Card>
        <Small>{MAP_ATTRIBUTION}</Small>
        <Small>{MAP_STYLE_URL}</Small>
      </Card>
      <Row wrap style={{ marginTop: spacing(2) }}>
        <Button title="Odśwież" variant="secondary" onPress={() => q.refetch()} loading={q.isFetching} />
        <Button title="Wróć" variant="secondary" onPress={() => router.back()} />
      </Row>
    </Screen>
  );
}
