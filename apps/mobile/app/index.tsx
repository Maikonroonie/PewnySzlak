import { Feather } from '@expo/vector-icons';
import { activityLabels, barrierTypeLabels, clampExploreRadiusM, exploreRadiusOptions, formatDistance, preferencesForActivity, type Activity, type Barrier, type Coordinate } from '@pewnyszlak/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '../src/api/client';
import { BrandBar } from '../src/components/design/BrandBar';
import MapView from '../src/components/map/MapView';
import { PlaceSearch } from '../src/components/PlaceSearch';
import { routeSummaryText, stateLabels } from '../src/components/RouteParts';
import { Screen } from '../src/components/Screen';
import { Badge, Button, Card, Choice, H1, Notice, P, Row, Small, Switch, focusRing } from '../src/components/ui';
import { announce, useFocusOnMount, useReduceMotion } from '../src/lib/a11y';
import { bboxOf, KRAKOW_CENTER } from '../src/lib/geo';
import { useStore, type Point } from '../src/state/store';
import { colors, headingFont } from '../src/theme';

const MORE_ACTIVITIES: { id: Activity; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { id: 'wheelchair', icon: 'circle' },
  { id: 'skates', icon: 'disc' },
  { id: 'walk', icon: 'navigation' },
  { id: 'run', icon: 'activity' },
];

/** Progi nachylenia w zaawansowanych – nazwa + dokładna wartość przy focus/hover. */
const INCLINE_LEVELS = [
  { id: 'low', label: 'Niskie', maxIncline: 4 },
  { id: 'mid', label: 'Średnie', maxIncline: 6 },
  { id: 'high', label: 'Wysokie', maxIncline: 8 },
  { id: 'very', label: 'Bardzo wysokie', maxIncline: 12 },
] as const;

function inclineLevelId(maxIncline: number): (typeof INCLINE_LEVELS)[number]['id'] {
  let best: (typeof INCLINE_LEVELS)[number] = INCLINE_LEVELS[0]!;
  for (const lv of INCLINE_LEVELS) {
    if (Math.abs(lv.maxIncline - maxIncline) < Math.abs(best.maxIncline - maxIncline)) best = lv;
  }
  return best.id;
}

function cleanBarrierTitle(title: string): string {
  return title.replace(/^DEMO:\s*/i, '').trim();
}

export default function PlannerScreen() {
  const router = useRouter();
  const store = useStore();
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ picked?: string; target?: string }>();
  const h1 = useFocusOnMount<Text>([]);
  const [noRoute, setNoRoute] = useState<{ explanation: string; suggestions: string[]; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [showMoreModes, setShowMoreModes] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inclineHint, setInclineHint] = useState<string | null>(null);

  useEffect(() => {
    if (!params.picked || !params.target) return;
    const [lon, lat] = params.picked.split(',').map(Number);
    if (lon == null || lat == null || Number.isNaN(lon) || Number.isNaN(lat)) return;
    const c: Coordinate = { longitude: lon, latitude: lat };
    const point: Point = { coordinate: c, label: `Punkt na mapie (${lat.toFixed(5)}, ${lon.toFixed(5)})` };
    assignPoint(store, params.target, point);
    api.reverse(c).then((r) => {
      if (!r.place) return;
      assignPoint(store, params.target!, { ...point, label: `Przy: ${r.place.name}${r.place.address ? `, ${r.place.address}` : ''}` });
    }).catch(() => {});
    router.setParams({ picked: undefined, target: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.picked, params.target]);

  const center = store.origin?.coordinate ?? store.destination?.coordinate ?? KRAKOW_CENTER;
  const barriersQ = useQuery({ queryKey: ['barriers-near', store.dataMode, center.latitude.toFixed(3), center.longitude.toFixed(3)], queryFn: () => api.barriersNear(center, 600), staleTime: 60_000 });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000, retry: 0 });

  const plan = useMutation({
    mutationFn: () => api.route(store.origin!.coordinate, store.destination!.coordinate, store.preferences, store.waypoints.map((w) => w.coordinate)),
    onMutate: () => { setNoRoute(null); setError(null); announce('Wyznaczam trasę…'); },
    onSuccess: (route) => {
      store.setRoute(route);
      store.addRecent(store.destination!);
      announce(routeSummaryText(route));
      router.push(store.textMode ? '/route/text' : '/route');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.noRoute) { setNoRoute(e.noRoute); announce(`Brak trasy. ${e.noRoute.explanation}`); }
      else { setError(e instanceof Error ? e.message : 'Nieznany błąd'); announce(`Błąd: ${e instanceof Error ? e.message : ''}`); }
    },
  });

  const markers = useMemo(() => [
    ...(store.origin ? [{ id: 'o', coordinate: store.origin.coordinate, kind: 'origin' as const, label: 'S' }] : []),
    ...store.waypoints.map((w, i) => ({ id: `w${i}`, coordinate: w.coordinate, kind: 'waypoint' as const, label: String.fromCharCode(65 + i) })),
    ...(store.destination ? [{ id: 'd', coordinate: store.destination.coordinate, kind: 'destination' as const, label: 'C' }] : []),
  ], [store.origin, store.destination, store.waypoints]);
  const bounds = useMemo(() => (markers.length >= 2 ? bboxOf(markers.map((m) => [m.coordinate.longitude, m.coordinate.latitude] as [number, number]), 0.004) : null), [markers]);
  const prefs = store.preferences;
  const barriers: Barrier[] = barriersQ.data?.items ?? [];
  const offline = health.isError;
  const demoConflict = barriers.find((b) => b.isDemo && (b.evidence.some((e) => e.status === 'conflicting') || (b.confirmationCount > 0 && b.rejectionCount > 0)));
  const demoStale = barriers.find((b) => b.isDemo && b.evidence.some((e) => e.isStale));
  const demoRemont = barriers.find((b) => b.isDemo && b.blocksRouting);
  const selectedIncline = inclineLevelId(prefs.maxIncline);
  const radiusOpts = exploreRadiusOptions(prefs.activity);
  const radiusM = clampExploreRadiusM(prefs.activity, store.exploreRadiusM);

  useEffect(() => {
    if (radiusM !== store.exploreRadiusM) store.setExploreRadiusM(radiusM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.activity, radiusM]);

  return (
    <Screen testID="screen-planner">
      <BrandBar />
      <H1 ref={h1} nativeID="planner-title" style={{ fontFamily: headingFont, fontSize: 32, lineHeight: 38, letterSpacing: -1.1, fontWeight: '800' }}>Poznaj Kraków według komfortu</H1>
      {offline ? <Badge text="Offline" tone="danger" /> : null}
      {store.dataMode === 'demo' ? <Badge text="Demo" tone="warn" /> : null}

      {offline ? (
        <Notice
          tone="warn"
          title="Serwer niedostępny"
          text={store.lastRoute ? `Ostatnia trasa z ${new Date(store.lastRoute.savedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}.` : 'Sprawdź połączenie z API.'}
        />
      ) : null}
      {offline && store.lastRoute ? (
        <Card style={{ marginTop: 8 }}>
          <P style={{ fontWeight: '700' }}>Zapisana trasa</P>
          <Small>{store.lastRoute.origin.label} → {store.lastRoute.destination.label}</Small>
          <Button title="Otwórz" onPress={() => { store.setRoute(store.lastRoute!.route); router.push('/route'); }} style={{ marginTop: 8 }} />
        </Card>
      ) : null}

      <Text style={local.kicker}>TRYB</Text>
      <View style={local.activityRow}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: prefs.activity === 'bike' }}
          aria-checked={prefs.activity === 'bike'}
          accessibilityLabel={activityLabels.bike}
          onPress={() => { store.setPreferences(preferencesForActivity('bike', prefs)); store.setRoute(null); announce('Tryb: Rower'); }}
          style={(st) => [local.activity, prefs.activity === 'bike' && local.activityOn, focusRing(st)]}
        >
          <Feather name="send" size={18} color={prefs.activity === 'bike' ? '#FFFFFF' : colors.text} />
          <Text style={[local.activityTxt, prefs.activity === 'bike' && { color: '#FFFFFF' }]}>{activityLabels.bike}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showMoreModes ? 'Ukryj inne tryby' : 'Więcej trybów'}
          onPress={() => setShowMoreModes((v) => !v)}
          style={(st) => [local.activity, focusRing(st)]}
        >
          <Feather name={showMoreModes ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text} />
          <Text style={local.activityTxt}>{showMoreModes ? 'Mniej' : 'Więcej'}</Text>
        </Pressable>
      </View>
      {showMoreModes ? (
        <View style={[local.activityRow, { marginTop: 8 }]}>
          {MORE_ACTIVITIES.map((a) => {
            const on = prefs.activity === a.id;
            return (
              <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} accessibilityLabel={activityLabels[a.id]} onPress={() => { store.setPreferences(preferencesForActivity(a.id, prefs)); store.setRoute(null); announce(`Tryb: ${activityLabels[a.id]}`); }} style={(st) => [local.activity, on && local.activityOn, focusRing(st)]}>
                <Feather name={a.icon} size={18} color={on ? '#FFFFFF' : colors.text} />
                <Text style={[local.activityTxt, on && { color: '#FFFFFF' }]}>{activityLabels[a.id]}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!showAdvanced ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zaawansowane limity komfortu"
          onPress={() => setShowAdvanced(true)}
          style={(st) => [local.advancedLink, focusRing(st)]}
        >
          <Text style={local.advancedLinkTxt}>Zaawansowane</Text>
          <Feather name="chevron-right" size={16} color={colors.textMuted} />
        </Pressable>
      ) : (
        <Card style={{ paddingVertical: 14, marginTop: 16 }}>
          <Switch label="Omijaj schody" value={prefs.avoidSteps} onChange={(v) => { store.setPreferences({ avoidSteps: v }); store.setRoute(null); }} />
          <Switch label="Omijaj złą nawierzchnię" hint={prefs.activity === 'skates' ? 'Rolki: tylko równa nawierzchnia.' : undefined} value={prefs.avoidRoughSurface} onChange={(v) => { store.setPreferences({ avoidRoughSurface: v }); store.setRoute(null); }} />

          <Text style={[local.kicker, { marginTop: 14 }]}>NACHYLENIE</Text>
          {inclineHint ? <Text style={local.inclineHint}>{inclineHint}</Text> : <Text style={local.inclineHintMuted}>Najedź lub zaznacz poziom</Text>}
          <View style={local.activityRow}>
            {INCLINE_LEVELS.map((lv) => {
              const on = selectedIncline === lv.id;
              const detail = `do ${lv.maxIncline}%`;
              return (
                <Pressable
                  key={lv.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${lv.label}, ${detail}`}
                  onPress={() => {
                    store.setPreferences({ maxIncline: lv.maxIncline });
                    store.setRoute(null);
                    setInclineHint(`${lv.label} · ${detail}`);
                    announce(`Nachylenie: ${lv.label}, ${detail}`);
                  }}
                  onHoverIn={() => setInclineHint(`${lv.label} · ${detail}`)}
                  onHoverOut={() => setInclineHint(on ? `${lv.label} · ${detail}` : null)}
                  onFocus={() => setInclineHint(`${lv.label} · ${detail}`)}
                  onBlur={() => { if (!on) setInclineHint(null); }}
                  style={(st) => [local.level, on && local.levelOn, focusRing(st)]}
                >
                  <Text style={[local.levelTxt, on && { color: '#FFFFFF' }]}>{lv.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Small style={{ marginTop: 14, marginBottom: 4 }}>Krawężnik</Small>
          <Choice label="Maksymalna wysokość krawężnika" value={prefs.maxKerbHeightCm} onChange={(v) => { store.setPreferences({ maxKerbHeightCm: v }); store.setRoute(null); }} options={[0, 2, 4, 6, 10].map((v) => ({ value: v, label: `${v} cm` }))} />
          <Small style={{ marginTop: 10, marginBottom: 4 }}>Szerokość</Small>
          <Choice label="Minimalna szerokość" value={prefs.minWidthCm} onChange={(v) => { store.setPreferences({ minWidthCm: v }); store.setRoute(null); }} options={[80, 90, 100, 120].map((v) => ({ value: v, label: `${v} cm` }))} />
          <Button title="Zwiń" variant="ghost" onPress={() => { setShowAdvanced(false); setInclineHint(null); }} style={{ marginTop: 8 }} />
        </Card>
      )}

      <View style={{ height: 200, borderRadius: 28, overflow: 'hidden', marginTop: 18, backgroundColor: colors.cream }}>
        <MapView style={{ height: '100%' }} markers={markers} barriers={barriers} bounds={bounds} center={bounds ? undefined : center} zoom={markers.length ? 16 : 15.4} reduceMotion={reduceMotion}
          accessibilityLabel={`Mapa. Punktów: ${markers.length}. Bariery: ${barriers.length}.`}
          onPress={(c) => {
            const p = { coordinate: c, label: `Punkt na mapie (${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)})` };
            if (!store.origin) store.setOrigin(p);
            else if (showRouteForm && !store.destination) store.setDestination(p);
            else if (showRouteForm && store.waypoints.length < 6) store.addWaypoint(p);
            else store.setOrigin(p);
          }}
          onBarrierPress={(b) => router.push(`/barrier/${b.id}`)}
        />
      </View>

      <View style={local.sheet}>
        <PlaceSearch nativeID="origin" label="Start" value={store.origin} onChange={(p) => { store.setOrigin(p); store.setRoute(null); }} near={center} allowMyLocation onPickOnMap={() => router.push({ pathname: '/pick', params: { target: 'origin' } })} recent={store.recent} />

        <Text style={local.kicker}>PROMIEŃ OKOLICY</Text>
        <Text style={local.radiusHint}>Jak daleko od startu szukać propozycji tras (zależnie od trybu — np. rower do 20 km, spacer do 5 km).</Text>
        <Choice label="Promień okolicy" value={radiusM} onChange={(v) => store.setExploreRadiusM(v)} options={radiusOpts} />

        <Button title="Odkryj okolice" icon="◎" disabled={!store.origin} onPress={() => { announce('Odkrywam okolice…'); router.push('/explore'); }} testID="explore-around" style={{ minHeight: 54, marginTop: 12 }} />

        <Button title={showRouteForm ? 'Ukryj trasę do celu' : 'Trasa do celu'} variant="secondary" icon="➜" onPress={() => setShowRouteForm((v) => !v)} style={{ marginTop: 12 }} />

        {showRouteForm ? (
          <View style={{ marginTop: 8, gap: 4 }}>
            {store.waypoints.map((w, i) => (
              <PlaceSearch key={`wp-${i}`} nativeID={`waypoint-${i}`} label={`Punkt ${String.fromCharCode(65 + i)}`} value={w} onChange={(p) => store.updateWaypoint(i, p)} near={center} onPickOnMap={() => router.push({ pathname: '/pick', params: { target: `waypoint-${i}` } })} recent={store.recent} />
            ))}
            {store.waypoints.length < 6 ? <Button title={store.waypoints.length ? `Dodaj punkt ${String.fromCharCode(65 + store.waypoints.length)}` : 'Dodaj punkt A na trasie'} variant="secondary" onPress={() => router.push({ pathname: '/pick', params: { target: 'waypoint-new' } })} /> : null}
            <Button title="Zamień miejscami" variant="ghost" icon="⇅" onPress={store.swapPoints} disabled={!store.origin && !store.destination} style={{ alignSelf: 'flex-end' }} />
            <PlaceSearch nativeID="destination" label="Cel" value={store.destination} onChange={store.setDestination} near={center} onPickOnMap={() => router.push({ pathname: '/pick', params: { target: 'destination' } })} recent={store.recent} />
            <Button title="Wyznacz trasę" icon="➜" loading={plan.isPending} disabled={!store.origin || !store.destination} onPress={() => plan.mutate()} testID="plan-route" style={{ minHeight: 54, marginTop: 8 }} />
          </View>
        ) : null}
      </View>

      {store.dataMode === 'demo' ? (
        <View testID="demo-scenarios" style={{ marginTop: 20 }}>
          <Text style={local.sectionTitle}>Scenariusze demo</Text>
          <Row wrap style={{ marginTop: 8, gap: 8 }}>
            {demoConflict ? <Button title="Sporna bariera" variant="secondary" onPress={() => router.push(`/barrier/${demoConflict.id}`)} /> : null}
            {demoStale ? <Button title="Nieaktualne" variant="secondary" onPress={() => router.push(`/barrier/${demoStale.id}`)} /> : null}
            <Button title="Awaria źródła" variant="secondary" onPress={() => router.push('/sources')} />
            {demoRemont ? <Button title="Remont Grodzka" variant="ghost" onPress={() => router.push(`/barrier/${demoRemont.id}`)} /> : null}
          </Row>
        </View>
      ) : null}

      {noRoute ? <Card tone="warn" style={{ marginTop: 16 }}><Text accessibilityRole="alert" style={{ color: colors.text, fontWeight: '700' }}>Brak trasy spełniającej limity</Text><P>{noRoute.explanation}</P>{noRoute.suggestions.map((v, i) => <Small key={`${i}-${v}`}>{v}</Small>)}<Button title="Zmień limity" variant="secondary" onPress={() => setShowAdvanced(true)} /></Card> : null}
      {error ? <Notice tone="danger" title="Nie udało się wyznaczyć trasy" text={error} /> : null}

      {store.route && !plan.isPending ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Otwórz ostatnią trasę" onPress={() => router.push('/route')} style={(st) => [local.routeStrip, focusRing(st)]}>
          <View style={{ flex: 1 }}>
            <Text style={local.routeStripTitle}>Ostatnia trasa</Text>
            <Text style={local.routeStripMeta} numberOfLines={1}>{store.lastRoute?.origin.label} → {store.lastRoute?.destination.label}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <View style={local.barrierHeader}>
        <Text style={local.sectionTitle}>W okolicy</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Zgłoś barierę" onPress={() => router.push({ pathname: '/report', params: { ...(store.origin ? { lat: String(store.origin.coordinate.latitude), lon: String(store.origin.coordinate.longitude) } : {}), quick: '1' } })} hitSlop={8}>
          <Text style={local.reportLink}>Zgłoś</Text>
        </Pressable>
      </View>
      {barriersQ.isError ? <Notice tone="warn" title="Nie udało się odświeżyć" text="Sprawdź połączenie." /> : null}
      {barriers.length === 0 && !barriersQ.isLoading ? <Text style={local.emptyBarriers}>Brak zgłoszeń w pobliżu startu.</Text> : null}
      <View style={local.barrierList}>
        {barriers.slice(0, 4).map((b) => (
          <NearbyBarrierRow key={b.id} barrier={b} onPress={() => router.push(`/barrier/${b.id}`)} />
        ))}
      </View>
    </Screen>
  );
}

function NearbyBarrierRow({ barrier, onPress }: { barrier: Barrier; onPress: () => void }) {
  const meta = [
    barrierTypeLabels[barrier.type],
    stateLabels[barrier.state],
    barrier.isDemo ? 'demo' : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cleanBarrierTitle(barrier.title)}. ${meta}`}
      onPress={onPress}
      style={(st) => [local.barrierRow, focusRing(st)]}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={local.barrierTitle} numberOfLines={2}>{cleanBarrierTitle(barrier.title)}</Text>
        <Text style={local.barrierMeta}>{meta}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function assignPoint(store: ReturnType<typeof useStore>, target: string, point: Point) {
  if (target === 'origin') store.setOrigin(point);
  else if (target === 'destination') store.setDestination(point);
  else if (target === 'waypoint-new') store.addWaypoint(point);
  else if (target.startsWith('waypoint-')) store.updateWaypoint(Number(target.slice(9)), point);
}

const local = StyleSheet.create({
  kicker: { marginTop: 22, marginBottom: 8, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.textMuted },
  radiusHint: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginBottom: 10, marginTop: -2 },
  activityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  activityOn: { backgroundColor: '#111111', borderColor: '#111111' },
  activityTxt: { fontSize: 14, fontWeight: '700', color: colors.text },
  advancedLink: { marginTop: 14, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingVertical: 6 },
  advancedLinkTxt: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  level: { minHeight: 42, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, justifyContent: 'center' },
  levelOn: { backgroundColor: '#111111', borderColor: '#111111' },
  levelTxt: { fontSize: 14, fontWeight: '700', color: colors.text },
  inclineHint: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  inclineHintMuted: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  sheet: { marginTop: 18, backgroundColor: colors.paper, borderRadius: 28, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  barrierHeader: { marginTop: 28, marginBottom: 10, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  reportLink: { fontSize: 15, fontWeight: '600', color: colors.text },
  barrierList: { gap: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  barrierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 52,
  },
  barrierTitle: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22, letterSpacing: -0.2 },
  barrierMeta: { marginTop: 4, fontSize: 13, color: colors.textMuted },
  emptyBarriers: { fontSize: 14, color: colors.textMuted, marginBottom: 8 },
  routeStrip: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  routeStripTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  routeStripMeta: { marginTop: 2, fontSize: 13, color: colors.textMuted },
});
