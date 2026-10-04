import { Feather } from '@expo/vector-icons';
import { formatDistance, formatDuration, type RouteSegment } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { BrandBar } from '../../src/components/design/BrandBar';
import MapView from '../../src/components/map/MapView';
import { BarrierCard, routeSummaryText, SegmentRow } from '../../src/components/RouteParts';
import { Screen } from '../../src/components/Screen';
import { Badge, Button, Card, H1, H2, Notice, P, Row, Small, focusRing } from '../../src/components/ui';
import { useFocusOnMount, useReduceMotion } from '../../src/lib/a11y';
import { bboxOf } from '../../src/lib/geo';
import { routeHighlights, segmentDifficulty } from '../../src/lib/route-preview';
import { useRoutePreview } from '../../src/lib/useRoutePreview';
import { useStore } from '../../src/state/store';
import { colors, headingFont } from '../../src/theme';
import { formatDate } from '../../src/components/EvidenceList';
import { TerrainProfile } from '../../src/components/TerrainProfile';

export default function RouteScreen() {
  const router = useRouter();
  const { route, origin, destination, lastRoute } = useStore();
  const wide = useWindowDimensions().width >= 920;
  const reduceMotion = useReduceMotion();
  const h1 = useFocusOnMount<Text>([route?.id]);
  const bounds = useMemo(() => route ? bboxOf(route.geometry.coordinates, 0.0003) : null, [route]);
  const highlights = useMemo(() => route ? routeHighlights(route) : [], [route]);
  const preview = useRoutePreview(route, reduceMotion);
  const [selected, setSelected] = useState<string | null>(null);

  if (!route) return <Screen><BrandBar back/><H1 ref={h1}>Brak trasy</H1><P>Najpierw wyznacz trasę na ekranie głównym.</P><Button title="Wróć do planowania" onPress={() => router.replace('/')}/></Screen>;
  const o = origin ?? lastRoute?.origin, d = destination ?? lastRoute?.destination;
  const difficult = route.segments.filter(s => segmentDifficulty(s).length > 0);
  const riskLength = difficult.reduce((sum, s) => sum + s.lengthM, 0);
  const segCount = Math.max(1, route.segments.length);
  const pctSeg = (pred: (s: RouteSegment) => boolean) => Math.round(100 * route.segments.filter(pred).length / segCount);
  const osmCoverageLines = [
    `Schody ${pctSeg(s => s.accessibility.steps != null)}% · krawężnik ${pctSeg(s => s.accessibility.kerbHeightCm != null)}% · nawierzchnia ${pctSeg(s => s.accessibility.surface != null)}%`,
    `Szerokość ${pctSeg(s => s.accessibility.widthCm != null)}% · nachylenie OSM ${pctSeg(s => s.accessibility.incline != null)}%`,
    `Odcinki niepewne: ${route.segments.filter(s => s.uncertain).length} · bariery na trasie: ${route.barriers.length}${route.avoidedBarriers.length ? ` · omijane: ${route.avoidedBarriers.length}` : ''}`,
  ];
  const active = highlights.filter(h => h.progress <= (preview.progress ?? 0)).at(-1);
  const previewMarkers = [{ id: 'o', coordinate: route.originSnap.coordinate, kind: 'origin' as const }, { id: 'd', coordinate: route.destinationSnap.coordinate, kind: 'destination' as const }];

  return <Screen testID="screen-route">
    <BrandBar back/>
    <Row wrap style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
      <View style={{ flex: 1, minWidth: 260 }}>
        <Text style={{ fontSize: 12, color: colors.textMuted, letterSpacing: 1.2, fontWeight: '700', marginBottom: 8 }}>TRASA</Text>
        <H1 ref={h1} nativeID="route-title" style={{ fontFamily: headingFont, fontSize: wide ? 40 : 32, fontWeight: '800', letterSpacing: -1.1 }}>{formatDistance(route.distanceM)} · {formatDuration(route.durationSeconds)}</H1>
        <P muted style={{ fontSize: 15 }}>{o?.label ?? 'Start'} → {d?.label ?? 'Cel'}</P>
      </View>
      <Row wrap style={{ marginTop: 12 }}>{route.mode === 'demo' ? <Badge text="DEMO" tone="warn"/> : null}<Button title="Prowadź mnie" icon="◎" onPress={() => router.push('/route/guide')} testID="start-guidance"/><Button title="Widok tekstowy" icon="≡" variant="secondary" onPress={() => router.push('/route/text')} testID="open-text-view"/></Row>
    </Row>

    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <MapView testID="route-map-3d" style={{ height: wide ? 530 : 410 }} route={route} barriers={[...route.barriers, ...route.avoidedBarriers]} markers={previewMarkers} bounds={bounds} previewProgress={preview.progress} previewPlaying={preview.playing} selectedSegmentId={preview.playing ? active?.segmentId : selected} onInteract={preview.pause} reduceMotion={reduceMotion}
          accessibilityLabel={`Mapa 3D. ${routeSummaryText(route)}. Czerwone odcinki mają rozpoznane utrudnienia, przerywane bursztynowe oznaczają niepełne dane. Przelot jest podglądem, a nie lokalizacją GPS.`}
          onSegmentPress={id => { preview.pause(); router.push(`/route/segment/${encodeURIComponent(id)}`); }} onBarrierPress={b => { preview.pause(); router.push(`/barrier/${b.id}`); }}/>
        <View style={{ backgroundColor: colors.paper, borderRadius: 22, padding: 18, marginTop: 12, borderWidth: 1, borderColor: colors.border }}>
          <Row wrap style={{ justifyContent: 'space-between', marginBottom: 14 }}><View><Text style={{ fontWeight: '700', fontSize: 17, color: colors.text }}>Przelot 3D</Text><Small>Podgląd trasy — bez GPS</Small></View></Row>
          <View accessibilityRole="progressbar" accessibilityLabel="Postęp podglądu trasy" accessibilityValue={{ min: 0, max: 100, now: Math.round((preview.progress ?? 0) * 100) }} style={{ height: 5, backgroundColor: colors.surface, borderRadius: 3, marginBottom: 16 }}><View style={{ height: 5, width: `${(preview.progress ?? 0) * 100}%`, borderRadius: 3, backgroundColor: colors.primary }}/></View>
          <Row wrap>
            <Button title={preview.playing ? 'Wstrzymaj przelot' : preview.progress === 1 ? 'Odtwórz ponownie' : 'Odtwórz przelot 3D'} icon={preview.playing ? 'Ⅱ' : '▶'} onPress={preview.toggle} disabled={reduceMotion} testID="preview-play"/>
            <Button title={`${preview.speed}×`} accessibilityLabel={`Tempo podglądu ${preview.speed} razy. Zmień tempo`} variant="secondary" onPress={preview.changeSpeed}/>
            <Button title="Cała trasa" variant="ghost" onPress={() => { preview.reset(); setSelected(null); }}/>
          </Row>
          <Row wrap style={{ marginTop: 10 }}><Button title="Cofnij 10%" variant="ghost" onPress={() => preview.seek((preview.progress ?? 0) - 0.1)} disabled={preview.progress == null || preview.progress <= 0}/><Button title="Dalej 10%" variant="ghost" onPress={() => preview.seek((preview.progress ?? 0) + 0.1)} disabled={preview.progress === 1}/></Row>
          {reduceMotion ? <Small>Ograniczenie ruchu jest włączone. Oglądaj trasę przyciskami lub wybierz odcinek.</Small> : null}
        </View>
      </View>
      <View style={{ width: wide ? 310 : undefined, gap: 14 }}>
        <View style={{ backgroundColor: colors.paper, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, color: colors.text }}>Podsumowanie ryzyka</Text>
          <Small>{difficult.length ? `${formatDistance(riskLength)} z rozpoznanymi utrudnieniami · ${difficult.length} odc.` : 'Brak odcinków z rozpoznanymi utrudnieniami.'}</Small>
          <Small>{formatDistance(route.unknownDistanceM)} bez pełnych danych OSM (nawierzchnia / próg / szerokość).</Small>
        </View>
        <View style={{ backgroundColor: colors.paper, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: colors.textMuted, marginBottom: 14 }}>WAŻNE PUNKTY</Text>
          {highlights.length === 0 ? <Small>Brak wyróżnionych odcinków — sprawdź listę poniżej.</Small> : highlights.map((h, i) => <Pressable key={h.id} accessibilityRole="button" accessibilityLabel={`Pokaż etap ${i + 1}: ${h.title}, ${h.name}`} onPress={() => { setSelected(h.segmentId); preview.seek(h.progress); }} style={s => [{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: i < highlights.length - 1 ? 1 : 0, borderColor: colors.border, borderRadius: 10, backgroundColor: selected === h.id ? colors.bg : 'transparent' }, focusRing(s)]}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: h.uncertain ? '#F5EBCF' : '#FAE2DB', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: h.uncertain ? colors.warn : colors.danger, fontSize: 12, fontWeight: '700' }}>{String(i + 1).padStart(2, '0')}</Text></View><View style={{ flex: 1 }}><Text style={{ color: h.uncertain ? colors.warn : colors.danger, fontSize: 14, fontWeight: '700' }}>{h.title}</Text><Small>{h.name}</Small><Small style={{ fontSize: 11 }}>Po {formatDistance(h.distanceM)} od startu</Small></View><Feather name="arrow-up-right" size={15} color={colors.textMuted}/>
          </Pressable>)}
        </View>
      </View>
    </View>
    <Row wrap style={{ marginVertical: 18, gap: 20 }}><Legend color={colors.routeOk} label="Trasa"/><Legend color={colors.routeDifficult} label="Rozpoznane utrudnienie"/><Legend color={colors.routeUncertain} label="Brak danych / niepewność" dashed/></Row>
    <TerrainProfile route={route}/>
    <Card style={{ marginTop: 16, padding: 18 }}>
      <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text, marginBottom: 8 }}>Pokrycie danych OSM</Text>
      <Small style={{ marginBottom: 10 }}>Udział odcinków z wpisem w OSM — nie gwarancja dostępności. Nachylenie terenu: profil NMT poniżej.</Small>
      {osmCoverageLines.map((line, i) => <Small key={i}>{line}</Small>)}
    </Card>
    {(d?.placeId?.startsWith('msip-') || d?.placeId?.startsWith('verified-') || /zabytek|heritage|ewidencj/i.test(d?.label ?? '')) ? (
      <Row wrap style={{ marginTop: 8 }}>
        <Badge text={d?.placeId?.startsWith('msip-') ? 'Cel: zabytek (ewidencja MSIP)' : d?.placeId?.startsWith('verified-') ? 'Cel: sprawdzone w terenie' : 'Cel z mapy zabytków'} tone="ok" />
      </Row>
    ) : null}
    <Row wrap style={{ justifyContent: 'space-between', marginTop: 24 }}><H2>Szczegóły trasy</H2><Button title="Zgłoś barierę na trasie" icon="⚑" variant="secondary" onPress={() => router.push({ pathname: '/report', params: { lat: String(route.geometry.coordinates[0]![1]), lon: String(route.geometry.coordinates[0]![0]), fromRoute: '1', quick: '1' } })}/></Row>
    <Small style={{ marginBottom: 16 }}>Wyznaczono {formatDate(route.computedAt)}. Kolory = dostępne dane, nie gwarancja dostępności.</Small>
    {route.warnings.map((w, i) => <Notice key={`rw-${i}`} tone="warn" title={w}/>)}
    {!route.destinationSnap.verified ? (
      <Notice tone="info" title="Dojście do drzwi niezweryfikowane" text={`Trasa kończy się na sieci pieszej OSM (~${Math.round(route.destinationSnap.distanceM)} m od wskazanego punktu). ${route.destinationSnap.note ?? ''} Wejście do budynku może wymagać dodatkowej weryfikacji.`.trim()} />
    ) : null}
    {!route.originSnap.verified ? <Notice tone="info" title="Start snapa niezweryfikowany" text={route.originSnap.note ?? 'Punkt startu daleko od chodnika w danych.'} /> : null}
    {route.avoidedBarriers.length ? <><H2>Omijane bariery</H2>{route.avoidedBarriers.map(b => <BarrierCard key={b.id} barrier={b} compact onPress={() => router.push(`/barrier/${b.id}`)}/>)}</> : null}
    {route.barriers.length ? <><H2>Bariery na trasie</H2>{route.barriers.map(b => <BarrierCard key={b.id} barrier={b} compact onPress={() => router.push(`/barrier/${b.id}`)}/>)}</> : null}
    <H2>Odcinki ({route.segments.length})</H2><Small style={{ marginBottom: 14 }}>Dotknij, aby zobaczyć parametry i źródła.</Small>
    <View role="list">{route.segments.map((s, i) => <View key={s.id} role="listitem"><SegmentRow segment={s} index={i} onPress={() => router.push(`/route/segment/${encodeURIComponent(s.id)}`)}/></View>)}</View>
  </Screen>;
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return <Row><View style={{ width: 22, height: 4, backgroundColor: color, borderRadius: 2, ...(dashed ? { borderStyle: 'dashed', borderWidth: 1, borderColor: colors.bg } : {}) }}/><Small style={{ fontSize: 12 }}>{label}</Small></Row>;
}
