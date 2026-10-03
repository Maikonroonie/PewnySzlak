import { useMutation, useQuery } from '@tanstack/react-query';
import { formatDistance, type Barrier, type Coordinate } from '@pewnyszlak/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { api, ApiError } from '../src/api/client';
import MapView from '../src/components/map/MapView';
import { PlaceSearch } from '../src/components/PlaceSearch';
import { BarrierCard, routeSummaryText } from '../src/components/RouteParts';
import { Screen } from '../src/components/Screen';
import { Badge, Button, Card, H1, H2, Notice, P, Row, Small } from '../src/components/ui';
import { announce, useFocusOnMount, useReduceMotion } from '../src/lib/a11y';
import { bboxOf, KRAKOW_CENTER } from '../src/lib/geo';
import { useStore } from '../src/state/store';
import { colors, spacing } from '../src/theme';

export default function PlannerScreen() {
  const router = useRouter();
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

  return (
    <Screen testID="screen-planner">
      <H1 ref={h1} nativeID="planner-title">Dokąd chcesz dojść?</H1>
      <Row wrap style={{ marginBottom: spacing(1) }}>
        <Badge text={store.dataMode === 'demo' ? 'Tryb DEMO – dane pokazowe + prawdziwa mapa' : 'Dane bieżące'} tone={store.dataMode === 'demo' ? 'warn' : 'ok'} />
        {health.isError ? <Badge text="Serwer niedostępny – tryb offline" tone="danger" /> : health.data ? <Badge text={`Graf OSM: ${health.data.graph.edges.toLocaleString('pl-PL')} odcinków`} tone="muted" /> : null}
      </Row>

      <PlaceSearch nativeID="origin" label="Początek trasy" value={store.origin} onChange={store.setOrigin} near={center} allowMyLocation onPickOnMap={() => router.push({ pathname: '/pick', params: { target: 'origin' } })} recent={store.recent} />
      <Row style={{ marginBottom: spacing(1) }}>
        <Button title="Zamień miejscami" variant="ghost" icon="⇅" onPress={store.swapPoints} disabled={!store.origin && !store.destination} />
      </Row>
      <PlaceSearch nativeID="destination" label="Cel" value={store.destination} onChange={store.setDestination} near={center} onPickOnMap={() => router.push({ pathname: '/pick', params: { target: 'destination' } })} recent={store.recent} />

      <Card>
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <View style={{ flex: 1, minWidth: 200 }}>
            <P style={{ fontWeight: '700' }}>Preferencje trasy</P>
            <Small>
              {prefs.avoidSteps ? 'bez schodów' : 'schody dozwolone'} · nachylenie ≤ {prefs.maxIncline}% · krawężnik ≤ {prefs.maxKerbHeightCm} cm · szerokość ≥ {prefs.minWidthCm} cm · {prefs.avoidRoughSurface ? 'omijaj zły bruk' : 'bruk dozwolony'} · brak danych: {prefs.unknownPolicy === 'exclude' ? 'wyklucz' : 'ostrzegaj'}
            </Small>
          </View>
          <Button title="Zmień" variant="secondary" accessibilityLabel="Zmień preferencje trasy" onPress={() => router.push('/preferences')} />
        </Row>
      </Card>

      <Button title="Wyznacz trasę" icon="➜" loading={plan.isPending} disabled={!store.origin || !store.destination} onPress={() => plan.mutate()} style={{ marginVertical: spacing(1.5) }} testID="plan-route" />
      {!store.origin || !store.destination ? <Small style={{ marginTop: -spacing(1), marginBottom: spacing(1) }}>Wybierz początek i cel, aby wyznaczyć trasę.</Small> : null}

      {noRoute ? (
        <Card tone="warn">
          <Text accessibilityRole="alert" style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>Nie znaleziono trasy spełniającej Twoje preferencje</Text>
          <P>{noRoute.explanation}</P>
          <H2>Co możesz zrobić</H2>
          {noRoute.suggestions.map((s) => <P key={s}>• {s}</P>)}
          <Button title="Zmień preferencje" variant="secondary" onPress={() => router.push('/preferences')} style={{ marginTop: spacing(1) }} />
        </Card>
      ) : null}
      {error ? <Notice tone="danger" title="Nie udało się wyznaczyć trasy" text={error} /> : null}

      {store.route && !plan.isPending ? (
        <Card tone="info">
          <P style={{ fontWeight: '700' }}>Zapisana trasa: {store.lastRoute?.origin.label} → {store.lastRoute?.destination.label}</P>
          <Small>{routeSummaryText(store.route)}{health.isError ? ' · dostępna offline' : ''}</Small>
          <Row wrap style={{ marginTop: spacing(1) }}>
            <Button title="Otwórz trasę" variant="secondary" onPress={() => router.push('/route')} />
            <Button title="Prowadź" variant="secondary" icon="◎" onPress={() => router.push('/route/guide')} />
          </Row>
        </Card>
      ) : null}

      <H2>Mapa</H2>
      <Small style={{ marginBottom: spacing(1) }}>Mapa jest podglądem – wszystkie funkcje są dostępne bez niej. Dotknij mapy, aby ustawić punkt (najpierw początek, potem cel).</Small>
      <MapView
        style={{ height: 300 }}
        markers={markers}
        barriers={barriers}
        bounds={bounds}
        center={bounds ? undefined : center}
        zoom={markers.length ? 15 : 13}
        reduceMotion={reduceMotion}
        accessibilityLabel={`Mapa Krakowa. ${markers.length === 0 ? 'Brak zaznaczonych punktów.' : markers.length === 1 ? 'Zaznaczono jeden punkt.' : 'Zaznaczono początek i cel.'} W pobliżu ${barriers.length} zgłoszonych barier.`}
        onPress={(c) => {
          const p = { coordinate: c, label: `Punkt na mapie (${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)})` };
          if (!store.origin) store.setOrigin(p); else store.setDestination(p);
          api.reverse(c).then((r) => { if (r.place) { const q = { ...p, label: `Przy: ${r.place.name}${r.place.address ? `, ${r.place.address}` : ''}` }; if (!store.origin) store.setOrigin(q); else store.setDestination(q); } }).catch(() => {});
        }}
        onBarrierPress={(b) => router.push(`/barrier/${b.id}`)}
      />

      <H2>Bariery w pobliżu ({barriers.length})</H2>
      {barriersQ.isLoading ? <Small>Wczytywanie barier…</Small> : null}
      {barriersQ.isError ? <Small style={{ color: colors.warn }}>Nie udało się pobrać barier (offline?). Trasa może nie uwzględniać najnowszych zgłoszeń.</Small> : null}
      {barriers.length === 0 && barriersQ.isSuccess ? <Small>Brak zgłoszonych barier w promieniu 600 m. To nie znaczy, że ich nie ma – zgłoś, jeśli jakąś napotkasz.</Small> : null}
      {barriers.slice(0, 5).map((b) => <BarrierCard key={b.id} barrier={b} onPress={() => router.push(`/barrier/${b.id}`)} />)}
      {barriers.length > 5 ? <Small>…i {barriers.length - 5} więcej – zobaczysz je na mapie oraz na trasie.</Small> : null}

      <H2>Więcej</H2>
      <Row wrap>
        <Button title="Zgłoś barierę" icon="⚑" variant="secondary" onPress={() => router.push({ pathname: '/report', params: store.origin ? { lat: String(store.origin.coordinate.latitude), lon: String(store.origin.coordinate.longitude) } : {} })} />
        <Button title="Zapytaj asystenta" icon="✎" variant="secondary" onPress={() => router.push('/assistant')} />
        <Button title="Źródła danych i stan" icon="ⓘ" variant="secondary" onPress={() => router.push('/sources')} />
      </Row>
      <Small style={{ marginTop: spacing(2) }}>
        PewnySzlak pokazuje, co wynika z danych (OpenStreetMap, zgłoszenia, rejestry publiczne) i kiedy ostatnio je sprawdzono. Nie potwierdza, że droga jest dostępna – informuje, czego o niej nie wiemy. Zasięg: Kraków + {formatDistance(2000)} bufora.
      </Small>
    </Screen>
  );
}
