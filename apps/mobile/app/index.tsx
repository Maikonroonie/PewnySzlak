import { useMutation, useQuery } from '@tanstack/react-query';
import { formatDistance, type Barrier, type Coordinate } from '@pewnyszlak/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { BrandBar } from '../src/components/design/BrandBar';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { api, ApiError } from '../src/api/client';
import MapView from '../src/components/map/MapView';
import { PlaceSearch } from '../src/components/PlaceSearch';
import { BarrierCard, routeSummaryText } from '../src/components/RouteParts';
import { Screen } from '../src/components/Screen';
import { Badge, Button, Card, H1, H2, Notice, P, Row, Small } from '../src/components/ui';
import { announce, useFocusOnMount, useReduceMotion } from '../src/lib/a11y';
import { bboxOf, KRAKOW_CENTER } from '../src/lib/geo';
import { useStore } from '../src/state/store';
import { colors, headingFont, spacing } from '../src/theme';

export default function PlannerScreen() {
  const router = useRouter();
  const wide = useWindowDimensions().width >= 920;
  const store = useStore();
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ picked?: string; target?: string }>();
  const h1 = useFocusOnMount<Text>([]);
  const [noRoute, setNoRoute] = useState<{ explanation: string; suggestions: string[]; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Punkt wskazany na mapie (ekran „pick”) wraca przez parametry.
  useEffect(() => {
    if (!params.picked || !params.target) return;
    const [lon, lat] = params.picked.split(',').map(Number);
    if (lon == null || lat == null || Number.isNaN(lon) || Number.isNaN(lat)) return;
    const c: Coordinate = { longitude: lon, latitude: lat };
    const point = { coordinate: c, label: `Punkt na mapie (${lat.toFixed(5)}, ${lon.toFixed(5)})` };
    if (params.target === 'origin') store.setOrigin(point); else store.setDestination(point);
    api.reverse(c).then((r) => { if (r.place) { const p = { ...point, label: `Przy: ${r.place.name}${r.place.address ? `, ${r.place.address}` : ''}` }; if (params.target === 'origin') store.setOrigin(p); else store.setDestination(p); } }).catch(() => {});
    router.setParams({ picked: undefined, target: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.picked, params.target]);

  const center = store.origin?.coordinate ?? store.destination?.coordinate ?? KRAKOW_CENTER;
  const barriersQ = useQuery({ queryKey: ['barriers-near', store.dataMode, center.latitude.toFixed(3), center.longitude.toFixed(3)], queryFn: () => api.barriersNear(center, 600), staleTime: 60_000 });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000, retry: 0 });

  const plan = useMutation({
    mutationFn: () => api.route(store.origin!.coordinate, store.destination!.coordinate, store.preferences),
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
    ...(store.origin ? [{ id: 'o', coordinate: store.origin.coordinate, kind: 'origin' as const }] : []),
    ...(store.destination ? [{ id: 'd', coordinate: store.destination.coordinate, kind: 'destination' as const }] : []),
  ], [store.origin, store.destination]);
  const bounds = useMemo(() => (markers.length === 2 ? bboxOf(markers.map((m) => [m.coordinate.longitude, m.coordinate.latitude] as [number, number]), 0.004) : null), [markers]);
  const prefs = store.preferences;
  const barriers: Barrier[] = barriersQ.data?.items ?? [];

  const mapPanel = <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
    <View style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: colors.sage, height: wide ? 550 : 330, borderWidth: 1, borderColor: '#E0E3D8' }}>
      <MapView style={{ height: '100%' }} markers={markers} barriers={barriers} bounds={bounds} center={bounds ? undefined : center} zoom={markers.length ? 16 : 15.7} reduceMotion={reduceMotion}
        accessibilityLabel={`Mapa 3D Krakowa. Zaznaczonych punktów: ${markers.length}. Bariery w pobliżu: ${barriers.length}. Dostępna jest także wyszukiwarka tekstowa.`}
        onPress={(c) => {
          const p = { coordinate: c, label: `Punkt na mapie (${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)})` };
          if (!store.origin) store.setOrigin(p); else store.setDestination(p);
        }} onBarrierPress={(b) => router.push(`/barrier/${b.id}`)} />
      <View pointerEvents="none" style={local.mapCaption}><View style={local.liveDot}/><Text style={local.captionText}>KRAKÓW Z BLISKA</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>Twoja następna mała podróż</Text></View>
    </View>
    <Row wrap style={{ paddingHorizontal: 4 }}><Feather name="mouse-pointer" size={14} color={colors.textMuted}/><Small>Wskaż początek i cel na mapie lub użyj wyszukiwarki.</Small></Row>
  </View>;

  const planner = <View style={[local.planner, wide && { width: 380 }]}>
    <Row style={{ justifyContent: 'space-between', marginBottom: 22 }}><Text style={local.sectionTitle}>Ułóż swoją trasę</Text><Feather name="corner-up-right" size={23} color={colors.primary}/></Row>
    <PlaceSearch nativeID="origin" label="Początek trasy" value={store.origin} onChange={store.setOrigin} near={center} allowMyLocation onPickOnMap={() => router.push({ pathname: '/pick', params: { target: 'origin' } })} recent={store.recent}/>
    <Button title="Zamień miejscami" variant="ghost" icon="⇅" onPress={store.swapPoints} disabled={!store.origin && !store.destination} style={{ alignSelf: 'flex-end', marginTop: -8, marginBottom: 8 }}/>
    <PlaceSearch nativeID="destination" label="Cel" value={store.destination} onChange={store.setDestination} near={center} onPickOnMap={() => router.push({ pathname: '/pick', params: { target: 'destination' } })} recent={store.recent}/>
    <View style={{ backgroundColor: colors.bg, borderRadius: 18, padding: 16, marginBottom: 16 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}><Row><Feather name="sliders" size={16} color={colors.primary}/><Text style={{ fontWeight: '700', color: colors.text }}>Na Twoich zasadach</Text></Row><Button title="Zmień" variant="ghost" accessibilityLabel="Zmień preferencje trasy" onPress={() => router.push('/preferences')} style={{ paddingHorizontal: 8 }}/></Row>
      <Small>{prefs.avoidSteps ? 'Bez schodów' : 'Schody dozwolone'} · nachylenie ≤ {prefs.maxIncline}% · krawężnik ≤ {prefs.maxKerbHeightCm} cm · szerokość ≥ {prefs.minWidthCm} cm</Small>
    </View>
    <Button title="Wyznacz trasę" icon="➜" loading={plan.isPending} disabled={!store.origin || !store.destination} onPress={() => plan.mutate()} testID="plan-route" style={{ minHeight: 56 }}/>
    {!store.origin || !store.destination ? <Small style={{ textAlign: 'center', marginTop: 10 }}>Zacznij od wybrania początku i celu.</Small> : null}
    {noRoute ? <Card tone="warn" style={{ marginTop: 16 }}><Text accessibilityRole="alert" style={{ color: colors.text, fontWeight: '700' }}>Nie znaleziono trasy spełniającej Twoje preferencje</Text><P>{noRoute.explanation}</P>{noRoute.suggestions.map(v => <Small key={v}>{v}</Small>)}<Button title="Zmień preferencje" variant="secondary" onPress={() => router.push('/preferences')}/></Card> : null}
    {error ? <Notice tone="danger" title="Nie udało się wyznaczyć trasy" text={error}/> : null}
  </View>;

  return <Screen testID="screen-planner">
    <BrandBar/>
    <View style={{ marginBottom: 28 }}>
      <Row style={{ marginBottom: 14 }}><View style={local.liveDot}/><Text style={local.eyebrow}>KRAKÓW, PO SWOJEMU</Text></Row>
      <H1 ref={h1} nativeID="planner-title" style={{ fontFamily: headingFont, fontSize: wide ? 54 : 39, lineHeight: wide ? 62 : 47, fontWeight: '400', letterSpacing: -1.7 }}>Dokąd chcesz dojść?</H1>
      <P muted style={{ maxWidth: 650, fontSize: wide ? 18 : 16 }}>Mniej niespodzianek. Więcej miasta. Znajdź drogę, która pasuje do Twojego tempa.</P>
      <Row wrap style={{ marginTop: 16 }}><Badge text={store.dataMode === 'demo' ? 'Tryb DEMO · dane pokazowe' : 'Otwarte dane · Kraków'} tone={store.dataMode === 'demo' ? 'warn' : 'ok'}/>{health.isError ? <Badge text="Serwer niedostępny – tryb offline" tone="danger"/> : null}<Badge text="Bez konta. Po prostu w drogę." tone="muted"/></Row>
    </View>
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20, alignItems: 'stretch' }}>{wide ? <>{planner}{mapPanel}</> : <>{mapPanel}{planner}</>}</View>

    {store.route && !plan.isPending ? <Card style={{ marginTop: 20 }}><Row wrap style={{ justifyContent: 'space-between' }}><View style={{ flex: 1, minWidth: 180 }}><P style={{ fontWeight: '700' }}>Zapisana trasa</P><Small>{store.lastRoute?.origin.label} → {store.lastRoute?.destination.label}</Small><Small>{routeSummaryText(store.route)}</Small></View><Button title="Otwórz trasę" icon="➜" onPress={() => router.push('/route')}/></Row></Card> : null}

    <View style={{ marginTop: 32, marginBottom: 20 }}><Text style={local.eyebrow}>DOBRZE MIEĆ PLAN</Text><H2 style={{ marginTop: 8, fontFamily: headingFont, fontSize: 29, fontWeight: '400' }}>Małe kroki, nowe miejsca.</H2></View>
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zaplanuj trasę Rynek Główny – Wawel" onPress={() => { store.setOrigin({ coordinate: { latitude: 50.06164, longitude: 19.93725 }, label: 'Rynek Główny' }); store.setDestination({ coordinate: { latitude: 50.0541, longitude: 19.9366 }, label: 'Wawel' }); }} style={[local.idea, { backgroundColor: colors.sage }]}>
        <Row style={{ justifyContent: 'space-between' }}><Text style={local.eyebrow}>01 / POMYSŁ NA TRASĘ</Text><Feather name="arrow-up-right" size={24} color={colors.primary}/></Row><Text style={local.ideaTitle}>Od Rynku
do Wawelu.</Text><Small>Wybierz punkty i sprawdź aktualne warunki.</Small>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zapytaj asystenta" onPress={() => router.push('/assistant')} style={[local.idea, { backgroundColor: colors.peach }]}><Row style={{ justifyContent: 'space-between' }}><Text style={local.eyebrow}>02 / POMOC PO DRODZE</Text><Feather name="message-circle" size={24} color={colors.primary}/></Row><Text style={local.ideaTitle}>Dobre pytanie.
Sprawdzalne źródło.</Text><Small>Zapytaj o miejsca, placówki i utrudnienia.</Small></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Źródła danych i stan" onPress={() => router.push('/sources')} style={[local.idea, { backgroundColor: colors.cream }]}><Row style={{ justifyContent: 'space-between' }}><Text style={local.eyebrow}>03 / BEZ DOMYSŁÓW</Text><Feather name="layers" size={24} color={colors.primary}/></Row><Text style={local.ideaTitle}>Wiesz,
skąd wiemy.</Text><Small>Źródła, daty i to, czego jeszcze nie wiemy.</Small></Pressable>
    </View>

    <Row wrap style={{ justifyContent: 'space-between', marginTop: 32 }}><H2>Bariery w pobliżu ({barriers.length})</H2><Button title="Zgłoś barierę" icon="⚑" variant="secondary" onPress={() => router.push({ pathname: '/report', params: store.origin ? { lat: String(store.origin.coordinate.latitude), lon: String(store.origin.coordinate.longitude) } : {} })}/></Row>
    {barriersQ.isLoading ? <Small>Wczytywanie barier…</Small> : null}
    {barriersQ.isError ? <Notice tone="warn" title="Nie udało się odświeżyć barier" text="Sprawdź połączenie. Brak informacji nie oznacza braku przeszkód."/> : null}
    {barriers.length === 0 && barriersQ.isSuccess ? <Small>Brak zgłoszonych barier w promieniu 600 m. To nie znaczy, że ich nie ma.</Small> : null}
    <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: 12 }}>{barriers.slice(0, 4).map(b => <View key={b.id} style={{ flex: 1, minWidth: wide ? 260 : undefined }}><BarrierCard barrier={b} onPress={() => router.push(`/barrier/${b.id}`)}/></View>)}</View>
    <View style={{ marginTop: 30, borderTopWidth: 1, borderColor: colors.border, paddingTop: 20 }}><Small>PewnySzlak · Miasto w Twoim tempie. Informujemy o znanych barierach i brakach danych. Zasięg: Kraków + {formatDistance(2000)} bufora.</Small></View>
  </Screen>;
}

const local = StyleSheet.create({
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.8, color: colors.textMuted },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  planner: { backgroundColor: colors.paper, borderRadius: 28, padding: 24, borderWidth: 1, borderColor: '#E6E6DC' },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: colors.text },
  mapCaption: { position: 'absolute', bottom: 52, left: 16, right: 16, borderRadius: 16, padding: 14, backgroundColor: '#FFFFFFF2', gap: 6, alignSelf: 'flex-start' },
  captionText: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700', color: colors.primary },
  idea: { flex: 1, borderRadius: 24, padding: 24, minHeight: 208, justifyContent: 'space-between', gap: 12 },
  ideaTitle: { fontFamily: headingFont, fontSize: 29, lineHeight: 35, color: colors.text, letterSpacing: -0.7 },
});
