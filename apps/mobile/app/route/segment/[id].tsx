import { useQuery } from '@tanstack/react-query';
import { accessibilityLabels, formatDistance, segmentKindLabels, smoothnessLabels, surfaceLabels, type RouteSegment } from '@pewnyszlak/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { api } from '../../../src/api/client';
import { EvidenceList, formatDate } from '../../../src/components/EvidenceList';
import { BarrierCard } from '../../../src/components/RouteParts';
import { Screen } from '../../../src/components/Screen';
import { Badge, Button, Card, H1, H2, Loading, P, Row, Small } from '../../../src/components/ui';
import { useFocusOnMount } from '../../../src/lib/a11y';
import { useStore } from '../../../src/state/store';
import { colors, spacing } from '../../../src/theme';

function valueText(seg: RouteSegment, field: keyof RouteSegment['accessibility']): string {
  const v = seg.accessibility[field];
  const est = seg.estimatedFields.includes(field) ? ' (szacunek z opisu)' : '';
  if (v === null || v === undefined) return 'brak danych';
  switch (field) {
    case 'steps': return v ? 'tak' : 'nie';
    case 'surface': return `${surfaceLabels[String(v)] ?? v}`;
    case 'smoothness': return `${smoothnessLabels[String(v)] ?? v}`;
    case 'incline': return `${v} %${est}`;
    case 'widthCm': return `${v} cm${est}`;
    case 'kerbHeightCm': return `${v} cm${est}`;
    case 'wheelchair': return String(v);
  }
}

export default function SegmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { route, preferences } = useStore();
  const h1 = useFocusOnMount<Text>([id]);
  const fromRoute = route?.segments.find((s) => s.id === id) ?? null;
  // Szczegóły (tagi OSM, wersja, data edycji) pobieramy z API dla pierwszej krawędzi odcinka.
  const edgeId = fromRoute?.edgeIds[0] ?? id ?? '';
  const detail = useQuery({ queryKey: ['edge', edgeId, preferences], queryFn: () => api.edge(edgeId, preferences), enabled: !!edgeId, staleTime: 5 * 60_000 });
  const seg = fromRoute ?? detail.data?.segment ?? null;

  if (!seg) {
    return <Screen><H1 ref={h1}>Odcinek</H1>{detail.isLoading ? <Loading /> : <P>Nie znaleziono odcinka {id}.</P>}<Button title="Wróć" variant="secondary" onPress={() => router.back()} /></Screen>;
  }

  const fields: (keyof RouteSegment['accessibility'])[] = ['steps', 'surface', 'smoothness', 'incline', 'widthCm', 'kerbHeightCm', 'wheelchair'];
  const osm = detail.data?.osm;
  const tags = detail.data?.tags ?? {};
  const mid = seg.geometry.coordinates[Math.floor(seg.geometry.coordinates.length / 2)]!;

  return (
    <Screen testID="screen-segment">
      <H1 ref={h1}>{segmentKindLabels[seg.kind]}{seg.name ? ` · ${seg.name}` : ''}</H1>
      <Row wrap>
        <Badge text={formatDistance(seg.lengthM)} tone="muted" />
        {seg.uncertain ? <Badge text="Odcinek niepewny" tone="warn" /> : <Badge text="Dane kompletne wg OSM" tone="ok" />}
        {detail.data?.evaluation.excluded ? <Badge text={`Wykluczony przy Twoich preferencjach: ${detail.data.evaluation.reason}`} tone="danger" /> : null}
      </Row>
      {seg.warnings.map((w) => <P key={w} style={{ color: colors.warn, marginTop: spacing(1) }}>⚠ {w}</P>)}

      <H2>Cechy dostępności</H2>
      <Card>
        {fields.map((f) => (
          <View key={f} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8 }} accessible accessibilityLabel={`${accessibilityLabels[f]}: ${valueText(seg, f)}`}>
            <Text style={{ fontSize: 16, color: colors.textMuted, flex: 1 }}>{accessibilityLabels[f]}</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: seg.accessibility[f] == null ? colors.warn : colors.text, flex: 1, textAlign: 'right' }}>{valueText(seg, f)}</Text>
          </View>
        ))}
      </Card>
      {seg.missingFields.length ? <Small>„Brak danych” oznacza, że w OpenStreetMap nikt tego nie wpisał – nie, że cecha nie występuje. Jeśli znasz ten odcinek, zgłoś barierę albo uzupełnij OSM.</Small> : null}

      <H2>Skąd to wiemy</H2>
      <EvidenceList evidence={seg.evidence} />
      {osm ? (
        <Card style={{ marginTop: spacing(1) }}>
          <P style={{ fontWeight: '700' }}>Obiekt OSM: way {osm.wayId}{osm.version ? `, wersja ${osm.version}` : ''}</P>
          <Small>Ostatnia edycja w OSM: {formatDate(osm.timestamp)} — to data zmiany w bazie map, nie data sprawdzenia w terenie.</Small>
          {seg.edgeIds.length > 1 ? <Small>Odcinek łączy {seg.edgeIds.length} krawędzi grafu (way: {Array.from(new Set(seg.wayIds)).join(', ')}).</Small> : null}
          <Small style={{ marginTop: 4 }}>Tagi: {Object.entries(tags).map(([k, v]) => `${k}=${v}`).join('; ') || '—'}</Small>
        </Card>
      ) : detail.isLoading ? <Small>Pobieram szczegóły z OSM…</Small> : detail.isError ? <Small style={{ color: colors.warn }}>Szczegóły OSM niedostępne (offline).</Small> : null}

      {seg.barriers.length ? (
        <>
          <H2>Bariery na tym odcinku</H2>
          {seg.barriers.map((b) => <BarrierCard key={b.id} barrier={b} onPress={() => router.push(`/barrier/${b.id}`)} />)}
        </>
      ) : null}

      <Row wrap style={{ marginTop: spacing(2) }}>
        <Button title="Zgłoś barierę tutaj" icon="⚑" onPress={() => router.push({ pathname: '/report', params: { lat: String(mid[1]), lon: String(mid[0]), edgeIds: seg.edgeIds.slice(0, 10).join(','), name: seg.name } })} />
        <Button title="Wróć" variant="secondary" onPress={() => router.back()} />
      </Row>
    </Screen>
  );
}
