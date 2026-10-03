import { useMutation } from '@tanstack/react-query';
import { formatDistance, type Coordinate, type RouteResult } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { api, ApiError } from '../../src/api/client';
import MapView from '../../src/components/map/MapView';
import { InstructionRow, instructionIcon } from '../../src/components/RouteParts';
import { Screen } from '../../src/components/Screen';
import { Badge, Button, Card, H1, H2, Notice, P, Row, Small, Switch } from '../../src/components/ui';
import { announce, useFocusOnMount, useReduceMotion, useScreenReader } from '../../src/lib/a11y';
import { bearing, haversineM, lineLengthM, pointAlong, projectOnLine } from '../../src/lib/geo';
import { useWatchPosition } from '../../src/lib/location';
import { useStore } from '../../src/state/store';
import { colors, spacing } from '../../src/theme';

const OFF_ROUTE_M = 35;
const OFF_ROUTE_FIXES = 3;
const RECALC_COOLDOWN_MS = 20_000;
const ARRIVE_M = 15;

/** Pozycja każdego kroku wzdłuż linii trasy (metry od startu). */
function stepOffsets(route: RouteResult): number[] {
  return route.steps.map((s) => projectOnLine(route.geometry, s.coordinate).alongM);
}

export default function GuideScreen() {
  const router = useRouter();
  const store = useStore();
  const { route, destination, lastRoute } = store;
  const reduceMotion = useReduceMotion();
  const screenReader = useScreenReader();
  const h1 = useFocusOnMount<Text>([]);

  const [simulate, setSimulate] = useState(false);
  const [simAlong, setSimAlong] = useState(0);
  const [manualStep, setManualStep] = useState(0);
  const [offRouteCount, setOffRouteCount] = useState(0);
  const [lastRecalc, setLastRecalc] = useState(0);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const announced = useRef<Set<string>>(new Set());

  const gps = useWatchPosition(!simulate);
  const total = useMemo(() => (route ? lineLengthM(route.geometry) : 0), [route]);
  const offsets = useMemo(() => (route ? stepOffsets(route) : []), [route]);

  // Symulacja: 1,2 m/s wzdłuż trasy (do demo i testów bez GPS).
  useEffect(() => {
    if (!simulate || !route) return;
    const t = setInterval(() => setSimAlong((a) => Math.min(total, a + 2.4)), 2000);
    return () => clearInterval(t);
  }, [simulate, route, total]);

  const position: Coordinate | null = simulate && route ? pointAlong(route.geometry, simAlong) : gps.status === 'ok' ? gps.coordinate : null;
  const gpsHeading = gps.status === 'ok' ? gps.heading : null;
  const projected = useMemo(() => (route && position ? projectOnLine(route.geometry, position) : null), [route, position]);
  const hasFix = !!projected;

  // Bieżący krok: ostatni krok, którego pozycja na trasie jest przed nami (z tolerancją 8 m).
  const autoStep = useMemo(() => {
    if (!projected) return 0;
    let idx = 0;
    for (let i = 0; i < offsets.length; i++) if (offsets[i]! <= projected.alongM + 8) idx = i;
    return Math.min(idx, offsets.length - 1);
  }, [projected, offsets]);
  const stepIndex = hasFix ? autoStep : manualStep;
  const step = route?.steps[stepIndex] ?? null;
  const nextStep = route?.steps[stepIndex + 1] ?? null;
  const distToNext = projected && nextStep ? Math.max(0, offsets[stepIndex + 1]! - projected.alongM) : null;
  const remaining = projected ? Math.max(0, total - projected.alongM) : null;
  const heading = useMemo(() => {
    if (!route || !projected) return gpsHeading;
    const ahead = pointAlong(route.geometry, Math.min(total, projected.alongM + 15));
    return bearing(projected.point, ahead);
  }, [route, projected, total, gpsHeading]);

  // Komunikaty głosowe/czytnikowe: nowy krok, zbliżanie się, przybycie.
  useEffect(() => {
    if (!route || !step) return;
    const key = `step-${stepIndex}`;
    if (!announced.current.has(key)) { announced.current.add(key); announce(step.text); }
    if (nextStep && distToNext != null && distToNext < 25 && !announced.current.has(`pre-${stepIndex + 1}`)) { announced.current.add(`pre-${stepIndex + 1}`); announce(`Za ${Math.round(distToNext / 5) * 5} metrów: ${nextStep.text}`); }
    if (remaining != null && remaining < ARRIVE_M && !arrived && projected && projected.distanceM < OFF_ROUTE_M) { setArrived(true); announce('Jesteś u celu. Sprawdź dojście do wejścia – nie zawsze jest zmapowane.'); }
  }, [route, step, stepIndex, nextStep, distToNext, remaining, arrived, projected]);

  // Zejście z trasy → po kilku odczytach przeliczenie od bieżącej pozycji.
  const recalc = useMutation({
    mutationFn: (from: Coordinate) => api.route(from, (destination ?? lastRoute?.destination)!.coordinate, store.preferences),
    onSuccess: (r) => { store.setRoute(r); announced.current.clear(); setOffRouteCount(0); setRecalcError(null); setSimAlong(0); announce(`Przeliczono trasę od Twojej pozycji: ${formatDistance(r.distanceM)}.`); },
    onError: (e) => { setRecalcError(e instanceof ApiError && e.noRoute ? e.noRoute.explanation : e instanceof Error ? e.message : 'błąd'); announce('Nie udało się przeliczyć trasy. Wróć na trasę lub zaplanuj ją ponownie.'); },
  });
  useEffect(() => {
    if (!projected || !position || arrived) return;
    if (projected.distanceM > OFF_ROUTE_M) {
      setOffRouteCount((c) => c + 1);
    } else if (offRouteCount > 0) setOffRouteCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);
  useEffect(() => {
    if (offRouteCount === OFF_ROUTE_FIXES) announce(`Zeszliśmy z trasy o ${Math.round(projected?.distanceM ?? 0)} metrów. Przeliczam trasę.`);
    if (offRouteCount >= OFF_ROUTE_FIXES && position && Date.now() - lastRecalc > RECALC_COOLDOWN_MS && !recalc.isPending && (destination ?? lastRoute?.destination)) {
      setLastRecalc(Date.now());
      recalc.mutate(position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offRouteCount]);

  if (!route || !step) {
    return <Screen><H1 ref={h1}>Brak trasy</H1><P>Najpierw wyznacz trasę.</P><Button title="Wróć" onPress={() => router.replace('/')} /></Screen>;
  }

  const gpsIssue = gps.status === 'denied' || gps.status === 'unavailable' ? gps.message : null;
  const offRoute = offRouteCount >= OFF_ROUTE_FIXES;

  return (
    <Screen testID="screen-guide">
      <View accessibilityLiveRegion="assertive" accessibilityRole="header" style={{ borderWidth: 2, borderColor: offRoute ? colors.danger : colors.primary, borderRadius: 12, padding: spacing(2), backgroundColor: colors.surface }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 40, width: 48, textAlign: 'center' }} aria-hidden importantForAccessibility="no">{instructionIcon[step.type]}</Text>
          <View style={{ flex: 1 }}>
            <Text ref={h1} accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', color: colors.text, lineHeight: 32 }} testID="guide-instruction">{arrived ? 'Jesteś u celu' : step.text}</Text>
            {!arrived && nextStep ? <P muted>{distToNext != null ? `Za ${formatDistance(distToNext)}: ` : 'Następnie: '}{nextStep.text}</P> : null}
          </View>
        </Row>
        <Row wrap style={{ marginTop: spacing(1) }}>
          <Badge text={`Krok ${stepIndex + 1} z ${route.steps.length}`} tone="muted" />
          {remaining != null ? <Badge text={`Do celu ${formatDistance(remaining)}`} tone="info" /> : <Badge text={`Trasa ${formatDistance(route.distanceM)}`} tone="info" />}
          {hasFix && !simulate ? <Badge text={`GPS ±${Math.round((gps.status === 'ok' && gps.accuracyM) || 0)} m`} tone={gps.status === 'ok' && (gps.accuracyM ?? 99) > 30 ? 'warn' : 'ok'} /> : null}
          {simulate ? <Badge text="SYMULACJA" tone="warn" /> : null}
          {offRoute ? <Badge text="Poza trasą" tone="danger" /> : null}
        </Row>
      </View>

      {gpsIssue && !simulate ? <Notice tone="warn" title="Brak lokalizacji" text={`${gpsIssue} Możesz przechodzić kroki ręcznie przyciskami poniżej.`} /> : null}
      {gps.status === 'requesting' && !simulate ? <Small style={{ marginTop: spacing(1) }}>Czekam na sygnał GPS…</Small> : null}
      {recalcError ? <Notice tone="danger" title="Nie udało się przeliczyć trasy" text={recalcError} /> : null}
      {recalc.isPending ? <Small>Przeliczam trasę…</Small> : null}

      {!screenReader || Platform.OS === 'web' ? (
        <MapView
          style={{ height: 280, marginVertical: spacing(1) }}
          route={route}
          barriers={[...route.barriers, ...route.avoidedBarriers]}
          markers={[{ id: 'd', coordinate: route.destinationSnap.coordinate, kind: 'destination' }, ...(position ? [{ id: 'u', coordinate: position, kind: 'user' as const }] : [])]}
          center={position ?? route.originSnap.coordinate}
          follow={hasFix}
          heading={heading}
          zoom={17}
          reduceMotion={reduceMotion}
          accessibilityLabel={`Mapa prowadzenia. ${position ? 'Twoja pozycja jest zaznaczona.' : 'Brak pozycji.'}`}
        />
      ) : null}
      <View style={{ marginVertical: spacing(1) }}>
        <H2>Kolejne kroki</H2>
        <View role="list">
          {route.steps.slice(stepIndex, stepIndex + 4).map((s, i) => <InstructionRow key={s.id} step={s} index={stepIndex + i} active={i === 0} />)}
        </View>
      </View>

      <Row wrap>
        {!hasFix ? (
          <>
            <Button title="Poprzedni krok" variant="secondary" disabled={manualStep === 0} onPress={() => setManualStep((s) => Math.max(0, s - 1))} />
            <Button title="Następny krok" disabled={manualStep >= route.steps.length - 1} onPress={() => setManualStep((s) => Math.min(route.steps.length - 1, s + 1))} testID="next-step" />
          </>
        ) : null}
        {offRoute && position ? <Button title="Przelicz trasę teraz" variant="danger" loading={recalc.isPending} onPress={() => { setLastRecalc(Date.now()); recalc.mutate(position); }} /> : null}
        <Button title="Lista kroków" variant="secondary" onPress={() => router.push('/route/text')} />
        {/* Bez edgeIds – serwer dowiązuje zgłoszenie do najbliższej krawędzi (≤ 30 m), a nie do całego odcinka. */}
        <Button title="Zgłoś barierę tutaj" icon="⚑" variant="secondary" onPress={() => { const c = position ?? step.coordinate; router.push({ pathname: '/report', params: { lat: String(c.latitude), lon: String(c.longitude) } }); }} />
        <Button title="Zakończ" variant="ghost" onPress={() => router.replace('/route')} />
      </Row>
      <Card style={{ marginTop: spacing(1) }}>
        <Switch label="Symuluj przejście trasy" hint={Platform.OS === 'web' ? 'Na komputerze bez GPS: pozycja przesuwa się po trasie.' : 'Do pokazu bez wychodzenia w teren.'} value={simulate} onChange={(v) => { setSimulate(v); setSimAlong(0); setArrived(false); announced.current.clear(); }} />
        <Small>Pozycja GPS jest używana tylko do prowadzenia i przeliczenia trasy; nie jest zapisywana ani wysyłana nigdzie indziej.</Small>
      </Card>
    </Screen>
  );
}
