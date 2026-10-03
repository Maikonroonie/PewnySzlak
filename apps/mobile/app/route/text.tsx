import { formatDistance, formatDuration, segmentKindLabels } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { InstructionRow, missingSummary, routeSummaryText, segmentSummary, stateLabels } from '../../src/components/RouteParts';
import { Screen } from '../../src/components/Screen';
import { Button, Card, H1, H2, P, Row, Small } from '../../src/components/ui';
import { useFocusOnMount } from '../../src/lib/a11y';
import { useStore } from '../../src/state/store';
import { spacing } from '../../src/theme';

/** Pełnowartościowa alternatywa tekstowa: kroki, odcinki i bariery bez mapy. */
export default function RouteTextScreen() {
  const router = useRouter();
  const { route, origin, destination, lastRoute } = useStore();
  const h1 = useFocusOnMount<Text>([route?.id]);
  if (!route) {
    return (
      <Screen><H1 ref={h1}>Brak trasy</H1><Button title="Wróć do planowania" onPress={() => router.replace('/')} /></Screen>
    );
  }
  const o = origin ?? lastRoute?.origin;
  const d = destination ?? lastRoute?.destination;

  return (
    <Screen testID="screen-route-text">
      <H1 ref={h1}>Trasa krok po kroku</H1>
      <P>{o?.label ?? 'Start'} → {d?.label ?? 'Cel'}</P>
      <P>{formatDistance(route.distanceM)}, {formatDuration(route.durationSeconds)}. {routeSummaryText(route)}.</P>
      {route.mode === 'demo' ? <P>Tryb demo: część barier to dane pokazowe.</P> : null}
      <Row wrap style={{ marginVertical: spacing(1) }}>
        <Button title="Prowadź mnie" icon="◎" onPress={() => router.push('/route/guide')} />
        <Button title="Pokaż na mapie" variant="secondary" onPress={() => router.replace('/route')} />
      </Row>

      {route.warnings.length ? (
        <Card tone="warn">
          <P style={{ fontWeight: '700' }}>Ostrzeżenia</P>
          {route.warnings.map((w) => <P key={w}>• {w}</P>)}
        </Card>
      ) : null}

      <H2>Kroki ({route.steps.length})</H2>
      <View role="list">
        {route.steps.map((s, i) => <InstructionRow key={s.id} step={s} index={i} />)}
      </View>

      <H2>Odcinki i dane o nich ({route.segments.length})</H2>
      <View role="list">
        {route.segments.map((s, i) => {
          const summary = segmentSummary(s);
          const missing = missingSummary(s);
          return (
            <View key={s.id} role="listitem" style={{ marginBottom: spacing(1.5) }}>
              <P style={{ fontWeight: '700' }}>{i + 1}. {segmentKindLabels[s.kind]}{s.name ? ` – ${s.name}` : ''}, {formatDistance(s.lengthM)}</P>
              <P>{s.uncertain ? 'Odcinek niepewny.' : 'Dane kompletne wg OSM.'} {summary ? `${summary[0]!.toUpperCase()}${summary.slice(1)}.` : ''} {missing ? `${missing[0]!.toUpperCase()}${missing.slice(1)}.` : ''}</P>
              {s.barriers.map((b) => <P key={b.id}>Bariera ({stateLabels[b.state].toLowerCase()}): {b.title}.</P>)}
              {s.warnings.map((w) => <P key={w}>Uwaga: {w}</P>)}
              <Button title={`Źródła odcinka ${i + 1}`} variant="ghost" onPress={() => router.push(`/route/segment/${encodeURIComponent(s.id)}`)} style={{ alignSelf: 'flex-start' }} />
            </View>
          );
        })}
      </View>

      {route.avoidedBarriers.length ? (
        <>
          <H2>Trasa omija</H2>
          {route.avoidedBarriers.map((b) => <P key={b.id}>• {b.title} ({stateLabels[b.state].toLowerCase()}{b.isDemo ? ', demo' : ''})</P>)}
        </>
      ) : null}
      <Small style={{ marginTop: spacing(2) }}>Wyznaczono na danych OSM {route.graphVersion}. Daty edycji w OSM nie są datami sprawdzenia w terenie.</Small>
    </Screen>
  );
}
