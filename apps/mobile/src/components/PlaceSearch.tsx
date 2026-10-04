import { useQuery } from '@tanstack/react-query';
import { placeCategoryLabel, type Coordinate, type Place } from '@pewnyszlak/domain';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../api/client';
import { announce } from '../lib/a11y';
import { getCurrentPosition } from '../lib/location';
import type { Point } from '../state/store';
import { colors, spacing } from '../theme';
import { Button, Input, Small, styles, focusRing } from './ui';

type Props = {
  label: string;
  value: Point | null;
  onChange: (p: Point | null) => void;
  near?: Coordinate | null;
  allowMyLocation?: boolean;
  onPickOnMap?: () => void;
  nativeID: string;
  recent?: Point[];
};

export function placeLabel(p: Place): string {
  return p.address && p.kind !== 'address' ? `${p.name}, ${p.address}` : p.name;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function PlaceSearch({ label, value, onChange, near, allowMyLocation, onPickOnMap, nativeID, recent = [] }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const search = useQuery({ queryKey: ['places', q, near?.latitude, near?.longitude], queryFn: () => api.searchPlaces(q, near), enabled: open && q.length >= 2, staleTime: 60_000 });

  const results = search.data?.items ?? [];
  const resultsId = `${nativeID}-results`;

  useEffect(() => {
    if (open && search.isSuccess) announce(results.length === 0 ? 'Brak wyników.' : `${results.length} wyników. Przejdź dalej, aby wybrać.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.data]);

  const pick = (p: Place) => {
    if (!p.coordinate) return;
    onChange({ coordinate: p.coordinate, label: placeLabel(p), placeId: p.id });
    setText('');
    setOpen(false);
    announce(`${label}: ${placeLabel(p)}`);
  };

  const useMyLocation = async () => {
    setLocating(true);
    setLocMsg(null);
    const st = await getCurrentPosition();
    setLocating(false);
    if (st.status === 'ok') {
      let labelText = 'Moja lokalizacja';
      try { const r = await api.reverse(st.coordinate); if (r.place) labelText = `Moja lokalizacja (${placeLabel(r.place)})`; } catch { /* offline – zostaje ogólna etykieta */ }
      onChange({ coordinate: st.coordinate, label: labelText });
      announce(`${label}: ${labelText}`);
    } else if (st.status === 'denied' || st.status === 'unavailable') {
      setLocMsg(st.message);
      announce(st.message);
    }
  };

  return (
    <View style={{ marginBottom: spacing(2) }}>
      <Text nativeID={`${nativeID}-label`} style={styles.label}>{label}</Text>
      {value ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: spacing(1.25), backgroundColor: colors.surface }}>
            <Text style={styles.p}>{value.label}</Text>
          </View>
          <Button title="Zmień" variant="secondary" accessibilityLabel={`Zmień: ${label}`} onPress={() => { onChange(null); setOpen(true); }} />
        </View>
      ) : (
        <View>
          <Input
            accessibilityLabel={label}
            accessibilityLabelledBy={`${nativeID}-label`}
            placeholder="Wpisz adres, nazwę miejsca lub placówki"
            value={text}
            onChangeText={(t) => { setText(t); setOpen(true); }}
            onFocus={() => setOpen(true)}
            autoCorrect={false}
            returnKeyType="search"
            testID={`${nativeID}-input`}
          />
          <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1), flexWrap: 'wrap' }}>
            {allowMyLocation ? <Button title="Moja lokalizacja" icon="◎" variant="secondary" loading={locating} onPress={useMyLocation} accessibilityLabel={`${label}: użyj mojej lokalizacji`} /> : null}
            {onPickOnMap ? <Button title="Wskaż na mapie" icon="⌖" variant="secondary" onPress={onPickOnMap} accessibilityLabel={`${label}: wskaż punkt na mapie`} /> : null}
          </View>
          {locMsg ? <Text accessibilityRole="alert" style={[styles.p, { color: colors.warn, marginTop: spacing(1) }]}>{locMsg}</Text> : null}
          {open && (q.length >= 2 || recent.length > 0) ? (
            <View nativeID={resultsId} role="region" accessibilityLabel={`Wyniki wyszukiwania: ${label}`} style={{ marginTop: spacing(1), borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' }}>
              {q.length < 2 ? recent.map((r) => (
                <Pressable key={r.label} accessibilityRole="button" accessibilityLabel={`Ostatnio: ${r.label}`} onPress={() => { onChange(r); setOpen(false); }} style={(st) => [rowStyle, focusRing(st)]}>
                  <Text style={styles.p}>↺ {r.label}</Text>
                </Pressable>
              )) : null}
              {q.length >= 2 && search.isLoading ? <Small style={{ padding: spacing(1.5) }}>Szukam…</Small> : null}
              {q.length >= 2 && search.isError ? <Text accessibilityRole="alert" style={[styles.p, { color: colors.danger, padding: spacing(1.5) }]}>Nie udało się wyszukać: {(search.error as Error).message}</Text> : null}
              {q.length >= 2 && search.isSuccess && results.length === 0 ? <Small style={{ padding: spacing(1.5) }}>Brak wyników w Krakowie dla „{q}”. Spróbuj nazwy ulicy z numerem.</Small> : null}
              {results.map((p) => {
                const cat = p.kind === 'facility' ? 'Placówka NFZ' : p.category ? placeCategoryLabel(p.category) : null;
                const subtitle = [p.address && p.kind !== 'address' ? p.address : null, cat && cat !== p.name ? cat : null].filter(Boolean).join(' · ');
                return (
                  <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${placeLabel(p)}${cat ? `, ${cat}` : ''}`} onPress={() => pick(p)} disabled={!p.coordinate} style={(st) => [rowStyle, focusRing(st)]}>
                    <Text style={styles.p}>{p.name}</Text>
                    {subtitle ? <Small>{subtitle}</Small> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const rowStyle = { padding: spacing(1.5), borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 48 } as const;
