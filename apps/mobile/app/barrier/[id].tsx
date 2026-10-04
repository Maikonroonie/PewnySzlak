import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { barrierTypeLabels, type FeedbackRequest } from '@pewnyszlak/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { api, ApiError } from '../../src/api/client';
import { EvidenceList, formatDate } from '../../src/components/EvidenceList';
import MapView from '../../src/components/map/MapView';
import { stateLabels, stateTone } from '../../src/components/RouteParts';
import { Screen } from '../../src/components/Screen';
import { Badge, Button, Card, H1, H2, Loading, Notice, P, Row, Small } from '../../src/components/ui';
import { announce, useFocusOnMount, useReduceMotion } from '../../src/lib/a11y';
import { useStore } from '../../src/state/store';
import { spacing } from '../../src/theme';

export default function BarrierScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { installationId, route } = useStore();
  const reduceMotion = useReduceMotion();
  const h1 = useFocusOnMount<Text>([id]);
  const q = useQuery({ queryKey: ['barrier', id], queryFn: () => api.barrier(id!), enabled: !!id });
  const [done, setDone] = useState<string | null>(null);
  const fromRoute = route ? [...route.barriers, ...route.avoidedBarriers].find((b) => b.id === id) ?? null : null;
  const barrier = q.data?.barrier ?? fromRoute;

  const fb = useMutation({
    mutationFn: (action: FeedbackRequest['action']) => api.feedback(id!, { installationId, action }),
    onSuccess: (r, action) => {
      qc.setQueryData(['barrier', id], r);
      qc.invalidateQueries({ queryKey: ['barriers-near'] });
      const msg = action === 'confirm' ? 'Dziękujemy za potwierdzenie.' : action === 'reject' ? 'Zapisano, że nie widzisz tej przeszkody.' : 'Zapisano, że przeszkoda zniknęła.';
      setDone(`${msg} Stan: ${stateLabels[r.barrier.state]}.`);
      announce(msg);
    },
  });

  if (!barrier) return <Screen><H1 ref={h1}>Bariera</H1>{q.isLoading ? <Loading /> : <Notice tone="danger" title="Nie znaleziono bariery" text={q.error instanceof Error ? q.error.message : undefined} />}<Button title="Wróć" variant="secondary" onPress={() => router.back()} /></Screen>;

  const verified = barrier.evidence.find((e) => e.status === 'verified');
  const observed = barrier.evidence.map((e) => e.observedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const fbError = fb.error as ApiError | Error | null;

  return (
    <Screen testID="screen-barrier">
      <H1 ref={h1}>{barrier.title}</H1>
      <Row wrap>
        <Badge text={stateLabels[barrier.state]} tone={stateTone(barrier.state)} />
        <Badge text={barrierTypeLabels[barrier.type]} tone="info" />
        {barrier.blocksRouting ? <Badge text="Blokuje" tone="danger" /> : <Badge text="Ostrzeżenie" tone="muted" />}
        {barrier.isDemo ? <Badge text="Demo" tone="warn" /> : null}
        {verified ? <Badge text="Zweryfikowana" tone="ok" /> : null}
      </Row>
      {barrier.description ? <P style={{ marginTop: spacing(1) }}>{barrier.description}</P> : null}

      <Card style={{ marginTop: spacing(1) }}>
        <Small>Potwierdzenia: {barrier.confirmationCount} · zaprzeczenia: {barrier.rejectionCount} · zniknęła: {barrier.resolvedCount}</Small>
        <Small>Teren: {observed ? formatDate(observed) : 'brak'}</Small>
        <Small>Dodano: {formatDate(barrier.createdAt)} · aktualizacja: {formatDate(barrier.updatedAt)}</Small>
        {barrier.validFrom || barrier.validUntil ? <Small>Okres: {formatDate(barrier.validFrom)} – {barrier.validUntil ? formatDate(barrier.validUntil) : '?'}</Small> : null}
      </Card>

      {barrier.coordinate ? <MapView style={{ height: 220 }} center={barrier.coordinate} zoom={17} barriers={[barrier]} reduceMotion={reduceMotion} accessibilityLabel={`Mapa z położeniem bariery: ${barrier.title}`} /> : null}

      <H2>Źródła</H2>
      <EvidenceList evidence={barrier.evidence} />

      <H2>Na miejscu?</H2>
      <Small style={{ marginBottom: spacing(1) }}>Jedna odpowiedź na urządzenie.</Small>
      {done ? <Notice tone="ok" title={done} /> : null}
      {fbError ? <Notice tone="danger" title="Nie udało się zapisać" text={fbError.message} /> : null}
      <Row wrap>
        <Button title="Jest" variant="secondary" loading={fb.isPending && fb.variables === 'confirm'} disabled={fb.isPending} onPress={() => fb.mutate('confirm')} testID="feedback-confirm" />
        <Button title="Nie ma" variant="secondary" loading={fb.isPending && fb.variables === 'reject'} disabled={fb.isPending} onPress={() => fb.mutate('reject')} />
        <Button title="Już usunięta" variant="secondary" loading={fb.isPending && fb.variables === 'resolved'} disabled={fb.isPending} onPress={() => fb.mutate('resolved')} />
      </Row>
      <Row wrap style={{ marginTop: spacing(2) }}>
        {barrier.coordinate ? <Button title="Omijaj stąd" variant="ghost" onPress={() => router.replace('/')} /> : null}
        <Button title="Wróć" variant="secondary" onPress={() => router.back()} />
      </Row>
    </Screen>
  );
}
