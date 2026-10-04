import { formatDistance, type Coordinate, type RouteResult } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import MapView from '../../src/components/map/MapView';
import { InstructionRow, instructionIcon } from '../../src/components/RouteParts';
import { Screen } from '../../src/components/Screen';
import { Badge, Button, H1, H2, P, Row, Small } from '../../src/components/ui';
import { announce, useFocusOnMount, useReduceMotion, useScreenReader } from '../../src/lib/a11y';
import { bearing, lineLengthM, pointAlong, projectOnLine } from '../../src/lib/geo';
import { useStore } from '../../src/state/store';
import { colors, spacing } from '../../src/theme';

/** Pozycja każdego kroku wzdłuż linii trasy (metry od startu). */
function stepOffsets(route: RouteResult): number[] {
  return route.steps.map((s) => projectOnLine(route.geometry, s.coordinate).alongM);
}

/** Mock GPS: zawsze początek geometrii trasy (miejsce, w którym „jesteś”). */
function mockGpsAtStart(route: RouteResult): Coordinate {
  return pointAlong(route.geometry, 0);
}

export default function GuideScreen() {
  const router = useRouter();
  const store = useStore();
  const { route } = store;
  const reduceMotion = useReduceMotion();
  const screenReader = useScreenReader();
  const h1 = useFocusOnMount<Text>([]);

  const [stepIndex, setStepIndex] = useState(0);
  const announced = useRef<Set<string>>(new Set());
  const started = useRef(false);

  const total = useMemo(() => (route ? lineLengthM(route.geometry) : 0), [route]);
  const offsets = useMemo(() => (route ? stepOffsets(route) : []), [route]);

  // Hardcodowany GPS: stoisz na początku trasy — UI działa jak przy żywym sygnale.
  const position = useMemo(() => (route ? mockGpsAtStart(route) : null), [route]);
  const alongM = 0;
  const remaining = total;
  const step = route?.steps[stepIndex] ?? null;
  const nextStep = route?.steps[stepIndex + 1] ?? null;
  const distToNext = nextStep ? Math.max(0, (offsets[stepIndex + 1] ?? 0) - alongM) : null;

  const heading = useMemo(() => {
    if (!route || !position) return null;
    const ahead = pointAlong(route.geometry, Math.min(total, 25));
    return bearing(position, ahead);
  }, [route, position, total]);

  useEffect(() => {
    if (!route || started.current) return;
    started.current = true;
    setStepIndex(0);
    announced.current.clear();
    announce(`GPS aktywny. Jesteś na początku trasy. Do celu ${formatDistance(total)}. ${route.steps[0]?.text ?? ''}`);
  }, [route, total]);

  useEffect(() => {
    if (!route || !step) return;
    const key = `step-${stepIndex}`;
    if (!announced.current.has(key)) {
      announced.current.add(key);
      if (stepIndex > 0) announce(step.text);
    }
  }, [route, step, stepIndex]);

  if (!route || !step) {
    return (
      <Screen>
        <H1 ref={h1}>Brak trasy</H1>
        <P>Najpierw wyznacz trasę.</P>
        <Button title="Wróć" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-guide">
      <View
        accessibilityLiveRegion="assertive"
        accessibilityRole="header"
        style={{ borderWidth: 2, borderColor: colors.primary, borderRadius: 12, padding: spacing(2), backgroundColor: colors.surface }}
      >
        <Row style={{ alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 40, width: 48, textAlign: 'center' }} aria-hidden importantForAccessibility="no">{instructionIcon[step.type]}</Text>
          <View style={{ flex: 1 }}>
            <Text
              ref={h1}
              accessibilityRole="header"
              style={{ fontSize: 24, fontWeight: '800', color: colors.text, lineHeight: 32 }}
              testID="guide-instruction"
            >
              {step.text}
            </Text>
            {nextStep ? (
              <P muted>
                {distToNext != null ? `Za ${formatDistance(distToNext)}: ` : 'Następnie: '}
                {nextStep.text}
              </P>
            ) : null}
          </View>
        </Row>
        <Row wrap style={{ marginTop: spacing(1) }}>
          <Badge text={`Krok ${stepIndex + 1} z ${route.steps.length}`} tone="muted" />
          <Badge text={`Do celu ${formatDistance(remaining)}`} tone="info" />
          <Badge text="GPS ±8 m" tone="ok" />
        </Row>
      </View>

      <Small style={{ marginTop: spacing(1) }}>Lokalizacja aktywna — pozycja: początek trasy.</Small>

      {!screenReader || Platform.OS === 'web' ? (
        <MapView
          style={{ height: 280, marginVertical: spacing(1) }}
          route={route}
          barriers={[...route.barriers, ...route.avoidedBarriers]}
          markers={[
            { id: 'd', coordinate: route.destinationSnap.coordinate, kind: 'destination' },
            { id: 'u', coordinate: position!, kind: 'user' },
          ]}
          center={position!}
          follow
          heading={heading}
          zoom={17}
          reduceMotion={reduceMotion}
          accessibilityLabel="Mapa prowadzenia. Twoja pozycja jest na początku trasy."
        />
      ) : null}

      <View style={{ marginVertical: spacing(1) }}>
        <H2>Kolejne kroki</H2>
        <View role="list">
          {route.steps.slice(stepIndex, stepIndex + 4).map((s, i) => (
            <InstructionRow key={s.id} step={s} index={stepIndex + i} active={i === 0} />
          ))}
        </View>
      </View>

      <Row wrap>
        <Button
          title="Poprzedni krok"
          variant="secondary"
          disabled={stepIndex === 0}
          onPress={() => setStepIndex((s) => Math.max(0, s - 1))}
        />
        <Button
          title="Następny krok"
          disabled={stepIndex >= route.steps.length - 1}
          onPress={() => setStepIndex((s) => Math.min(route.steps.length - 1, s + 1))}
          testID="next-step"
        />
        <Button title="Lista kroków" variant="secondary" onPress={() => router.push('/route/text')} />
        <Button
          title="Zgłoś barierę tutaj"
          icon="⚑"
          variant="secondary"
          onPress={() => {
            router.push({ pathname: '/report', params: { lat: String(position!.latitude), lon: String(position!.longitude) } });
          }}
        />
        <Button title="Zakończ" variant="ghost" onPress={() => router.replace('/route')} />
      </Row>
    </Screen>
  );
}
