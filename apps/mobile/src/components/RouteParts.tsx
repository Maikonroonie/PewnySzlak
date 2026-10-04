import { accessibilityLabels, barrierTypeLabels, formatDistance, segmentKindLabels, smoothnessLabels, surfaceLabels, type Barrier, type RouteInstruction, type RouteResult, type RouteSegment } from '@pewnyszlak/domain';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Badge, Card, P, Small, styles, focusRing } from './ui';

export function segmentSummary(s: RouteSegment): string {
  const a = s.accessibility;
  const parts: string[] = [];
  if (a.surface) parts.push(`nawierzchnia: ${surfaceLabels[a.surface] ?? a.surface}`);
  if (a.smoothness) parts.push(`równość: ${smoothnessLabels[a.smoothness] ?? a.smoothness}`);
  if (a.incline != null) parts.push(`nachylenie ${a.incline}%`);
  if (a.widthCm != null) parts.push(`szerokość ${a.widthCm} cm`);
  if (a.kerbHeightCm != null) parts.push(`krawężnik ${a.kerbHeightCm} cm${s.estimatedFields.includes('kerbHeightCm') ? ' (szacunek)' : ''}`);
  if (a.steps) parts.push('schody');
  return parts.join(', ');
}

export function missingSummary(s: RouteSegment): string {
  const important = s.missingFields.filter((f) => f !== 'wheelchair' && f !== 'smoothness');
  return important.length ? `brak danych: ${important.map((f) => accessibilityLabels[f].toLowerCase()).join(', ')}` : '';
}

export function stateTone(state: Barrier['state']): 'danger' | 'warn' | 'info' | 'muted' {
  return state === 'active' ? 'danger' : state === 'potential' ? 'warn' : state === 'disputed' ? 'info' : 'muted';
}
export const stateLabels: Record<Barrier['state'], string> = { active: 'Aktywna', potential: 'Potencjalna', disputed: 'Sporna', resolved: 'Usunięta' };

export function SegmentRow({ segment, index, onPress }: { segment: RouteSegment; index: number; onPress?: () => void }) {
  const summary = segmentSummary(segment);
  const missing = missingSummary(segment);
  const label = `${index + 1}. ${segmentKindLabels[segment.kind]}${segment.name ? ` ${segment.name}` : ''}, ${formatDistance(segment.lengthM)}${segment.uncertain ? ', odcinek niepewny' : ''}${summary ? `. ${summary}` : ''}${missing ? `. ${missing}` : ''}${segment.barriers.length ? `. Bariery: ${segment.barriers.map((b) => b.title).join('; ')}` : ''}`;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} accessibilityHint={onPress ? 'Otwiera szczegóły odcinka i źródła danych' : undefined} onPress={onPress} style={(st) => [{ borderLeftWidth: 6, borderLeftColor: segment.uncertain ? colors.routeUncertain : colors.routeOk, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing(1.5), marginBottom: spacing(1) }, focusRing(st)]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={[styles.p, { fontWeight: '700', flex: 1 }]}>{index + 1}. {segmentKindLabels[segment.kind]}{segment.name ? ` · ${segment.name}` : ''}</Text>
        <Text style={styles.p}>{formatDistance(segment.lengthM)}</Text>
      </View>
      {summary ? <Small>{summary}</Small> : null}
      {segment.uncertain || missing || segment.barriers.length ? (
        <View style={{ marginTop: 6, gap: 4 }}>
          {segment.uncertain ? <Small style={{ color: colors.warn, fontWeight: '600' }}>Odcinek niepewny — brak pełnych danych OSM</Small> : null}
          {missing ? <Small>{missing}</Small> : null}
          {segment.barriers.length ? <Small>Bariery: {segment.barriers.map((b) => `${barrierTypeLabels[b.type]} (${stateLabels[b.state].toLowerCase()})`).join(' · ')}</Small> : null}
        </View>
      ) : null}
      {segment.warnings.map((w, i) => <Small key={`${i}-${w}`} style={{ color: colors.warn, marginTop: 4 }}>⚠ {w}</Small>)}
    </Pressable>
  );
}

export const instructionIcon: Record<RouteInstruction['type'], string> = {
  depart: '▶', continue: '↑', 'turn-left': '↰', 'turn-right': '↱', 'turn-slight-left': '↖', 'turn-slight-right': '↗', crossing: '⇆', steps: '≣', elevator: '⇕', caution: '⚠', arrive: '■',
};

export function InstructionRow({ step, active, index }: { step: RouteInstruction; active?: boolean; index: number }) {
  return (
    <View role="listitem" accessibilityLabel={`Krok ${index + 1}: ${step.text}${step.distanceM > 0 ? `, następnie ${formatDistance(step.distanceM)}` : ''}${active ? ', bieżący' : ''}`} style={{ flexDirection: 'row', gap: spacing(1.5), padding: spacing(1.25), borderRadius: 10, backgroundColor: active ? colors.surface : 'transparent', borderWidth: active ? 2 : 0, borderColor: colors.primary }}>
      <Text style={{ fontSize: 24, width: 32, textAlign: 'center' }} importantForAccessibility="no" aria-hidden>{instructionIcon[step.type]}</Text>
      <View style={{ flex: 1 }}>
        <P style={active ? { fontWeight: '700' } : undefined}>{step.text}</P>
        {step.distanceM > 0 ? <Small>Dalej {formatDistance(step.distanceM)}</Small> : null}
      </View>
    </View>
  );
}

export function BarrierCard({ barrier, onPress, compact }: { barrier: Barrier; onPress?: () => void; compact?: boolean }) {
  const e = barrier.evidence[0];
  const tone = stateTone(barrier.state);
  const conflicting = barrier.evidence.some((x) => x.status === 'conflicting') || (barrier.confirmationCount > 0 && barrier.rejectionCount > 0);
  const stale = barrier.evidence.some((x) => x.isStale);
  const meta = `${barrierTypeLabels[barrier.type]} · ${stateLabels[barrier.state]}`;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${barrierTypeLabels[barrier.type]}: ${barrier.title}. Stan: ${stateLabels[barrier.state]}. Potwierdzeń ${barrier.confirmationCount}, zaprzeczeń ${barrier.rejectionCount}.${barrier.isDemo ? ' Dane demonstracyjne.' : ''}${conflicting ? ' Sporne informacje.' : ''}${stale ? ' Może być nieaktualne.' : ''}`} onPress={onPress} style={(st) => [focusRing(st)]}>
      <Card tone={tone === 'muted' ? undefined : tone}>
        {compact ? (
          <>
            <P style={{ fontWeight: '700' }}>{barrier.title}</P>
            <Small>{meta} · potw.: {barrier.confirmationCount} · zaprz.: {barrier.rejectionCount}</Small>
            {(barrier.isDemo || conflicting || stale || e?.isStale) ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {barrier.isDemo ? <Badge text="DEMO" tone="warn" /> : null}
                {conflicting ? <Badge text="Sporne" tone="danger" /> : null}
                {stale || e?.isStale ? <Badge text="Może być nieaktualne" tone="warn" /> : null}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              <Badge text={stateLabels[barrier.state]} tone={stateTone(barrier.state)} />
              <Badge text={barrierTypeLabels[barrier.type]} tone="info" />
              {barrier.isDemo ? <Badge text="DEMO" tone="muted" /> : null}
              {conflicting ? <Badge text="Sporne" tone="danger" /> : null}
              {stale || e?.isStale ? <Badge text="Może być nieaktualne" tone="warn" /> : null}
            </View>
            <P style={{ fontWeight: '700' }}>{barrier.title}</P>
            {barrier.description ? <Small numberOfLines={3}>{barrier.description}</Small> : null}
            <Small>Potwierdzeń: {barrier.confirmationCount} · zaprzeczeń: {barrier.rejectionCount} · „zniknęła”: {barrier.resolvedCount}</Small>
          </>
        )}
      </Card>
    </Pressable>
  );
}

export function routeSummaryText(r: RouteResult): string {
  const parts = [`Trasa ${formatDistance(r.distanceM)}`, `${r.segments.length} odcinków`];
  if (r.uncertainDistanceM > 0) parts.push(`${formatDistance(r.uncertainDistanceM)} niepewnych`);
  if (r.unknownDistanceM > 0) parts.push(`${formatDistance(r.unknownDistanceM)} bez pełnych danych`);
  if (r.avoidedBarriers.length) parts.push(`omija ${r.avoidedBarriers.length} barier`);
  return parts.join(', ');
}
