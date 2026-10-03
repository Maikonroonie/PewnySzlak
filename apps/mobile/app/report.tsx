import { useMutation } from '@tanstack/react-query';
import { barrierTypeLabels, barrierTypeSchema, type BarrierType, type Coordinate } from '@pewnyszlak/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { api, ApiError } from '../src/api/client';
import MapView from '../src/components/map/MapView';
import { Screen } from '../src/components/Screen';
import { Button, Card, Choice, Field, H1, Input, Notice, P, Row, Small } from '../src/components/ui';
import { announce, useFocusOnMount, useReduceMotion } from '../src/lib/a11y';
import { getCurrentPosition } from '../src/lib/location';
import { useStore } from '../src/state/store';
import { colors, spacing } from '../src/theme';

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lon?: string; edgeIds?: string; name?: string }>();
  const { installationId, dataMode } = useStore();
  const reduceMotion = useReduceMotion();
  const h1 = useFocusOnMount<Text>([]);
  const initial = params.lat && params.lon ? { latitude: Number(params.lat), longitude: Number(params.lon) } : null;
  const [coordinate, setCoordinate] = useState<Coordinate | null>(initial);
  const [type, setType] = useState<BarrierType>('obstacle');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const edgeIds = params.edgeIds ? params.edgeIds.split(',').filter(Boolean) : [];

  const send = useMutation({
    mutationFn: () => api.report({ type, title: title.trim() || barrierTypeLabels[type], description: description.trim(), coordinate: coordinate!, edgeIds, installationId }),
    onSuccess: (r) => { announce('Zgłoszenie zapisane. Dziękujemy.'); router.replace(`/barrier/${r.barrier.id}`); },
    onError: (e) => announce(`Nie udało się wysłać zgłoszenia: ${e instanceof Error ? e.message : ''}`),
  });

  const useGps = async () => {
    setLocating(true);
    const st = await getCurrentPosition();
    setLocating(false);
    if (st.status === 'ok') { setCoordinate(st.coordinate); setLocMsg(null); announce('Ustawiono miejsce zgłoszenia na Twoją pozycję.'); }
    else if (st.status === 'denied' || st.status === 'unavailable') setLocMsg(st.message);
  };

  const err = send.error as ApiError | Error | null;

  return (
    <Screen testID="screen-report">
      <H1 ref={h1}>Zgłoś barierę</H1>
      <Small>Zgłoszenie jest anonimowe (losowy identyfikator instalacji). Trafia do innych użytkowników jako „niezweryfikowane zgłoszenie” i od razu wpływa na wyznaczane trasy. Operator może je zweryfikować.</Small>
      {dataMode === 'demo' ? <Notice tone="warn" title="Tryb demo" text="Zgłoszenie zostanie zapisane w danych bieżących (demo nie ma osobnych zgłoszeń użytkowników)." /> : null}

      <Field label="Rodzaj bariery">
        <Choice label="Rodzaj bariery" value={type} onChange={setType} options={barrierTypeSchema.options.map((t) => ({ value: t, label: barrierTypeLabels[t] }))} />
      </Field>
      <Field label="Krótki opis (tytuł)" hint="Np. „Rozkopany chodnik, przejście jezdnią”. 3–120 znaków.">
        <Input accessibilityLabel="Krótki opis bariery" value={title} onChangeText={setTitle} maxLength={120} placeholder={barrierTypeLabels[type]} testID="report-title" />
      </Field>
      <Field label="Szczegóły (opcjonalnie)" hint="Co dokładnie, po której stronie, czy jest obejście.">
        <Input accessibilityLabel="Szczegóły zgłoszenia" value={description} onChangeText={setDescription} maxLength={1000} multiline numberOfLines={4} style={{ minHeight: 96, textAlignVertical: 'top' }} />
      </Field>

      <Field label="Miejsce" hint={params.name ? `Odcinek: ${params.name}` : 'Dotknij mapy, aby przesunąć punkt, lub użyj swojej pozycji.'}>
        <Row wrap style={{ marginBottom: spacing(1) }}>
          <Button title="Moja pozycja" icon="◎" variant="secondary" loading={locating} onPress={useGps} />
          <P>{coordinate ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}` : 'Nie wskazano miejsca.'}</P>
        </Row>
        {locMsg ? <Text accessibilityRole="alert" style={{ color: colors.warn, fontSize: 15, marginBottom: spacing(1) }}>{locMsg}</Text> : null}
        <MapView style={{ height: 240 }} center={coordinate ?? undefined} zoom={17} markers={coordinate ? [{ id: 'r', coordinate, kind: 'pin' }] : []} reduceMotion={reduceMotion} accessibilityLabel={coordinate ? 'Mapa z miejscem zgłoszenia' : 'Mapa – wskaż miejsce zgłoszenia'} onPress={(c) => { setCoordinate(c); announce('Przesunięto miejsce zgłoszenia.'); }} />
      </Field>

      {err ? <Notice tone="danger" title={err instanceof ApiError && err.code === 'RATE_LIMIT' ? 'Limit zgłoszeń' : 'Nie udało się wysłać'} text={err.message} /> : null}

      <Card>
        <Small>Zgłaszając, potwierdzasz, że widziałeś/-aś tę przeszkodę osobiście. Nie podawaj danych osobowych. Nadużycia są usuwane przez operatora.</Small>
      </Card>
      <Row wrap style={{ marginTop: spacing(1) }}>
        <Button title="Wyślij zgłoszenie" loading={send.isPending} disabled={!coordinate} onPress={() => send.mutate()} testID="report-submit" />
        <Button title="Anuluj" variant="secondary" onPress={() => router.back()} />
      </Row>
    </Screen>
  );
}
