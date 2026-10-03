import { sourceLabels, statusLabels, type Evidence } from '@pewnyszlak/domain';
import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Badge, Small, styles, focusRing } from './ui';

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'brak daty';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function toneOf(status: Evidence['status']): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  switch (status) {
    case 'verified': return 'ok';
    case 'conflicting': return 'danger';
    case 'reported': case 'signal': case 'estimated': return 'warn';
    case 'unknown': return 'muted';
    default: return 'info';
  }
}

/**
 * Lista dowodów: skąd pochodzi informacja, kiedy zmieniła się w źródle, kiedy ją pobraliśmy
 * i – osobno – kiedy ktoś faktycznie sprawdził stan w terenie. Te daty celowo nie są łączone.
 */
export function EvidenceList({ evidence, compact }: { evidence: Evidence[]; compact?: boolean }) {
  if (evidence.length === 0) return <Small>Brak źródeł dla tego elementu.</Small>;
  return (
    <View role="list" style={{ gap: spacing(1) }}>
      {evidence.map((e) => (
        <View key={e.id} role="listitem" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing(1) }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <Badge text={statusLabels[e.status]} tone={toneOf(e.status)} />
            {e.isStale ? <Badge text="Może być nieaktualne" tone="warn" /> : null}
          </View>
          <Text style={[styles.p, { marginTop: 4 }]}>{sourceLabels[e.source]}</Text>
          {e.description ? <Small>{e.description}</Small> : null}
          {!compact ? (
            <View style={{ marginTop: 4 }}>
              <Small>Zmiana w źródle: {formatDate(e.updatedAt)} · pobrano: {formatDate(e.fetchedAt)}</Small>
              <Small>Sprawdzono w terenie: {e.observedAt ? formatDate(e.observedAt) : 'nie – brak obserwacji w terenie'}</Small>
            </View>
          ) : null}
          {e.sourceUrl ? (
            <Pressable accessibilityRole="link" accessibilityLabel={`Otwórz źródło: ${sourceLabels[e.source]}`} onPress={() => Linking.openURL(e.sourceUrl!)} style={(st) => [{ marginTop: 4, minHeight: 36, justifyContent: 'center' }, focusRing(st)]}>
              <Text style={{ color: colors.primary, textDecorationLine: 'underline', fontSize: 15 }}>Zobacz w źródle ↗</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}
