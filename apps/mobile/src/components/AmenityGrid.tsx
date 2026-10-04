import type { FeatureGridCell, FeatureGridValue } from '@pewnyszlak/domain';
import React from 'react';
import { Text, View } from 'react-native';
import { colors, spacing } from '../theme';

function mark(v: FeatureGridValue): string {
  if (v === 'yes') return 'tak';
  if (v === 'no') return 'nie';
  return '—';
}

function valueWord(v: FeatureGridValue): string {
  if (v === 'yes') return 'tak';
  if (v === 'no') return 'nie';
  return 'brak danych';
}

function tone(v: FeatureGridValue): string {
  if (v === 'yes') return colors.ok;
  if (v === 'no') return colors.danger;
  return colors.textMuted;
}

/** Zwarta lista cech — w trybie compact jedna linia tekstu zamiast siatki kafli. */
export function AmenityGrid({ cells, compact }: { cells: FeatureGridCell[]; compact?: boolean }) {
  const a11y = cells.map((c) => `${c.label}: ${valueWord(c.value)}`).join(', ');

  if (compact) {
    const known = cells.filter((c) => c.value !== 'unknown');
    const bits = (known.length ? known : cells.slice(0, 4)).map((c) => `${c.label} ${mark(c.value)}`);
    return (
      <Text
        accessible
        accessibilityRole="summary"
        accessibilityLabel={a11y}
        style={{ marginTop: spacing(1), fontSize: 13, lineHeight: 18, color: colors.textMuted }}
        numberOfLines={2}
      >
        {bits.join(' · ')}
      </Text>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={a11y}
      style={{ marginTop: spacing(1.5), gap: 8 }}
    >
      {cells.map((c) => (
        <View key={c.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{c.label}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: tone(c.value) }}>{mark(c.value)}</Text>
        </View>
      ))}
    </View>
  );
}
