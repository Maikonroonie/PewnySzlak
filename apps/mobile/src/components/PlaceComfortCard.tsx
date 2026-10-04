import { formatDistance, isTerrainChecked, placeCategoryLabel, placeFeatureGrid, sourceLabels, statusLabels, wheelchairLabel, type ExploreSuggestion, type Place } from '@pewnyszlak/domain';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { AmenityGrid } from './AmenityGrid';
import { focusRing } from './ui';

function statusLine(place: Place, suggestion?: ExploreSuggestion): string | null {
  if (suggestion?.fitSummary) return suggestion.fitSummary;
  if (place.blurb && !place.blurb.startsWith('Hasło') && place.blurb.length < 100) return place.blurb;
  if (isTerrainChecked(place)) return 'Sprawdzone w terenie.';
  if (suggestion?.gaps?.length) return suggestion.gaps[0] ?? null;
  return null;
}

function sourceChip(place: Place): string {
  const sources = [...new Set(place.evidence.map((e) => {
    if (e.source === 'msip') return 'MSIP';
    if (e.source === 'osm') return 'OSM';
    if (e.source === 'operator') return 'Operator';
    return sourceLabels[e.source] ?? e.source;
  }))];
  return sources.slice(0, 2).join(' · ');
}

export function PlaceComfortCard({ place, suggestion, onRoute }: { place: Place; suggestion?: ExploreSuggestion; onRoute?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const kind = placeCategoryLabel(place.category);
  const evidence = place.evidence.slice(0, 3);
  const grid = placeFeatureGrid(place);
  const line = statusLine(place, suggestion);
  const meta = [kind, place.distanceM != null ? formatDistance(place.distanceM) : null].filter(Boolean).join(' · ');

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${place.name}. ${meta}${isTerrainChecked(place) ? ', sprawdzone w terenie' : ''}`}
        accessibilityHint="Rozwiń źródła"
        onPress={() => setOpen((v) => !v)}
        style={(st) => [styles.row, focusRing(st)]}
      >
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.title} numberOfLines={2}>{place.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{meta}{place.address ? ` · ${place.address}` : ''}</Text>
          {line ? <Text style={styles.line} numberOfLines={2}>{line}</Text> : null}
          <AmenityGrid cells={grid} compact />
          <Text style={styles.sources}>{sourceChip(place)}{open ? ' · zwiń' : ''}</Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {open ? (
        <View style={styles.detail}>
          {wheelchairLabel(place.accessibility.wheelchair ?? null) ? (
            <Text style={styles.detailText}>{wheelchairLabel(place.accessibility.wheelchair ?? null)}</Text>
          ) : null}
          {evidence.map((e) => (
            <View key={e.id} style={styles.evidence}>
              <Text style={styles.evidenceTitle}>
                {sourceLabels[e.source]}{e.isStale ? ' · może być nieaktualne' : ''}
              </Text>
              <Text style={styles.detailText}>
                {statusLabels[e.status]}
                {e.observedAt ? ` · obserwacja ${new Date(e.observedAt).toLocaleDateString('pl-PL')}` : ` · pobrano ${new Date(e.fetchedAt).toLocaleDateString('pl-PL')}`}
              </Text>
              {e.description && !e.description.startsWith('Hasło Wikipedia') ? (
                <Text style={styles.detailText} numberOfLines={4}>{e.description}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {place.coordinate && onRoute ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Trasa do ${place.name}`}
            onPress={onRoute}
            style={(st) => [styles.actionPrimary, focusRing(st)]}
          >
            <Text style={styles.actionPrimaryTxt}>Trasa</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Zgłoś przy ${place.name}`}
          onPress={() => router.push({
            pathname: '/report',
            params: {
              ...(place.coordinate ? { lat: String(place.coordinate.latitude), lon: String(place.coordinate.longitude) } : {}),
              quick: '1',
              name: place.name,
            },
          })}
          style={(st) => [styles.actionGhost, focusRing(st)]}
        >
          <Text style={styles.actionGhostTxt}>Zgłoś</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 14,
    paddingBottom: 4,
    minHeight: 48,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22, letterSpacing: -0.2 },
  meta: { marginTop: 3, fontSize: 13, color: colors.textMuted },
  line: { marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.text },
  sources: { marginTop: 8, fontSize: 12, color: colors.textMuted },
  detail: {
    marginTop: 8,
    marginBottom: 4,
    gap: 10,
    borderLeftWidth: 2,
    borderLeftColor: colors.hairline,
    paddingLeft: 12,
  },
  evidence: { gap: 2 },
  evidenceTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  detailText: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionPrimary: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#111111',
    justifyContent: 'center',
  },
  actionPrimaryTxt: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  actionGhost: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    justifyContent: 'center',
  },
  actionGhostTxt: { fontSize: 14, fontWeight: '600', color: colors.text },
});
