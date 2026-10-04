import { useQuery } from '@tanstack/react-query';
import { accessibilityLabels, formatDistance, segmentFeatureGrid, segmentKindLabels, smoothnessLabels, surfaceLabels, wheelchairLabel, type RouteSegment } from '@pewnyszlak/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { api } from '../../../src/api/client';
import { AmenityGrid } from '../../../src/components/AmenityGrid';
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
    case 'wheelchair': return wheelchairLabel(v as RouteSegment['accessibility']['wheelchair']) ?? String(v);
  }
}

export default function SegmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { route, preferences } = useStore();
  const h1 = useFocusOnMount<Text>([id]);
  const [showRaw, setShowRaw] = useState(false);
  const fromRoute = route?.segments.find((s) => s.id === id) ?? null;
  const edgeId = fromRoute?.edgeIds[0] ?? id ?? '';
  const detail = useQuery({ queryKey: ['edge', edgeId, preferences], queryFn: () => api.edge(edgeId, preferences), enabled: !!edgeId, staleTime: 5 * 60_000 });
  const seg = fromRoute ?? detail.data?.segment ?? null;

  if (!seg) {
    return <Screen><H1 ref={h1}>Odcinek</H1>{detail.isLoading ? <Loading /> : <P>Nie znaleziono odcinka {id}.</P>}<Button title="Wróć" variant="secondary" onPress={() => router.back()} /></Screen>;
  }

  const fields: (keyof RouteSegment['accessibility'])[] = ['steps', 'surface', 'smoothness', 'incline', 'widthCm', 'kerbHeightCm', 'wheelchair'];
  const osm = detail.data?.osm;
  const tags = detail.data?.tags ?? {};
  const facts = detail.data?.facts ?? [];
  const coverage = detail.data?.coverage;
  const terrain = detail.data?.terrain;
  const mid = seg.geometry.coordinates[Math.floor(seg.geometry.coordinates.length / 2)]!;
  const known = fields.filter((f) => seg.accessibility[f] != null);
  const missing = fields.filter((f) => seg.accessibility[f] == null);

  return (
    <Screen testID="screen-segment">
      <H1 ref={h1}>{segmentKindLabels[seg.kind]}{seg.name ? ` · ${seg.name}` : ''}</H1>
      <Row wrap>
        <Badge text={formatDistance(seg.lengthM)} tone="muted" />
        {coverage ? <Badge text={coverage.label} tone={coverage.known >= 4 ? 'ok' : 'warn'} /> : null}
        {seg.uncertain ? <Badge text="Odcinek niepewny" tone="warn" /> : null}
        {detail.data?.evaluation.excluded ? <Badge text={`Poza limitami: ${detail.data.evaluation.reason}`} tone="danger" /> : null}
      </Row>

      {seg.warnings.map((w, i) => <P key={`${i}-${w}`} style={{ color: colors.warn, marginTop: spacing(1) }}>⚠ {w}</P>)}

      <H2>Cechy dostępności</H2>
      <AmenityGrid cells={segmentFeatureGrid(seg.accessibility, {
        ramp: seg.kind === 'ramp' ? true : tags.ramp === 'yes' || tags['ramp:wheelchair'] === 'yes' ? true : null,
        elevator: seg.kind === 'elevator' ? true : tags.elevator === 'yes' ? true : null,
      })} />

      <H2>Dane odcinka</H2>
      {detail.isLoading && facts.length === 0 ? <Loading /> : null}
      <Card>
        {(facts.length ? facts : known.map((f) => ({
          id: f,
          label: accessibilityLabels[f],
          value: valueText(seg, f),
          tone: (seg.accessibility[f] == null ? 'warn' : 'muted') as 'warn' | 'muted',
          via: 'OpenStreetMap',
        }))).map((f) => (
          <View key={f.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 2 }} accessible accessibilityLabel={`${f.label}: ${f.value}`}>
            <Row wrap style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 15, color: colors.textMuted, flex: 1 }}>{f.label}</Text>
              <Small style={{ fontSize: 11 }}>{f.via}</Small>
            </Row>
            <Text style={{ fontSize: 16, fontWeight: '700', color: f.tone === 'warn' || f.tone === 'danger' ? colors.warn : colors.text }}>{f.value}</Text>
          </View>
        ))}
      </Card>

      {missing.length ? (
        <Card tone="warn" style={{ marginTop: spacing(1.5) }}>
          <P style={{ fontWeight: '700' }}>Czego OSM nie mówi</P>
          <Small style={{ marginTop: 4 }}>{missing.map((f) => accessibilityLabels[f]).join(' · ')}</Small>
          <Small style={{ marginTop: 6 }}>Brak wpisu ≠ brak bariery. Możesz zgłosić obserwację albo uzupełnić OpenStreetMap.</Small>
        </Card>
      ) : null}

      {terrain ? (
        <Card style={{ marginTop: spacing(1.5) }}>
          <P style={{ fontWeight: '700' }}>Profil terenu (NMT)</P>
          {terrain.inclinePct != null ? (
            <P style={{ marginTop: 6 }}>Szacunkowe nachylenie gruntu: ok. {terrain.inclinePct}% ({terrain.startM} → {terrain.endM} m n.p.m.)</P>
          ) : <Small style={{ marginTop: 6 }}>Nie udało się odczytać wysokości dla końców odcinka.</Small>}
          <Small style={{ marginTop: 6 }}>{terrain.warning}</Small>
          <Button title="Źródło GUGiK NMT" variant="ghost" onPress={() => Linking.openURL('https://www.geoportal.gov.pl/pl/dane/numeryczny-model-terenu-nmt/')} style={{ marginTop: 8 }} />
        </Card>
      ) : null}

      <H2>Skąd to wiemy</H2>
      <EvidenceList evidence={seg.evidence.length ? seg.evidence : (detail.data?.segment.evidence ?? [])} />
      {osm ? (
        <Card style={{ marginTop: spacing(1) }}>
          <P style={{ fontWeight: '700' }}>Obiekt OSM: way/{osm.wayId}{osm.version ? `, wersja ${osm.version}` : ''}</P>
          <Small>Ostatnia edycja w OSM: {formatDate(osm.timestamp)} — to data zmiany mapy, nie sprawdzenia w terenie.</Small>
          {seg.edgeIds.length > 1 ? <Small>Odcinek łączy {seg.edgeIds.length} krawędzi grafu.</Small> : null}
          <Button title={showRaw ? 'Ukryj surowe tagi' : 'Pokaż surowe tagi OSM'} variant="ghost" onPress={() => setShowRaw((v) => !v)} style={{ marginTop: 8 }} />
          {showRaw ? <Small style={{ marginTop: 4 }}>{Object.entries(tags).map(([k, v]) => `${k}=${v}`).join('; ') || '—'}</Small> : null}
        </Card>
      ) : detail.isLoading ? <Small>Pobieram szczegóły…</Small> : detail.isError ? <Small style={{ color: colors.warn }}>Szczegóły niedostępne (offline).</Small> : null}

      {(seg.barriers.length || (detail.data?.segment.barriers.length ?? 0)) ? (
        <>
          <H2>Bariery w okolicy odcinka</H2>
          {(detail.data?.segment.barriers ?? seg.barriers).map((b) => <BarrierCard key={b.id} barrier={b} onPress={() => router.push(`/barrier/${b.id}`)} />)}
        </>
      ) : (
        <Small style={{ marginTop: spacing(1) }}>Brak zgłoszonych barier w promieniu ~45 m od środka odcinka.</Small>
      )}

      <Row wrap style={{ marginTop: spacing(2) }}>
        <Button title="Zgłoś barierę tutaj" icon="⚑" onPress={() => router.push({ pathname: '/report', params: { lat: String(mid[1]), lon: String(mid[0]), edgeIds: seg.edgeIds.slice(0, 10).join(','), name: seg.name, quick: '1' } })} />
        <Button title="Wróć" variant="secondary" onPress={() => router.back()} />
      </Row>
    </Screen>
  );
}
