import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { formatDistance, type RouteResult } from '@pewnyszlak/domain';
import React, { useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { api } from '../api/client';
import { lineLengthM, pointAlong } from '../lib/geo';
import { colors } from '../theme';
import { Badge, Button, Card, P, Row, Small } from './ui';

export function TerrainProfile({ route }: { route: RouteResult }) {
  const [enabled, setEnabled] = useState(false);
  const [showText, setShowText] = useState(false);
  const points = useMemo(() => { const total = lineLengthM(route.geometry); return Array.from({ length: 81 }, (_, i) => pointAlong(route.geometry, total * i / 80)); }, [route]);
  const query = useQuery({ queryKey: ['terrain', route.id], queryFn: () => api.terrain(points), enabled, retry: false, staleTime: 86_400_000 });
  const data = query.data;
  const values = data?.points.flatMap(p => p.elevationM == null ? [] : [p.elevationM]) ?? [];
  const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 0;
  return <Card style={{ padding: 22 }}>
    <Row wrap style={{ justifyContent: 'space-between', gap: 16 }}><Row><Feather name="trending-up" size={24} color={colors.primary}/><View><P style={{ fontWeight: '700' }}>A co z terenem?</P><Small>Prawdziwy profil wysokości · NMT Geoportalu</Small></View></Row><Button title={query.isPending && enabled ? 'Pobieram profil…' : data ? 'Odśwież profil terenu' : 'Sprawdź profil terenu'} icon="➜" variant="secondary" loading={query.isFetching} onPress={() => { if (enabled) void query.refetch(); else setEnabled(true); }}/></Row>
    {query.isError ? <Text accessibilityRole="alert" style={{ color: colors.warn, marginTop: 12 }}>{(query.error as Error).message}</Text> : null}
    {data ? <View style={{ marginTop: 20 }}>
      {values.length ? <><Row wrap style={{ justifyContent: 'space-between' }}><Badge text={`${min.toFixed(1)}–${max.toFixed(1)} m n.p.m.`} tone="ok"/><Small>Siatka odpowiedzi ok. {data.resolutionM} m</Small></Row>
        <View accessibilityRole="image" accessibilityLabel={`Profil terenu. Najniżej ${min.toFixed(1)} m, najwyżej ${max.toFixed(1)} m. Pełne pomiary dostępne pod przyciskiem Wartości tekstowo.`} style={{ height: 110, flexDirection: 'row', gap: 2, alignItems: 'flex-end', paddingTop: 16, borderBottomWidth: 1, borderColor: colors.border }}>
          {data.points.map((p, i) => <View key={i} style={{ flex: 1, backgroundColor: p.elevationM == null ? colors.surface : colors.sage, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderTopWidth: p.elevationM == null ? 0 : 2, borderColor: colors.primary, height: p.elevationM == null ? 3 : 15 + ((p.elevationM - min) / Math.max(1, max - min)) * 75 }}/>)}</View><Row style={{ justifyContent: 'space-between', marginTop: 6 }}><Small>Start</Small><Small>{formatDistance(route.distanceM)} · cel</Small></Row></> : <P>Źródło nie zwróciło wysokości dla tej trasy.</P>}
      <Small style={{ marginTop: 14 }}>{data.warning}</Small><Small style={{ marginTop: 6 }}>Pobrano {new Date(data.fetchedAt).toLocaleString('pl-PL')} · {data.source}</Small>
      <Row wrap style={{ marginTop: 10 }}><Button title="Źródło NMT" variant="ghost" onPress={() => Linking.openURL(data.sourceUrl)}/><Button title={showText ? 'Ukryj wartości' : 'Wartości tekstowo'} variant="ghost" onPress={() => setShowText(v => !v)}/></Row>
      {showText ? <View role="list">{data.points.map((p, i) => <View key={i} role="listitem"><Small>{formatDistance(p.distanceM)}: {p.elevationM == null ? 'Brak danych' : `${p.elevationM} m n.p.m.`}</Small></View>)}</View> : null}
    </View> : !enabled ? <Small style={{ marginTop: 12 }}>Dodatkowa warstwa o powierzchni gruntu. Nie zastępuje informacji o chodnikach i przeszkodach.</Small> : null}
  </Card>;
}
