import { randomUUID } from 'node:crypto';
import type { AccessibilityField, Barrier, Coordinate, DataMode, Evidence, Preferences, RouteInstruction, RouteResult, RouteSegment, Snap } from '@pewnyszlak/domain';
import { surfaceLabels } from '@pewnyszlak/domain';
import { barrierIsCurrent, type BarrierLayer } from '../barriers/layer.ts';
import { config } from '../config.ts';
import { astar, type PathStep, type SnapPoint } from './astar.ts';
import { bearing, haversineM, pointToPolylineM, slicePolyline, turnAngle } from './geo.ts';
import type { Edge, Graph } from './graph.ts';

export function isStale(updatedAt: string | null, now = Date.now()): boolean {
  if (!updatedAt) return true;
  const months = (now - Date.parse(updatedAt)) / (30.44 * 24 * 3600 * 1000);
  return months > config.staleAfterMonths;
}

export function osmWayEvidence(edge: Edge, graph: Graph): Evidence {
  return {
    id: `osm-way-${edge.wayId}`,
    source: 'osm',
    sourceId: `way/${edge.wayId}`,
    sourceUrl: `https://www.openstreetmap.org/way/${edge.wayId}`,
    updatedAt: edge.osmTimestamp,
    fetchedAt: graph.meta.createdAt,
    observedAt: null,
    status: 'mapped',
    isStale: isStale(edge.osmTimestamp),
    description: `Droga OSM${edge.osmVersion ? ` (wersja ${edge.osmVersion})` : ''}; data edycji nie oznacza sprawdzenia w terenie.`,
  };
}

export function osmNodeEvidence(graph: Graph, nodeIdx: number, description: string, estimated: boolean): Evidence {
  const id = graph.nodeId(nodeIdx);
  const ts = graph.nodeTimestamps.get(nodeIdx) ?? null;
  return {
    id: `osm-node-${id}`,
    source: 'osm',
    sourceId: `node/${id}`,
    sourceUrl: `https://www.openstreetmap.org/node/${id}`,
    updatedAt: ts,
    fetchedAt: graph.meta.createdAt,
    observedAt: null,
    status: estimated ? 'estimated' : 'mapped',
    isStale: isStale(ts),
    description,
  };
}

type Draft = {
  steps: PathStep[];
  coords: [number, number][];
  lengthM: number;
  evidence: Map<string, Evidence>;
  barriers: Map<string, Barrier>;
  warnings: Set<string>;
  nodeNotes: string[];
  uncertain: boolean;
  estimated: Set<AccessibilityField>;
  missing: Set<AccessibilityField>;
};

function stepCoords(step: PathStep): [number, number][] {
  const sliced = slicePolyline(step.edge.coords, Math.min(step.fromM, step.toM), Math.max(step.fromM, step.toM));
  return step.forward ? sliced : [...sliced].reverse();
}

function stepLength(step: PathStep): number { return Math.abs(step.toM - step.fromM); }

function canMerge(a: PathStep, b: PathStep): boolean {
  if (a.edge.attrs.kind === 'crossing' || b.edge.attrs.kind === 'crossing') return false;
  if (a.edge.attrs.kind === 'steps' || b.edge.attrs.kind === 'steps' || a.edge.attrs.kind === 'elevator' || b.edge.attrs.kind === 'elevator') return false;
  if (a.edge.wayId === b.edge.wayId) return true;
  const aa = a.edge.attrs, ba = b.edge.attrs;
  return (a.edge.name ?? '') === (b.edge.name ?? '') && aa.kind === ba.kind && aa.access.surface === ba.access.surface && aa.surfaceClass === ba.surfaceClass && a.evaluation.uncertain === b.evaluation.uncertain && aa.access.wheelchair === ba.access.wheelchair;
}

function nodeDescription(graph: Graph, nodeIdx: number): { text: string; estimated: boolean } | null {
  const attrs = graph.nodeAttrs.get(nodeIdx);
  if (!attrs) return null;
  const parts: string[] = [];
  if (attrs.kerbCm !== null) parts.push(`krawężnik ${attrs.kerbCm} cm${attrs.kerbEstimated ? ` (szacunek z „kerb=${graph.nodeTags.get(nodeIdx)?.kerb}”)` : ''}`);
  else if (attrs.isCrossing) parts.push('przejście bez danych o krawężniku');
  if (attrs.description) parts.push(attrs.description.toLowerCase());
  if (attrs.maxWidthCm !== null) parts.push(`prześwit ${attrs.maxWidthCm} cm`);
  if (attrs.isElevator) parts.push('winda');
  if (parts.length === 0) return null;
  return { text: parts.join('; '), estimated: attrs.kerbEstimated };
}

export function buildRoute(graph: Graph, layer: BarrierLayer, origin: Coordinate, destination: Coordinate, prefs: Preferences, mode: DataMode): { ok: true; route: RouteResult } | { ok: false; details: ReturnType<typeof astar> & { ok: false } } {
  const result = astar(graph, origin, destination, prefs, layer);
  if (!result.ok) return { ok: false, details: result };

  // --- scalanie kroków w odcinki ---
  const drafts: Draft[] = [];
  for (const step of result.steps) {
    const last = drafts[drafts.length - 1];
    const coords = stepCoords(step);
    const len = stepLength(step);
    if (len <= 0.01 && coords.length <= 2 && drafts.length > 0) continue;
    const nodeNote = step.nodeEvaluation && last ? nodeDescription(graph, step.forward ? step.edge.from : step.edge.to) : null;
    // Krawężnik / bramka na końcu odcinka dotyczy także odcinka, z którego wychodzimy (zwłaszcza przejścia).
    if (last && nodeNote && last.steps[last.steps.length - 1]!.edge.attrs.kind === 'crossing') addNodeInfo(last, step, graph, nodeNote);
    if (last && canMerge(last.steps[last.steps.length - 1]!, step) && !(nodeNote && /krawężnik|winda|słupki|bramka|barierka/.test(nodeNote.text) && last.steps[last.steps.length - 1]!.edge.wayId !== step.edge.wayId)) {
      last.steps.push(step);
      last.coords.push(...coords.slice(1));
      last.lengthM += len;
      addStepInfo(last, step, graph);
      if (nodeNote) addNodeInfo(last, step, graph, nodeNote);
    } else {
      const d: Draft = { steps: [step], coords, lengthM: len, evidence: new Map(), barriers: new Map(), warnings: new Set(), nodeNotes: [], uncertain: false, estimated: new Set(), missing: new Set() };
      addStepInfo(d, step, graph);
      if (nodeNote) addNodeInfo(d, step, graph, nodeNote);
      drafts.push(d);
    }
  }

  const segments: RouteSegment[] = drafts.map((d, i) => {
    const first = d.steps[0]!.edge;
    const attrs = first.attrs;
    const kerbs = d.steps.flatMap((s) => [graph.nodeAttrs.get(s.forward ? s.edge.from : s.edge.to)?.kerbCm ?? null, graph.nodeAttrs.get(s.forward ? s.edge.to : s.edge.from)?.kerbCm ?? null]).filter((k): k is number => k !== null);
    const access = { ...attrs.access };
    if (access.kerbHeightCm === null && kerbs.length > 0) access.kerbHeightCm = Math.max(...kerbs);
    const missing = [...d.missing].filter((f) => !(f === 'kerbHeightCm' && access.kerbHeightCm !== null));
    return {
      id: `seg-${i + 1}`,
      edgeIds: d.steps.map((s) => s.edge.id),
      wayIds: [...new Set(d.steps.map((s) => s.edge.wayId))],
      name: first.name ?? (d.steps.find((s) => s.edge.name)?.edge.name ?? ''),
      kind: attrs.kind,
      geometry: { type: 'LineString', coordinates: d.coords },
      lengthM: Math.round(d.lengthM * 10) / 10,
      accessibility: access,
      estimatedFields: [...d.estimated],
      missingFields: missing,
      uncertain: d.uncertain,
      evidence: [...d.evidence.values()],
      barriers: [...d.barriers.values()],
      warnings: [...d.warnings, ...d.nodeNotes.map((n) => `Węzeł: ${n}`)],
    };
  });

  const geometry: [number, number][] = [];
  for (const s of segments) geometry.push(...(geometry.length ? s.geometry.coordinates.slice(1) : s.geometry.coordinates));
  const distanceM = segments.reduce((a, s) => a + s.lengthM, 0);
  const unknownDistanceM = segments.filter((s) => s.missingFields.includes('surface')).reduce((a, s) => a + s.lengthM, 0);
  const uncertainDistanceM = segments.filter((s) => s.uncertain).reduce((a, s) => a + s.lengthM, 0);
  const durationSeconds = estimateDuration(result.steps);
  const barriers = [...new Map(segments.flatMap((s) => s.barriers).map((b) => [b.id, b])).values()];
  const onRoute = new Set(barriers.map((b) => b.id));
  const avoidedBarriers = layer.all.filter((b) => !onRoute.has(b.id) && b.coordinate && barrierIsCurrent(b) && b.state === 'active' && b.blocksRouting)
    .filter((b) => pointToPolylineM(b.coordinate!.longitude, b.coordinate!.latitude, geometry).distanceM <= 150);
  const steps = buildInstructions(segments, destination);
  const warnings: string[] = [];
  if (unknownDistanceM > 0) {
    const pct = Math.round((unknownDistanceM / Math.max(distanceM, 1)) * 100);
    warnings.push(`${pct < 1 ? 'Mniej niż 1%' : `${pct}%`} trasy (${Math.round(unknownDistanceM)} m) nie ma danych o nawierzchni – brak informacji nie oznacza braku barier.`);
  }
  if (barriers.some((b) => b.state === 'potential')) warnings.push('Trasa przebiega obok możliwych utrudnień (sygnał z przetargów) – lokalizacja niepotwierdzona.');
  if (barriers.some((b) => b.state === 'active' && !b.blocksRouting)) warnings.push('Na trasie są niezweryfikowane zgłoszenia barier.');
  if (segments.every((s) => s.missingFields.includes('incline'))) warnings.push('Brak danych o nachyleniu na całej trasie (OSM nie zawiera modelu terenu).');
  for (const b of avoidedBarriers) warnings.push(`Trasa omija: ${b.title}${b.isDemo ? ' [DEMO]' : ''}.`);
  const toSnap = (p: SnapPoint, label: string): Snap => ({
    coordinate: { longitude: p.point[0], latitude: p.point[1] },
    distanceM: Math.round(p.distanceM),
    edgeId: p.edge.id,
    verified: p.distanceM <= 25,
    note: p.distanceM <= 25 ? null : `Dojście ${label} (${Math.round(p.distanceM)} m od sieci pieszej) nie jest zmapowane – stan niezweryfikowany.`,
  });
  const originSnap = toSnap(result.origin, 'od punktu startowego');
  const destinationSnap = toSnap(result.destination, 'do celu');
  if (destinationSnap.note) warnings.push(destinationSnap.note);
  if (originSnap.note) warnings.push(originSnap.note);

  return {
    ok: true,
    route: {
      id: randomUUID(),
      mode,
      graphVersion: graph.meta.version,
      barrierVersion: layer.version,
      computedAt: new Date().toISOString(),
      preferences: prefs,
      geometry: { type: 'LineString', coordinates: geometry },
      distanceM: Math.round(distanceM),
      durationSeconds: Math.round(durationSeconds),
      unknownDistanceM: Math.round(unknownDistanceM),
      uncertainDistanceM: Math.round(uncertainDistanceM),
      segments,
      steps,
      barriers,
      avoidedBarriers,
      warnings,
      originSnap,
      destinationSnap,
    },
  };
}

function addStepInfo(d: Draft, step: PathStep, graph: Graph) {
  const ev = osmWayEvidence(step.edge, graph);
  d.evidence.set(ev.id, ev);
  for (const b of step.evaluation.barriers) { d.barriers.set(b.id, b); for (const e of b.evidence) d.evidence.set(e.id, e); }
  for (const w of step.evaluation.warnings) d.warnings.add(w);
  if (step.evaluation.uncertain) d.uncertain = true;
  for (const f of step.edge.attrs.estimated) d.estimated.add(f);
  for (const f of step.edge.attrs.missing) d.missing.add(f);
  if (step.edge.attrs.estimated.length > 0) {
    const e: Evidence = { ...ev, id: `${ev.id}-est`, status: 'estimated', description: `Wartości oszacowane z tagów opisowych: ${step.edge.attrs.estimated.join(', ')}.` };
    d.evidence.set(e.id, e);
  }
}

function addNodeInfo(d: Draft, step: PathStep, graph: Graph, note: { text: string; estimated: boolean }) {
  const nodeIdx = step.forward ? step.edge.from : step.edge.to;
  const ev = osmNodeEvidence(graph, nodeIdx, note.text, note.estimated);
  d.evidence.set(ev.id, ev);
  d.nodeNotes.push(note.text);
  if (note.estimated) d.estimated.add('kerbHeightCm');
  const ne = step.nodeEvaluation;
  if (ne) {
    for (const b of ne.barriers) { d.barriers.set(b.id, b); for (const e of b.evidence) d.evidence.set(e.id, e); }
    for (const w of ne.warnings) d.warnings.add(w);
    if (ne.uncertain) d.uncertain = true;
  }
}

function estimateDuration(steps: PathStep[]): number {
  let seconds = 0;
  for (const s of steps) {
    const len = stepLength(s);
    const cls = s.edge.attrs.surfaceClass;
    const timeFactor = s.edge.attrs.kind === 'steps' ? 3 : cls === 1 ? 1.25 : cls === 2 ? 1.6 : 1;
    seconds += (len * timeFactor) / config.speedMps;
    if (s.nodeEvaluation) {
      const attrs = s.nodeEvaluation;
      if (attrs.penaltyM >= 60) seconds += 45; else if (attrs.penaltyM > 0) seconds += 10;
    }
  }
  return seconds;
}

function describeSurface(seg: RouteSegment): string {
  const s = seg.accessibility.surface;
  if (!s) return 'nawierzchnia nieznana';
  return surfaceLabels[s] ?? s;
}

export function buildInstructions(segments: RouteSegment[], destination: Coordinate): RouteInstruction[] {
  const out: (RouteInstruction & { kerbs: number[]; kerbUnknown: boolean; uncertain: boolean; name: string })[] = [];
  let prevBearing: number | null = null;
  let currentName = '';
  let sinceCrossingM = Infinity;
  const push = (seg: RouteSegment, type: RouteInstruction['type'], text: string) => {
    const c = seg.geometry.coordinates;
    out.push({ id: `step-${out.length + 1}`, segmentId: seg.id, text, distanceM: seg.lengthM, coordinate: { longitude: c[0]![0], latitude: c[0]![1] }, type, kerbs: [], kerbUnknown: false, uncertain: seg.uncertain, name: seg.name });
  };
  const absorb = (seg: RouteSegment) => {
    const cur = out[out.length - 1]!;
    cur.distanceM += seg.lengthM;
    if (seg.uncertain) cur.uncertain = true;
  };
  const pedestrianLike = (k: RouteSegment['kind']) => k === 'sidewalk' || k === 'footway' || k === 'pedestrian' || k === 'ramp' || k === 'corridor' || k === 'platform';

  segments.forEach((seg, i) => {
    const c = seg.geometry.coordinates;
    if (c.length < 2) return;
    const startBearing = bearing(c[0]!, c[Math.min(1, c.length - 1)]!);
    const endBearing = bearing(c[c.length - 2]!, c[c.length - 1]!);
    const name = seg.name || labelFor(seg);
    const cur = out[out.length - 1];
    if (i === 0) {
      push(seg, 'depart', `Rozpocznij: ${name} (${describeSurface(seg)})`);
      currentName = seg.name;
    } else if (seg.kind === 'crossing') {
      const kerb = seg.accessibility.kerbHeightCm;
      if (cur && cur.type === 'crossing' && sinceCrossingM < 15) {
        absorb(seg);
      } else {
        push(seg, 'crossing', 'Przejdź przez przejście');
      }
      const target = out[out.length - 1]!;
      if (kerb !== null) target.kerbs.push(kerb); else target.kerbUnknown = true;
      sinceCrossingM = 0;
      prevBearing = endBearing;
      return;
    } else if (seg.kind === 'steps') {
      push(seg, 'steps', `Uwaga: schody${seg.accessibility.wheelchair ? ` (OSM wheelchair=${seg.accessibility.wheelchair})` : ''}`);
    } else if (seg.kind === 'elevator') {
      push(seg, 'elevator', 'Skorzystaj z windy');
    } else {
      const angle = prevBearing === null ? 0 : turnAngle(prevBearing, startBearing);
      const tiny = seg.lengthM < 12 && pedestrianLike(seg.kind) && cur !== undefined;
      const sameStreet = seg.name !== '' && seg.name === currentName;
      if (cur && (tiny || (Math.abs(angle) < 20 && (sameStreet || seg.name === '' || currentName === '')) || (cur.type === 'crossing' && sinceCrossingM < 15 && Math.abs(angle) < 50))) {
        // Krótkie łączniki, wysepki między przejściami i kontynuacja tej samej ulicy nie tworzą nowej instrukcji.
        absorb(seg);
        if (seg.name) currentName = seg.name;
        sinceCrossingM += seg.lengthM;
        prevBearing = endBearing;
        return;
      }
      let type: RouteInstruction['type'];
      let text: string;
      if (angle <= -110 || angle >= 110) { type = angle < 0 ? 'turn-left' : 'turn-right'; text = `Zawróć ${angle < 0 ? 'w lewo' : 'w prawo'}: ${name}`; }
      else if (angle <= -50) { type = 'turn-left'; text = `Skręć w lewo: ${name}`; }
      else if (angle >= 50) { type = 'turn-right'; text = `Skręć w prawo: ${name}`; }
      else if (angle <= -20) { type = 'turn-slight-left'; text = `Lekko w lewo: ${name}`; }
      else if (angle >= 20) { type = 'turn-slight-right'; text = `Lekko w prawo: ${name}`; }
      else { type = 'continue'; text = `Dalej: ${name}`; }
      push(seg, type, `${text} (${describeSurface(seg)})`);
      currentName = seg.name;
    }
    sinceCrossingM += seg.lengthM;
    prevBearing = endBearing;
  });

  for (const ins of out) {
    if (ins.type === 'crossing') {
      const parts: string[] = [];
      if (ins.kerbs.length > 0) parts.push(`krawężnik do ${Math.max(...ins.kerbs)} cm`);
      if (ins.kerbUnknown) parts.push(ins.kerbs.length > 0 ? 'część krawężników bez danych' : 'brak danych o krawężniku');
      ins.text += parts.length ? ` – ${parts.join(', ')}` : '';
    } else if (ins.uncertain) {
      ins.text += ' – odcinek bez pełnych danych';
    }
  }
  const last = segments[segments.length - 1];
  if (last) {
    const c = last.geometry.coordinates;
    const endCoord = c[c.length - 1]!;
    const side = prevBearing === null ? '' : sideOf(prevBearing, endCoord, destination);
    const gap = Math.round(haversineM(endCoord[0], endCoord[1], destination.longitude, destination.latitude));
    out.push({ id: `step-${out.length + 1}`, segmentId: last.id, text: `Cel${side}${gap > 5 ? ` – ${gap} m od sieci pieszej (dojście niezmapowane)` : ''}`, distanceM: 0, coordinate: { longitude: endCoord[0], latitude: endCoord[1] }, type: 'arrive', kerbs: [], kerbUnknown: false, uncertain: false, name: '' });
  }
  return out.map(({ kerbs: _k, kerbUnknown: _u, uncertain: _c, name: _n, ...ins }) => ({ ...ins, distanceM: Math.round(ins.distanceM) }));
}

function labelFor(seg: RouteSegment): string {
  switch (seg.kind) {
    case 'sidewalk': return 'chodnik';
    case 'footway': return 'ciąg pieszy';
    case 'pedestrian': return 'strefa piesza';
    case 'path': return 'ścieżka';
    case 'cycleway': return 'droga rowerowa';
    case 'shared-road': return 'ulica bez nazwy';
    case 'carriageway': return 'jezdnia';
    case 'corridor': return 'korytarz';
    case 'platform': return 'peron';
    default: return 'odcinek bez nazwy';
  }
}

function sideOf(headingDeg: number, from: [number, number], dest: Coordinate): string {
  const toDest = bearing(from, [dest.longitude, dest.latitude]);
  const d = turnAngle(headingDeg, toDest);
  if (Math.abs(d) < 25) return ' przed Tobą';
  return d < 0 ? ' po lewej stronie' : ' po prawej stronie';
}
