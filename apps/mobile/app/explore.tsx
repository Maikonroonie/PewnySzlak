import {
  clampExploreRadiusM,
  exploreRadiusForTargetLength,
  exploreRadiusOptions,
  exploreTargetLengthOptions,
  formatDistance,
  type Activity,
  type Coordinate,
  type ExploreSuggestion,
} from '@pewnyszlak/domain';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../src/api/client';
import { BrandBar } from '../src/components/design/BrandBar';
import MapView from '../src/components/map/MapView';
import { routeSummaryText } from '../src/components/RouteParts';
import { Screen } from '../src/components/Screen';
import { Badge, Button, Choice, H1, Input, Notice, P, Row, focusRing } from '../src/components/ui';
import { announce, useFocusOnMount, useReduceMotion } from '../src/lib/a11y';
import { buildExploreVariants, variantMeta, type RouteVariant } from '../src/lib/explore-alternatives';
import { bboxOf, KRAKOW_CENTER } from '../src/lib/geo';
import { useStore } from '../src/state/store';
import { colors, headingFont } from '../src/theme';

const MAX_VIA = 5;
const MAX_TARGET_KM: Record<Activity, number> = {
  bike: 50,
  run: 25,
  walk: 15,
  skates: 15,
  wheelchair: 8,
};

function isAmenityPlace(category: string | null | undefined): boolean {
  return /toilets|bench|shelter/.test(category ?? '');
}

function kmFromMeters(m: number): string {
  if (!m) return '';
  const km = m / 1000;
  return Number.isInteger(km) ? String(km) : km.toFixed(1).replace('.', ',');
}

function parseKmInput(text: string, activity: Activity): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const max = MAX_TARGET_KM[activity];
  const km = Math.min(Math.max(n, 0.3), max);
  return Math.round(km * 1000);
}

export default function ExploreScreen() {
  const router = useRouter();
  const store = useStore();
  const reduceMotion = useReduceMotion();
  const h1 = useFocusOnMount<Text>([]);

  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [viaIds, setViaIds] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [variants, setVariants] = useState<RouteVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [showComfort, setShowComfort] = useState(false);
  const [phaseError, setPhaseError] = useState<string | null>(null);
  /** 0 = bez limitu długości trasy. */
  const [targetLengthM, setTargetLengthM] = useState(0);
  const [lengthKmText, setLengthKmText] = useState('');
  /** true = długość łącznie z powrotem do startu. */
  const [roundTrip, setRoundTrip] = useState(true);

  const origin = store.origin?.coordinate ?? KRAKOW_CENTER;
  const prefs = store.preferences;
  const radiusOpts = exploreRadiusOptions(prefs.activity);
  const lengthOpts = exploreTargetLengthOptions(prefs.activity).map((o) => ({
    value: o.value ?? 0,
    label: o.label,
  }));
  const radiusM = clampExploreRadiusM(prefs.activity, store.exploreRadiusM);
  const prefsKey = JSON.stringify(prefs);
  const maxTargetKm = MAX_TARGET_KM[prefs.activity];
  const lengthIsCustom = targetLengthM > 0 && !lengthOpts.some((o) => o.value === targetLengthM);

  useEffect(() => {
    if (radiusM !== store.exploreRadiusM) store.setExploreRadiusM(radiusM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.activity, radiusM]);

  useEffect(() => {
    // Przy zmianie aktywności przytnij własną długość do limitu trybu.
    const maxM = MAX_TARGET_KM[prefs.activity] * 1000;
    if (targetLengthM > maxM) {
      setTargetLengthM(maxM);
      setLengthKmText(kmFromMeters(maxM));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.activity]);

  const applyLengthAndRadius = (lengthM: number, withReturn: boolean) => {
    setTargetLengthM(lengthM);
    setLengthKmText(kmFromMeters(lengthM));
    setVariants([]);
    setSelectedVariant(null);
    if (lengthM > 0) {
      const need = exploreRadiusForTargetLength(prefs.activity, lengthM, withReturn);
      if (need > radiusM) {
        store.setExploreRadiusM(need);
        announce(
          withReturn
            ? `Promień ${formatDistance(need)} · cel ${formatDistance(lengthM)} z powrotem do startu.`
            : `Promień ${formatDistance(need)} · cel ${formatDistance(lengthM)} w jedną stronę.`,
        );
      } else {
        announce(
          withReturn
            ? `Długość ${formatDistance(lengthM)} łącznie z powrotem.`
            : `Długość ${formatDistance(lengthM)} w jedną stronę.`,
        );
      }
    } else {
      announce('Bez limitu długości trasy');
    }
  };

  const onTargetLengthChange = (v: number) => applyLengthAndRadius(v, roundTrip);

  const onRoundTripChange = (v: number) => {
    const next = v === 1;
    setRoundTrip(next);
    setVariants([]);
    setSelectedVariant(null);
    if (targetLengthM > 0) applyLengthAndRadius(targetLengthM, next);
    else announce(next ? 'Trasa z powrotem do startu' : 'Trasa w jedną stronę');
  };

  const applyCustomKm = () => {
    if (!lengthKmText.trim()) {
      onTargetLengthChange(0);
      return;
    }
    const meters = parseKmInput(lengthKmText, prefs.activity);
    if (meters == null) {
      announce('Podaj liczbę kilometrów, np. 7 lub 12,5');
      return;
    }
    applyLengthAndRadius(meters, roundTrip);
  };

  const exploreQ = useQuery({
    queryKey: ['explore', store.dataMode, origin.latitude.toFixed(5), origin.longitude.toFixed(5), prefsKey, radiusM],
    queryFn: () => api.explore(origin, prefs, radiusM),
    enabled: !!store.origin,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    if (exploreQ.data) store.setLastExplore(exploreQ.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploreQ.data]);

  useEffect(() => {
    setDestinationId(null);
    setViaIds([]);
    setFocusedId(null);
    setVariants([]);
    setSelectedVariant(null);
    setPhaseError(null);
  }, [radiusM, prefsKey, origin.latitude, origin.longitude]);

  const cached = store.lastExplore;
  const usingCache = exploreQ.isError && !!cached?.data;
  const data = exploreQ.data ?? (usingCache ? cached!.data : undefined);

  const candidates = useMemo(
    () => (data?.suggestions ?? []).filter((s) => !isAmenityPlace(s.place.category) && !!s.place.coordinate),
    [data],
  );

  const destination = candidates.find((c) => c.place.id === destinationId) ?? null;
  const vias = viaIds
    .map((id) => candidates.find((c) => c.place.id === id))
    .filter((c): c is ExploreSuggestion => !!c && !!c.place.coordinate);
  const focused = candidates.find((c) => c.place.id === focusedId) ?? null;
  const activeVariant = variants.find((v) => v.id === selectedVariant) ?? null;
  const previewRoute = activeVariant?.route ?? null;

  const markers = useMemo(() => {
    const out: { id: string; coordinate: Coordinate; kind: 'origin' | 'destination' | 'user' | 'pin' | 'waypoint'; label?: string }[] = store.origin
      ? [{ id: 'o', coordinate: store.origin.coordinate, kind: 'origin', label: 'S' }]
      : [];
    for (const s of candidates) {
      if (!s.place.coordinate) continue;
      const isDest = s.place.id === destinationId;
      const viaIdx = viaIds.indexOf(s.place.id);
      const isFocused = s.place.id === focusedId;
      out.push({
        id: s.place.id,
        coordinate: s.place.coordinate,
        kind: isDest ? 'destination' : viaIdx >= 0 ? 'waypoint' : isFocused ? 'user' : 'pin',
        label: isDest ? 'C' : viaIdx >= 0 ? String(viaIdx + 1) : isFocused ? '•' : '·',
      });
    }
    return out;
  }, [store.origin, candidates, destinationId, viaIds, focusedId]);

  const bounds = useMemo(() => {
    if (previewRoute) {
      const coords = previewRoute.geometry.coordinates;
      if (coords.length >= 2) return bboxOf(coords.map((c) => [c[0], c[1]] as [number, number]), 0.0015);
    }
    const pts: [number, number][] = [[origin.longitude, origin.latitude]];
    for (const s of candidates) {
      if (s.place.coordinate) pts.push([s.place.coordinate.longitude, s.place.coordinate.latitude]);
    }
    return pts.length >= 2 ? bboxOf(pts, 0.002) : null;
  }, [origin, candidates, previewRoute]);

  const toRef = (s: ExploreSuggestion) => ({
    id: s.place.id,
    name: s.place.name,
    coordinate: s.place.coordinate!,
    distanceM: s.distanceM,
  });

  const computeVariants = useMutation({
    mutationFn: async () => buildExploreVariants({
      origin,
      destination: destination ? toRef(destination) : null,
      vias: vias.map(toRef),
      candidates: candidates.map(toRef),
      preferences: prefs,
      targetLengthM: targetLengthM > 0 ? targetLengthM : null,
      roundTrip,
    }),
    onMutate: () => { setPhaseError(null); announce('Liczą warianty trasy…'); },
    onSuccess: (list) => {
      setVariants(list);
      const firstOk = list.find((v) => v.route);
      setSelectedVariant(firstOk?.id ?? list[0]?.id ?? null);
      announce(firstOk ? `Gotowe: ${list.filter((v) => v.route).length} wariantów` : 'Nie udało się wyznaczyć wariantów');
    },
    onError: (e) => setPhaseError(e instanceof Error ? e.message : 'Błąd wariantów'),
  });

  const acceptAndGuide = () => {
    if (!activeVariant?.route) return;
    store.setDestination({
      coordinate: activeVariant.destination,
      label: activeVariant.destinationLabel,
      placeId: candidates.find((c) => c.place.name === activeVariant.destinationLabel)?.place.id,
    });
    store.setWaypoints(
      activeVariant.waypoints.map((c, i) => ({
        coordinate: c,
        label: activeVariant.viaLabels[i] ?? `Punkt ${i + 1}`,
      })),
    );
    store.setRoute(activeVariant.route);
    announce(routeSummaryText(activeVariant.route));
    router.push('/route/guide');
  };

  const toggleVia = (s: ExploreSuggestion) => {
    setVariants([]);
    setSelectedVariant(null);
    setViaIds((ids) => {
      if (ids.includes(s.place.id)) {
        announce(`Usunięto z trasy: ${s.place.name}`);
        return ids.filter((id) => id !== s.place.id);
      }
      if (destinationId === s.place.id) setDestinationId(null);
      if (ids.length >= MAX_VIA) {
        announce(`Maksymalnie ${MAX_VIA} punktów „przez”.`);
        return ids;
      }
      announce(`Przez: ${s.place.name}`);
      return [...ids, s.place.id];
    });
  };

  const setDest = (s: ExploreSuggestion) => {
    setVariants([]);
    setSelectedVariant(null);
    setViaIds((ids) => ids.filter((id) => id !== s.place.id));
    setDestinationId((cur) => (cur === s.place.id ? null : s.place.id));
    announce(destinationId === s.place.id ? 'Usunięto cel' : `Cel: ${s.place.name}`);
  };

  const onMarkerPress = (id: string) => {
    if (id === 'o') {
      setFocusedId(null);
      announce('Punkt startu');
      return;
    }
    const s = candidates.find((c) => c.place.id === id);
    if (!s) return;
    setFocusedId(s.place.id);
    announce(s.place.name);
  };

  if (!store.origin) {
    return (
      <Screen testID="screen-explore">
        <BrandBar back />
        <H1 ref={h1}>Odkryj okolice</H1>
        <Text style={styles.empty}>Ustaw punkt startu na ekranie głównym.</Text>
        <Button title="Ustaw start" onPress={() => router.replace('/')} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  const cacheTime = cached?.savedAt
    ? new Date(cached.savedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    : null;

  const ctaLabel = !destination && vias.length === 0
    ? 'Zaproponuj trasy z okolicy'
    : vias.length
      ? `Pokaż warianty (${vias.length} przez${destination ? ' + cel' : ''})`
      : 'Pokaż warianty trasy';

  return (
    <Screen testID="screen-explore">
      <BrandBar back />
      <H1 ref={h1} style={{ fontFamily: headingFont, fontSize: 30, lineHeight: 36, letterSpacing: -0.8, fontWeight: '800' }}>Odkryj okolice</H1>
      {store.dataMode === 'demo' ? <Badge text="Demo" tone="warn" /> : null}

      <Text style={styles.sectionTitle}>Promień okolicy</Text>
      <Text style={styles.hint}>Możesz nic nie zaznaczać — dostaniesz propozycje tras. Albo dodaj kilka punktów „przez” i ewentualnie cel.</Text>
      <Choice label="Promień okolicy" value={radiusM} onChange={(v) => store.setExploreRadiusM(v)} options={radiusOpts} />

      <Text style={styles.sectionTitle}>Długość trasy</Text>
      <Text style={styles.hint}>
        {targetLengthM > 0
          ? roundTrip
            ? `Cel: dokładnie ${formatDistance(targetLengthM)} łącznie, z powrotem do startu.`
            : `Cel: dokładnie ${formatDistance(targetLengthM)} w jedną stronę (bez powrotu).`
          : `Opcjonalnie — lista lub własne km (do ${maxTargetKm} km).`}
      </Text>
      <Choice
        label="Długość trasy"
        value={lengthIsCustom ? -1 : targetLengthM}
        onChange={(v) => onTargetLengthChange(v < 0 ? targetLengthM : v)}
        options={[
          ...lengthOpts,
          ...(lengthIsCustom ? [{ value: -1, label: `Własne: ${kmFromMeters(targetLengthM)} km` }] : []),
        ]}
      />
      <Row style={{ marginTop: 10, alignItems: 'stretch' }}>
        <Input
          accessibilityLabel="Własna długość trasy w kilometrach"
          value={lengthKmText}
          onChangeText={setLengthKmText}
          placeholder="np. 7,5"
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={applyCustomKm}
          onBlur={applyCustomKm}
          style={{ flex: 1, minHeight: 48 }}
        />
        <Text style={styles.kmSuffix}>km</Text>
        <Button title="Ustaw" variant="secondary" onPress={applyCustomKm} style={{ minHeight: 48, alignSelf: 'center' }} />
      </Row>
      {targetLengthM > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Powrót do startu</Text>
          <Choice
            label="Powrót do startu"
            value={roundTrip ? 1 : 0}
            onChange={onRoundTripChange}
            options={[
              { value: 1, label: 'Tam i z powrotem' },
              { value: 0, label: 'Tylko w jedną stronę' },
            ]}
          />
        </>
      ) : null}

      <View style={styles.mapWrap}>
        <MapView
          style={{ height: '100%' }}
          route={previewRoute}
          comfortEdges={showComfort ? data?.comfortEdges : []}
          barriers={data?.barriers ?? []}
          markers={markers}
          bounds={bounds}
          center={bounds ? undefined : origin}
          zoom={13.5}
          reduceMotion={reduceMotion}
          accessibilityLabel={`Mapa propozycji. Cel: ${destination?.place.name ?? 'brak'}. Punktów przez: ${vias.length}.`}
          onBarrierPress={(b) => router.push(`/barrier/${b.id}`)}
          onMarkerPress={onMarkerPress}
          onPress={() => setFocusedId(null)}
        />
        {focused ? (
          <View style={styles.callout} accessibilityLiveRegion="polite">
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.calloutTitle} numberOfLines={2}>{focused.place.name}</Text>
              <Text style={styles.calloutMeta}>{formatDistance(focused.distanceM)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={viaIds.includes(focused.place.id) ? `Usuń ${focused.place.name} z punktów przez` : `Przez ${focused.place.name}`}
              onPress={() => toggleVia(focused)}
              style={(st) => [styles.calloutBtn, viaIds.includes(focused.place.id) && styles.calloutBtnOn, focusRing(st)]}
            >
              <Text style={[styles.calloutBtnTxt, viaIds.includes(focused.place.id) && styles.calloutBtnTxtOn]}>
                {viaIds.includes(focused.place.id) ? 'Przez ✓' : 'Przez'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={destinationId === focused.place.id ? `Usuń cel ${focused.place.name}` : `Ustaw cel ${focused.place.name}`}
              onPress={() => setDest(focused)}
              style={(st) => [styles.calloutBtn, destinationId === focused.place.id && styles.calloutBtnOn, focusRing(st)]}
            >
              <Text style={[styles.calloutBtnTxt, destinationId === focused.place.id && styles.calloutBtnTxtOn]}>
                {destinationId === focused.place.id ? 'Cel ✓' : 'Cel'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.mapTools}>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: showComfort }} onPress={() => setShowComfort((v) => !v)} style={(st) => [styles.toolChip, showComfort && styles.toolChipOn, focusRing(st)]}>
          <Text style={[styles.toolChipTxt, showComfort && { color: '#FFFFFF' }]}>{showComfort ? 'Sieć komfortu: on' : 'Pokaż sieć komfortu'}</Text>
        </Pressable>
        {(destinationId || viaIds.length) ? (
          <Pressable accessibilityRole="button" onPress={() => { setDestinationId(null); setViaIds([]); setVariants([]); setSelectedVariant(null); announce('Wyczyszczono wybór'); }} style={(st) => [styles.toolChip, focusRing(st)]}>
            <Text style={styles.toolChipTxt}>Wyczyść wybór</Text>
          </Pressable>
        ) : null}
      </View>

      {exploreQ.isLoading ? <P style={{ marginTop: 12 }}>Szukam ciekawych miejsc…</P> : null}
      {exploreQ.isError && !usingCache ? <Notice tone="danger" title="Błąd" text={exploreQ.error instanceof Error ? exploreQ.error.message : 'Błąd sieci'} /> : null}
      {usingCache ? <Text style={styles.cacheNote}>Cache z {cacheTime}.</Text> : null}
      {phaseError ? <Notice tone="warn" title="Warianty" text={phaseError} /> : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Miejsca</Text>
        <Pressable onPress={() => exploreQ.refetch()} hitSlop={8}><Text style={styles.link}>{exploreQ.isFetching ? '…' : 'Odśwież'}</Text></Pressable>
      </View>
      {candidates.length === 0 && !exploreQ.isLoading ? <Text style={styles.empty}>Brak propozycji — zwiększ promień.</Text> : null}

      <View style={styles.list}>
        {candidates.map((s) => {
          const isDest = destinationId === s.place.id;
          const viaIdx = viaIds.indexOf(s.place.id);
          const isVia = viaIdx >= 0;
          return (
            <View key={s.place.id} style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${s.place.name}, ${formatDistance(s.distanceM)}`} onPress={() => toggleVia(s)} style={(st) => [styles.rowMain, focusRing(st)]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{s.place.name}</Text>
                  <Text style={styles.rowMeta}>
                    {formatDistance(s.distanceM)}
                    {isDest ? ' · cel' : ''}
                    {isVia ? ` · przez ${viaIdx + 1}` : ''}
                  </Text>
                  {s.fitSummary ? <Text style={styles.rowFit} numberOfLines={2}>{s.fitSummary}</Text> : null}
                </View>
                {isDest ? <Badge text="Cel" tone="info" /> : isVia ? <Badge text={`${viaIdx + 1}`} tone="warn" /> : null}
              </Pressable>
              <View style={styles.rowActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={isVia ? `Usuń ${s.place.name} z punktów` : `Dodaj ${s.place.name} jako punkt przez`} onPress={() => toggleVia(s)} style={(st) => [styles.actionGhost, isVia && styles.actionGhostOn, focusRing(st)]}>
                  <Text style={[styles.actionGhostTxt, isVia && { color: '#FFFFFF' }]}>{isVia ? 'Usuń przez' : 'Przez tu'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={isDest ? `Usuń cel ${s.place.name}` : `Ustaw cel ${s.place.name}`} onPress={() => setDest(s)} style={(st) => [styles.actionGhost, isDest && styles.actionGhostOn, focusRing(st)]}>
                  <Text style={[styles.actionGhostTxt, isDest && { color: '#FFFFFF' }]}>{isDest ? 'Cel ✓' : 'Cel'}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <Button
        title={ctaLabel}
        disabled={computeVariants.isPending || candidates.length === 0}
        loading={computeVariants.isPending}
        onPress={() => computeVariants.mutate()}
        style={{ marginTop: 16, minHeight: 52 }}
      />

      {variants.length ? (
        <>
          <Text style={styles.sectionTitle}>Wybierz wariant</Text>
          <Text style={styles.hint}>Dopiero po akceptacji włączysz GPS.</Text>
          <View style={styles.list}>
            {variants.map((v) => {
              const on = selectedVariant === v.id;
              return (
                <Pressable key={v.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { if (v.route) { setSelectedVariant(v.id); announce(v.label); } }} disabled={!v.route} style={(st) => [styles.variant, on && styles.variantOn, !v.route && { opacity: 0.55 }, focusRing(st)]}>
                  <Text style={[styles.variantTitle, on && { color: '#FFFFFF' }]}>{v.label}</Text>
                  <Text style={[styles.variantMeta, on && { color: 'rgba(255,255,255,0.85)' }]}>{variantMeta(v)}</Text>
                  {v.error ? <Text style={[styles.variantError, on && { color: 'rgba(255,220,220,0.95)' }]}>{v.error}</Text> : null}
                  <Text style={[styles.variantBlurb, on && { color: 'rgba(255,255,255,0.8)' }]}>{v.blurb}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button title="Akceptuj i prowadź (GPS)" disabled={!activeVariant?.route} onPress={acceptAndGuide} style={{ marginTop: 12, minHeight: 52 }} />
          <Button
            title="Tylko zapisz trasę"
            variant="secondary"
            disabled={!activeVariant?.route}
            onPress={() => {
              if (!activeVariant?.route) return;
              store.setDestination({ coordinate: activeVariant.destination, label: activeVariant.destinationLabel });
              store.setWaypoints(activeVariant.waypoints.map((c, i) => ({ coordinate: c, label: activeVariant.viaLabels[i] ?? `Punkt ${i + 1}` })));
              store.setRoute(activeVariant.route);
              router.push('/route');
            }}
            style={{ marginTop: 8 }}
          />
        </>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={(st) => [styles.footerLink, focusRing(st)]}>
        <Text style={styles.footerLinkTxt}>Zmień start lub tryb</Text>
        <Feather name="chevron-right" size={16} color={colors.textMuted} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3, marginTop: 20, marginBottom: 10 },
  hint: { fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: -4, marginBottom: 10 },
  kmSuffix: { alignSelf: 'center', fontSize: 15, fontWeight: '700', color: colors.textMuted, paddingHorizontal: 4 },
  sectionHead: { marginTop: 18, marginBottom: 6, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  link: { fontSize: 15, fontWeight: '600', color: colors.text },
  mapWrap: { height: 280, borderRadius: 28, overflow: 'hidden', marginTop: 8, backgroundColor: colors.cream, position: 'relative' },
  callout: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(28,28,30,0.92)',
  },
  calloutTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', lineHeight: 20, letterSpacing: -0.2 },
  calloutMeta: { marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.72)' },
  calloutBtn: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', justifyContent: 'center' },
  calloutBtnOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  calloutBtnTxt: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  calloutBtnTxtOn: { color: '#1C1C1E' },
  mapTools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  toolChip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, justifyContent: 'center' },
  toolChipOn: { backgroundColor: '#111111', borderColor: '#111111' },
  toolChipTxt: { fontSize: 13, fontWeight: '600', color: colors.text },
  cacheNote: { marginTop: 10, fontSize: 13, color: colors.textMuted },
  empty: { fontSize: 14, color: colors.textMuted, marginBottom: 4, lineHeight: 20 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 10 },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 12, paddingBottom: 6, minHeight: 48 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22, letterSpacing: -0.2 },
  rowMeta: { marginTop: 3, fontSize: 13, color: colors.textMuted },
  rowFit: { marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.text },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionGhost: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, justifyContent: 'center' },
  actionGhostOn: { backgroundColor: '#111111', borderColor: '#111111' },
  actionGhostTxt: { fontSize: 14, fontWeight: '600', color: colors.text },
  variant: { paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.paper },
  variantOn: { backgroundColor: '#111111' },
  variantTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  variantMeta: { marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  variantError: { marginTop: 6, fontSize: 12, lineHeight: 17, color: colors.danger },
  variantBlurb: { marginTop: 6, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  footerLink: { marginTop: 20, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footerLinkTxt: { fontSize: 15, fontWeight: '600', color: colors.text },
});
