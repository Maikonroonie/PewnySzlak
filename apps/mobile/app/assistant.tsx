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

type Chip =
  | { kind: 'ask'; label: string; message: string }
  | { kind: 'group'; id: string; label: string };

const FOOD_CHIPS: Chip[] = [
  { kind: 'ask', label: 'Włoskie', message: 'Szukam restauracji włoskiej w okolicy' },
  { kind: 'ask', label: 'Burgery', message: 'Szukam burgerów w okolicy' },
  { kind: 'ask', label: 'Pizza', message: 'Szukam pizzy w okolicy' },
  { kind: 'ask', label: 'Azjatyckie', message: 'Szukam kuchni azjatyckiej w okolicy' },
  { kind: 'ask', label: 'Kawiarnia', message: 'Szukam kawiarni w okolicy' },
  { kind: 'ask', label: 'Inne', message: 'Szukam jedzenia w okolicy' },
];

const ROOT_CHIPS: Chip[] = [
  { kind: 'group', id: 'food', label: 'Jedzenie' },
  { kind: 'ask', label: 'Toaleta blisko', message: 'Toaleta blisko' },
  { kind: 'ask', label: 'Czy omija remont?', message: 'Czy omija remont?' },
  { kind: 'ask', label: 'Poradnia rehabilitacyjna', message: 'Najbliższa poradnia rehabilitacyjna' },
  { kind: 'ask', label: 'Skąd są dane?', message: 'Skąd są dane?' },
];

export default function AssistantScreen() {
  const router = useRouter();
  const store = useStore();
  const h1 = useFocusOnMount<Text>([]);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chipGroup, setChipGroup] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const near = store.origin?.coordinate ?? store.destination?.coordinate;

  const ask = useMutation({
    mutationFn: (message: string) => api.assistant({ message, coordinate: near, preferences: store.preferences, history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })) }),
    onMutate: (message) => {
      setChipGroup(null);
      setMessages((m) => [...m, { role: 'user', content: message }]);
      setText('');
      announce('Wysłano. Czekam na odpowiedź.');
    },
    onSuccess: (r) => { setMessages((m) => [...m, { role: 'assistant', content: r.message, response: r }]); announce(r.message); setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50); },
    onError: (e) => { setMessages((m) => [...m, { role: 'assistant', content: `Nie udało się uzyskać odpowiedzi: ${e instanceof Error ? e.message : 'błąd'}` }]); },
  });

  const chips = chipGroup === 'food' ? FOOD_CHIPS : ROOT_CHIPS;
  const onChip = (c: Chip) => {
    if (c.kind === 'group') {
      setChipGroup(c.id);
      announce(c.id === 'food' ? 'Wybierz rodzaj jedzenia' : c.label);
      return;
    }
    ask.mutate(c.message);
  };

  const run = (a: AssistantAction) => {
    if (a.type === 'route-to') { store.setDestination({ coordinate: a.destination, label: a.placeName }); announce(`Ustawiono cel: ${a.placeName}`); router.push('/'); }
    else if (a.type === 'open-sources') router.push('/sources');
    else if (a.type === 'open-preferences') router.push('/preferences');
    else if (a.type === 'open-explore') {
      if (!store.origin && near) store.setOrigin({ coordinate: near, label: 'Start' });
      router.push('/explore');
    }
    else if (a.type === 'show-facilities') ask.mutate(`Pokaż placówki: ${a.benefit}`);
  };

  const setDest = (p: Place) => { if (p.coordinate) { store.setDestination({ coordinate: p.coordinate, label: placeLabel(p), placeId: p.id }); announce(`Ustawiono cel: ${placeLabel(p)}`); router.push('/'); } };

  return (
    <Screen scroll={false} testID="screen-assistant">
      <H1 ref={h1}>Asystent</H1>
      {!near ? <Small>Ustaw start na ekranie głównym — wtedy jedzenie będzie szukane od Twojej pozycji.</Small> : null}
      <ScrollView ref={scroll} style={{ flex: 1, marginVertical: spacing(1) }} role="log" accessibilityLabel="Rozmowa">
        {messages.length === 0 ? (
          <View style={{ gap: 8 }}>
            {chipGroup === 'food' ? (
              <Button title="← Wróć" variant="ghost" onPress={() => { setChipGroup(null); announce('Menu główne'); }} />
            ) : null}
            <Row wrap>{chips.map((c) => <Button key={c.label} title={c.label} variant="secondary" onPress={() => onChip(c)} />)}</Row>
          </View>
        ) : null}
        {messages.map((m, i) => (
          <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : '100%', marginBottom: spacing(1) }}>
            <Card tone={m.role === 'assistant' ? 'info' : undefined} style={m.role === 'user' ? { backgroundColor: colors.surface } : undefined}>
              <Small>{m.role === 'user' ? 'Ty' : `Asystent${m.response ? ` · ${m.response.mode === 'llm' ? 'LLM' : 'reguły'}` : ''}`}</Small>
              <P>{m.content}</P>
              {m.response?.places.length ? (
                <View style={{ marginTop: spacing(1), gap: 6 }}>
                  {m.response.places.slice(0, 5).map((p) => (
                    <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Ustaw cel: ${placeLabel(p)}`} onPress={() => setDest(p)} style={(st) => [{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing(1) }, focusRing(st)]}>
                      <Text style={[styles.p, { fontWeight: '600' }]}>{p.name}</Text>
                      {p.address ? <Small>{p.address}</Small> : null}
                      <Row wrap style={{ marginTop: 4 }}>
                        {p.distanceM != null ? <Badge text={`${Math.round(p.distanceM)} m`} tone="muted" /> : null}
                        {p.amenities?.ramp === true ? <Badge text="podjazd (dekl.)" tone="info" /> : null}
                        {p.amenities?.toilet === true ? <Badge text="toaleta (dekl.)" tone="info" /> : null}
                        {p.amenities?.elevator === true ? <Badge text="winda (dekl.)" tone="info" /> : null}
                        {!p.entranceVerified ? <Badge text="dojście: brak weryf." tone="warn" /> : null}
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
