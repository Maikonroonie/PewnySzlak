import { useMutation } from '@tanstack/react-query';
import type { AssistantAction, AssistantResponse, Place } from '@pewnyszlak/domain';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../src/api/client';
import { EvidenceList } from '../src/components/EvidenceList';
import { placeLabel } from '../src/components/PlaceSearch';
import { Screen } from '../src/components/Screen';
import { Badge, Button, Card, H1, Input, P, Row, Small, styles, focusRing } from '../src/components/ui';
import { announce, useFocusOnMount } from '../src/lib/a11y';
import { useStore } from '../src/state/store';
import { colors, spacing } from '../src/theme';

type Msg = { role: 'user' | 'assistant'; content: string; response?: AssistantResponse };

const SUGGESTIONS = ['Najbliższa poradnia rehabilitacyjna', 'Jakie bariery są w pobliżu?', 'Skąd są dane?', 'Trasa do Wawel'];

export default function AssistantScreen() {
  const router = useRouter();
  const store = useStore();
  const h1 = useFocusOnMount<Text>([]);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const scroll = useRef<ScrollView>(null);
  const near = store.origin?.coordinate ?? store.destination?.coordinate;

  const ask = useMutation({
    mutationFn: (message: string) => api.assistant({ message, coordinate: near, preferences: store.preferences, history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })) }),
    onMutate: (message) => { setMessages((m) => [...m, { role: 'user', content: message }]); setText(''); announce('Wysłano. Czekam na odpowiedź.'); },
    onSuccess: (r) => { setMessages((m) => [...m, { role: 'assistant', content: r.message, response: r }]); announce(r.message); setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50); },
    onError: (e) => { setMessages((m) => [...m, { role: 'assistant', content: `Nie udało się uzyskać odpowiedzi: ${e instanceof Error ? e.message : 'błąd'}` }]); },
  });

  const run = (a: AssistantAction) => {
    if (a.type === 'route-to') { store.setDestination({ coordinate: a.destination, label: a.placeName }); announce(`Ustawiono cel: ${a.placeName}`); router.push('/'); }
    else if (a.type === 'open-sources') router.push('/sources');
    else if (a.type === 'open-preferences') router.push('/preferences');
    else if (a.type === 'show-facilities') ask.mutate(`Pokaż placówki: ${a.benefit}`);
  };

  const setDest = (p: Place) => { if (p.coordinate) { store.setDestination({ coordinate: p.coordinate, label: placeLabel(p), placeId: p.id }); announce(`Ustawiono cel: ${placeLabel(p)}`); router.push('/'); } };

  return (
    <Screen scroll={false} testID="screen-assistant">
      <H1 ref={h1}>Asystent</H1>
      <Small>Odpowiada wyłącznie na podstawie danych aplikacji i zawsze podaje źródło oraz datę. Nie potwierdza dostępności – mówi, co wynika z danych i czego brakuje.</Small>
      <ScrollView ref={scroll} style={{ flex: 1, marginVertical: spacing(1) }} role="log" accessibilityLabel="Rozmowa">
        {messages.length === 0 ? (
          <View>
            <P muted>Przykładowe pytania:</P>
            <Row wrap>{SUGGESTIONS.map((s) => <Button key={s} title={s} variant="secondary" onPress={() => ask.mutate(s)} />)}</Row>
          </View>
        ) : null}
        {messages.map((m, i) => (
          <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : '100%', marginBottom: spacing(1) }}>
            <Card tone={m.role === 'assistant' ? 'info' : undefined} style={m.role === 'user' ? { backgroundColor: colors.surface } : undefined}>
              <Small>{m.role === 'user' ? 'Ty' : `Asystent${m.response ? ` · ${m.response.mode === 'llm' ? 'model językowy + dane aplikacji' : 'tryb regułowy'}` : ''}`}</Small>
              <P>{m.content}</P>
              {m.response?.places.length ? (
                <View style={{ marginTop: spacing(1), gap: 6 }}>
                  {m.response.places.slice(0, 5).map((p) => (
                    <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Ustaw cel: ${placeLabel(p)}`} onPress={() => setDest(p)} style={(st) => [{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing(1) }, focusRing(st)]}>
                      <Text style={[styles.p, { fontWeight: '600' }]}>{p.name}</Text>
                      {p.address ? <Small>{p.address}</Small> : null}
                      <Row wrap style={{ marginTop: 4 }}>
                        {p.distanceM != null ? <Badge text={`${Math.round(p.distanceM)} m`} tone="muted" /> : null}
                        {p.amenities?.ramp === true ? <Badge text="deklaracja: podjazd" tone="info" /> : null}
                        {p.amenities?.toilet === true ? <Badge text="deklaracja: toaleta" tone="info" /> : null}
                        {p.amenities?.elevator === true ? <Badge text="deklaracja: winda" tone="info" /> : null}
                        {!p.entranceVerified ? <Badge text="dojście niezweryfikowane" tone="warn" /> : null}
                      </Row>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {m.response?.actions.length ? <Row wrap style={{ marginTop: spacing(1) }}>{m.response.actions.map((a, j) => <Button key={j} title={a.label} variant="secondary" onPress={() => run(a)} />)}</Row> : null}
              {m.response?.citations.length ? <View style={{ marginTop: spacing(1) }}><Small style={{ fontWeight: '700' }}>Źródła</Small><EvidenceList evidence={m.response.citations.slice(0, 4)} compact /></View> : null}
              {m.response ? <Small style={{ marginTop: spacing(1), fontStyle: 'italic' }}>{m.response.disclaimer}</Small> : null}
            </Card>
          </View>
        ))}
        {ask.isPending ? <Small>Asystent odpowiada…</Small> : null}
      </ScrollView>
      <Row>
        <Input accessibilityLabel="Twoje pytanie" value={text} onChangeText={setText} placeholder="Zadaj pytanie…" style={{ flex: 1 }} onSubmitEditing={() => text.trim() && ask.mutate(text.trim())} returnKeyType="send" testID="assistant-input" />
        <Button title="Wyślij" disabled={!text.trim()} loading={ask.isPending} onPress={() => ask.mutate(text.trim())} />
      </Row>
    </Screen>
  );
}
