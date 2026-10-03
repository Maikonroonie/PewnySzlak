import type { RouteResult, RouteSegment } from '@pewnyszlak/domain';
import { bearing, lineLengthM, pointAlong, projectOnLine } from './geo';

/** Unknown values are never promoted to observed physical difficulties. */
export function segmentDifficulty(s: RouteSegment): string[] {
  const a = s.accessibility;
  const reasons: string[] = [];
  if (a.steps || s.kind === 'steps') reasons.push('Schody');
  if (a.incline != null && Math.abs(a.incline) >= 4) reasons.push(`Nachylenie ${Math.abs(a.incline)}%`);
  if (a.kerbHeightCm != null && a.kerbHeightCm >= 1.5) reasons.push(`Krawężnik ${a.kerbHeightCm} cm`);
  if (a.widthCm != null && a.widthCm < 110) reasons.push(`Wąskie przejście · ${a.widthCm} cm`);
  if (['cobblestone', 'sett', 'unhewn_cobblestone', 'gravel', 'fine_gravel', 'sand', 'ground', 'unpaved', 'dirt'].includes(a.surface ?? '')) reasons.push('Trudniejsza nawierzchnia');
  if (['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'].includes(a.smoothness ?? '')) reasons.push('Nierówna nawierzchnia');
  if (a.wheelchair === 'limited' || a.wheelchair === 'no') reasons.push('Ograniczona dostępność w OSM');
  if (s.barriers.some((b) => b.state === 'active')) reasons.push('Zgłoszona przeszkoda');
  return reasons;
}

export type RouteHighlight = { id: string; segmentId: string; title: string; name: string; progress: number; distanceM: number; uncertain: boolean; reasons: string[] };
export function routeHighlights(route: RouteResult): RouteHighlight[] {
  const total = lineLengthM(route.geometry);
  const seen = new Set<string>();
  const result: RouteHighlight[] = [];
  for (const s of route.segments) {
    const reasons = segmentDifficulty(s);
    if (!reasons.length && !s.uncertain) continue;
    const title = reasons[0] ?? 'Brak pełnych danych';
    const key = `${s.name}:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mid = pointAlong(s.geometry, lineLengthM(s.geometry) / 2);
    const along = projectOnLine(route.geometry, mid).alongM;
    result.push({ id: s.id, segmentId: s.id, title, name: s.name || 'Odcinek trasy', progress: total ? Math.max(0, Math.min(1, along / total)) : 0, distanceM: along, uncertain: !reasons.length, reasons });
  }
  // Show physical challenges first, then the first data gaps. Every item remains in the full text alternative.
  return result.sort((a, b) => Number(a.uncertain) - Number(b.uncertain) || a.progress - b.progress).slice(0, 6).sort((a, b) => a.progress - b.progress);
}

export function previewPosition(route: RouteResult, progress: number) {
  const total = lineLengthM(route.geometry);
  const along = total * Math.max(0, Math.min(1, progress));
  const point = pointAlong(route.geometry, along);
  const behind = pointAlong(route.geometry, Math.max(0, along - 8));
  const ahead = pointAlong(route.geometry, Math.min(total, along + 22));
  return { point, heading: bearing(behind, ahead), alongM: along };
}

export function shortestBearing(previous: number, next: number): number {
  return previous + ((next - previous + 540) % 360) - 180;
}
