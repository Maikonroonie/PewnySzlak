import { formatDistance, formatDuration } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import MapView from '../../src/components/map/MapView';
import { BarrierCard, routeSummaryText, SegmentRow } from '../../src/components/RouteParts';
import { Screen } from '../../src/components/Screen';
import { Badge, Button, Card, H1, H2, Notice, P, Row, Small } from '../../src/components/ui';
import { useFocusOnMount, useReduceMotion } from '../../src/lib/a11y';
import { bboxOf } from '../../src/lib/geo';
import { useStore } from '../../src/state/store';
import { colors, spacing } from '../../src/theme';
import { formatDate } from '../../src/components/EvidenceList';

/** Identyfikator grafu `osm-YYYYMMDDTHHMMSSZ` → data importu. */
function graphDate(version: string): string {
  const m = version.match(/(\d{4})(\d{2})(\d{2})T/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : version;
}

export default function RouteScreen() {
  const router = useRouter();
  const { route, origin, destination, lastRoute, dataMode } = useStore();
  const reduceMotion = useReduceMotion();
  const h1 = useFocusOnMount<Text>([route?.id]);
  const bounds = useMemo(() => (route ? bboxOf(route.geometry.coordinates) : null), [route]);

  if (!route) {
    return (
      <Screen>
        <H1 ref={h1}>Brak trasy</H1>
        <P>Najpierw wyznacz trasę na ekranie głównym.</P>
        <Button title="Wróć do planowania" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const o = origin ?? lastRoute?.origin;
  const d = destination ?? lastRoute?.destination;
  const uncertainShare = route.distanceM > 0 ? Math.round((route.uncertainDistanceM / route.distanceM) * 100) : 0;
  const barriersOnMap = [...route.barriers, ...route.avoidedBarriers];
  const isSaved = lastRoute?.route.id === route.id && lastRoute && Date.now() - new Date(lastRoute.savedAt).getTime() > 10 * 60 * 1000;

  return (
    <Screen testID="screen-route">
      <H1 ref={h1} nativeID="route-title">{formatDistance(route.distanceM)} · {formatDuration(route.durationSeconds)}</H1>
      <P>{o?.label ?? 'Start'} → {d?.label ?? 'Cel'}</P>
      <Row wrap style={{ marginVertical: spacing(1) }}>
        {route.mode === 'demo' ? <Badge text="DEMO" tone="warn" /> : null}
        <Badge text={`${route.segments.length} odcinków`} tone="muted" />
        {route.uncertainDistanceM > 0 ? <Badge text={`${formatDistance(route.uncertainDistanceM)} (${uncertainShare} %) niepewnych`} tone="warn" /> : <Badge text="Wszystkie odcinki z kompletnymi danymi" tone="ok" />}
        {route.avoidedBarriers.length ? <Badge text={`Omija ${route.avoidedBarriers.length} barier`} tone="danger" /> : null}
      </Row>
      <Small>Wyznaczono {formatDate(route.computedAt)} na danych OSM z {graphDate(route.graphVersion)}; stan barier z {route.barrierVersion.slice(0, 16).replace('T', ' ')}.{isSaved ? ' Trasa zapisana w aplikacji – może nie uwzględniać nowych zgłoszeń.' : ''}</Small>

      {route.warnings.map((w) => <Notice key={w} tone="warn" title={w} />)}
      {!route.originSnap.verified || !route.destinationSnap.verified ? (
        <Notice tone="info" title="Dojście do punktu końcowego niezweryfikowane" text={[!route.originSnap.verified ? `Start: ${route.originSnap.note ?? `${Math.round(route.originSnap.distanceM)} m od najbliższego odcinka sieci`}` : null, !route.destinationSnap.verified ? `Cel: ${route.destinationSnap.note ?? `${Math.round(route.destinationSnap.distanceM)} m od najbliższego odcinka sieci`}` : null].filter(Boolean).join(' · ')} />
      ) : null}

      <Row wrap style={{ marginVertical: spacing(1) }}>
        <Button title="Prowadź mnie" icon="◎" onPress={() => router.push('/route/guide')} testID="start-guidance" />
        <Button title="Widok tekstowy" icon="≡" variant="secondary" onPress={() => router.push('/route/text')} testID="open-text-view" />
        <Button title="Zgłoś barierę na trasie" icon="⚑" variant="secondary" onPress={() => router.push({ pathname: '/report', params: { lat: String(route.geometry.coordinates[0]![1]), lon: String(route.geometry.coordinates[0]![0]), fromRoute: '1' } })} />
      </Row>

      <MapView
        style={{ height: 340 }}
        route={route}
        barriers={barriersOnMap}
        markers={[...(o ? [{ id: 'o', coordinate: route.originSnap.coordinate, kind: 'origin' as const }] : []), ...(d ? [{ id: 'd', coordinate: route.destinationSnap.coordinate, kind: 'destination' as const }] : [])]}
        bounds={bounds}
        reduceMotion={reduceMotion}
        accessibilityLabel={`Mapa trasy. ${routeSummaryText(route)}. Odcinki niepewne są przerywane. Pełna lista odcinków znajduje się pod mapą.`}
        onSegmentPress={(id) => router.push(`/route/segment/${encodeURIComponent(id)}`)}
        onBarrierPress={(b) => router.push(`/barrier/${b.id}`)}
      />
      <Row wrap style={{ marginTop: spacing(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 28, height: 5, backgroundColor: colors.routeOk, borderRadius: 3 }} /><Small>dane kompletne</Small></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 28, height: 5, backgroundColor: colors.routeUncertain, borderRadius: 3, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.bg }} /><Small>niepewne / brak danych</Small></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.barrierActive }} /><Small>bariera</Small></View>
      </Row>

      {route.avoidedBarriers.length ? (
        <>
          <H2>Trasa omija</H2>
          {route.avoidedBarriers.map((b) => <BarrierCard key={b.id} barrier={b} onPress={() => router.push(`/barrier/${b.id}`)} />)}
        </>
      ) : null}
      {route.barriers.length ? (
        <>
          <H2>Na trasie – zachowaj ostrożność</H2>
          {route.barriers.map((b) => <BarrierCard key={b.id} barrier={b} onPress={() => router.push(`/barrier/${b.id}`)} />)}
        </>
      ) : null}

      <H2>Odcinki trasy ({route.segments.length})</H2>
      <Small style={{ marginBottom: spacing(1) }}>Każdy odcinek ma źródło i datę. Dotknij, aby zobaczyć skąd wiemy to, co wiemy – i czego nie wiemy.</Small>
      <View role="list">
        {route.segments.map((s, i) => <View key={s.id} role="listitem"><SegmentRow segment={s} index={i} onPress={() => router.push(`/route/segment/${encodeURIComponent(s.id)}`)} /></View>)}
      </View>

      <Card style={{ marginTop: spacing(2) }}>
        <Small>Tryb danych: {dataMode === 'demo' ? 'demo' : 'bieżące'}. Czas przejścia liczony dla tempa ok. 3 km/h z dopłatą za przejścia i trudniejsze odcinki. To szacunek, nie gwarancja.</Small>
      </Card>
    </Screen>
  );
}
