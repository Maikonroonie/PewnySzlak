import type { Barrier, Preferences } from '@pewnyszlak/domain';
import { barrierIsCurrent, type BarrierLayer } from '../barriers/layer.ts';
import type { Edge, Graph } from './graph.ts';

export type EdgeEvaluation = {
  excluded: boolean;
  reason: string | null;
  factor: number;
  uncertain: boolean;
  warnings: string[];
  barriers: Barrier[];
};

export type NodeEvaluation = { excluded: boolean; reason: string | null; penaltyM: number; uncertain: boolean; warnings: string[]; barriers: Barrier[] };

const UNKNOWN_SURFACE_FACTOR = 1.3;
const UNKNOWN_INCLINE_FACTOR = 1.05;
const SURFACE_FACTOR: Record<number, number> = { 0: 1.0, 1: 1.5, 2: 2.2 };

/** Reguły kosztu i wykluczeń dla krawędzi. Znane bariery naruszające preferencje wykluczają; brak danych – kara albo wykluczenie wg ustawienia. */
export function evaluateEdge(edge: Edge, prefs: Preferences, layer: BarrierLayer, now = Date.now()): EdgeEvaluation {
  const a = edge.attrs;
  const acc = a.access;
  const warnings: string[] = [];
  let factor = a.baseFactor;
  let uncertain = false;
  const barriers = (layer.byEdge.get(edge.id) ?? []).filter((b) => barrierIsCurrent(b, now));

  const exclude = (reason: string): EdgeEvaluation => ({ excluded: true, reason, factor: Infinity, uncertain, warnings, barriers });

  if (a.conveying) return exclude('schody ruchome');
  if (acc.wheelchair === 'no') return exclude('oznaczenie wheelchair=no');
  if (acc.steps) {
    if (a.rampForWheelchair) {
      factor = 1.5;
      warnings.push('Schody z pochylnią dla wózka według OSM – sprawdź stan pochylni.');
    } else if (prefs.avoidSteps) {
      return exclude('schody');
    }
  }
  if (a.surfaceClass === 3) return exclude('nawierzchnia nieprzejezdna dla wózka');
  if (a.surfaceClass === 2) {
    if (prefs.avoidRoughSurface) return exclude(`trudna nawierzchnia (${acc.surface ?? acc.smoothness})`);
    factor *= SURFACE_FACTOR[2]!;
  } else if (a.surfaceClass === 1) {
    factor *= SURFACE_FACTOR[1]!;
    warnings.push('Nawierzchnia umiarkowanie trudna (np. kostka kamienna).');
  } else if (a.surfaceClass === -1) {
    if (prefs.unknownPolicy === 'exclude' && a.kind !== 'elevator') return exclude('brak danych o nawierzchni');
    factor *= UNKNOWN_SURFACE_FACTOR;
    uncertain = true;
  }
  if (acc.incline !== null) {
    if (acc.incline > prefs.maxIncline) return exclude(`nachylenie ${acc.incline}% > ${prefs.maxIncline}%`);
    factor *= 1 + acc.incline / 20;
  } else if (a.kind !== 'elevator' && a.kind !== 'crossing') {
    // Brak danych o nachyleniu dotyczy niemal całej sieci (OSM nie ma modelu terenu) – zawsze oznaczamy, nigdy nie wykluczamy.
    factor *= UNKNOWN_INCLINE_FACTOR;
  }
  if (acc.widthCm !== null && acc.widthCm < prefs.minWidthCm) return exclude(`szerokość ${acc.widthCm} cm < ${prefs.minWidthCm} cm`);
  if (acc.kerbHeightCm !== null && acc.kerbHeightCm > prefs.maxKerbHeightCm) return exclude(`krawężnik ${acc.kerbHeightCm} cm > ${prefs.maxKerbHeightCm} cm`);
  if (a.crossingKerbUnknown) {
    if (prefs.unknownPolicy === 'exclude') return exclude('przejście bez danych o krawężniku');
    factor *= 1.2;
    uncertain = true;
    warnings.push('Przejście bez informacji o krawężniku.');
  }
  if (a.sidewalkUnknown) {
    uncertain = true;
    warnings.push('Droga bez danych o chodniku – w OSM brak osobnego chodnika.');
  }
  if (acc.wheelchair === 'limited') {
    factor *= 1.4;
    warnings.push('OSM: dostępność dla wózka ograniczona.');
  } else if (acc.wheelchair === 'yes' || acc.wheelchair === 'designated') {
    factor *= 0.95;
  }
  for (const b of barriers) {
    if (b.state === 'active' && b.blocksRouting) return exclude(`bariera: ${b.title}`);
    if (b.state === 'active') { factor *= 1.6; uncertain = true; warnings.push(`Zgłoszona bariera (niezweryfikowana): ${b.title}`); }
    else if (b.state === 'potential') { factor *= 1.5; uncertain = true; warnings.push(`Możliwe utrudnienie: ${b.title}`); }
    else if (b.state === 'disputed') { factor *= 1.3; uncertain = true; warnings.push(`Sprzeczne zgłoszenia: ${b.title}`); }
  }
  return { excluded: false, reason: null, factor, uncertain, warnings, barriers };
}

/** Reguły dla węzłów pośrednich (przejście przez krawężnik, słupki, bramki, windy, bariery punktowe). */
export function evaluateNode(graph: Graph, nodeIdx: number, prefs: Preferences, layer: BarrierLayer, now = Date.now()): NodeEvaluation {
  const attrs = graph.nodeAttrs.get(nodeIdx);
  const barriers = (layer.byNode.get(graph.nodeId(nodeIdx)) ?? []).filter((b) => barrierIsCurrent(b, now));
  const warnings: string[] = [];
  let penaltyM = 0;
  let uncertain = false;
  const exclude = (reason: string): NodeEvaluation => ({ excluded: true, reason, penaltyM: Infinity, uncertain, warnings, barriers });
  if (attrs) {
    if (attrs.impassable) return exclude(attrs.description ?? 'przeszkoda nieprzejezdna');
    if (attrs.kerbCm !== null && attrs.kerbCm > prefs.maxKerbHeightCm) return exclude(`krawężnik ${attrs.kerbCm} cm${attrs.kerbEstimated ? ' (szacunek)' : ''}`);
    if (attrs.maxWidthCm !== null && attrs.maxWidthCm < prefs.minWidthCm) return exclude(`prześwit ${attrs.maxWidthCm} cm`);
    if (attrs.isCrossing && attrs.kerbCm === null) {
      if (prefs.unknownPolicy === 'exclude') return exclude('przejście bez danych o krawężniku');
      penaltyM += 15;
      uncertain = true;
    }
    if (attrs.kerbEstimated) uncertain = true;
    if (attrs.isElevator) { penaltyM += 60; warnings.push('Winda – działanie nie jest potwierdzane na bieżąco.'); }
    if (attrs.wheelchair === 'limited') penaltyM += 20;
    penaltyM += attrs.penaltyM;
    if (attrs.barrier === 'cycle_barrier' && attrs.wheelchair !== 'yes') uncertain = true;
  }
  for (const b of barriers) {
    if (b.state === 'active' && b.blocksRouting) return exclude(`bariera: ${b.title}`);
    if (b.state === 'active') { penaltyM += 80; uncertain = true; warnings.push(`Zgłoszona bariera (niezweryfikowana): ${b.title}`); }
    else if (b.state === 'potential') { penaltyM += 50; uncertain = true; }
    else if (b.state === 'disputed') { penaltyM += 30; uncertain = true; }
  }
  return { excluded: false, reason: null, penaltyM, uncertain, warnings, barriers };
}
