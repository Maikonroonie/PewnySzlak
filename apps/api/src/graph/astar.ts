import type { Coordinate, NoRouteDetails, Preferences } from '@pewnyszlak/domain';
import { BarrierLayer } from '../barriers/layer.ts';

const layerEmpty = () => BarrierLayer.empty();
import { evaluateEdge, evaluateNode, type EdgeEvaluation, type NodeEvaluation } from './cost.ts';
import { haversineM } from './geo.ts';
import type { Edge, Graph } from './graph.ts';

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() { return this.keys.length; }
  peekKey(): number { return this.keys[0] ?? Infinity; }
  push(key: number, val: number) {
    this.keys.push(key); this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): [number, number] {
    const k = this.keys[0]!, v = this.vals[0]!;
    const lk = this.keys.pop()!, lv = this.vals.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lk; this.vals[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.keys.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return [k, v];
  }
  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.vals[a], this.vals[b]] = [this.vals[b]!, this.vals[a]!];
  }
}

export type SnapPoint = { edge: Edge; point: [number, number]; alongM: number; distanceM: number; evaluation: EdgeEvaluation };

export type PathStep = { edge: Edge; forward: boolean; evaluation: EdgeEvaluation; nodeEvaluation: NodeEvaluation | null; fromM: number; toM: number };

export type AStarResult =
  | { ok: true; steps: PathStep[]; exploredNodes: number; costM: number; origin: SnapPoint; destination: SnapPoint }
  | { ok: false; details: NoRouteDetails; origin: SnapPoint | null; destination: SnapPoint | null };

const MAX_EXPLORED = 1_500_000;

export type SnapFailure = { nearestEdge: Edge | null; nearestDistanceM: number | null; reason: string | null };

/**
 * Dowiązanie punktu do sieci: najbliższy odcinek dopuszczalny, ale nie dalej niż ~75 m od najbliższego odcinka w ogóle.
 * Dzięki temu cel przy schodach nie jest po cichu przenoszony na odległy chodnik – użytkownik dostaje wyjaśnienie.
 */
export function snapPoint(graph: Graph, c: Coordinate, prefs: Preferences, layer: BarrierLayer, maxDistanceM = 400): SnapPoint | SnapFailure {
  const evals = new Map<number, EdgeEvaluation>();
  const evalOf = (e: Edge) => {
    let ev = evals.get(e.idx);
    if (!ev) { ev = evaluateEdge(e, prefs, layer); evals.set(e.idx, ev); }
    return ev;
  };
  const any = graph.snap(c.longitude, c.latitude, () => true, maxDistanceM);
  if (!any) return { nearestEdge: null, nearestDistanceM: null, reason: null };
  const limit = Math.min(maxDistanceM, any.distanceM + 75);
  const hit = graph.snap(c.longitude, c.latitude, (e) => !evalOf(e).excluded, limit);
  if (!hit) return { nearestEdge: any.edge, nearestDistanceM: any.distanceM, reason: evalOf(any.edge).reason };
  return { edge: hit.edge, point: hit.point, alongM: hit.alongM, distanceM: hit.distanceM, evaluation: evalOf(hit.edge) };
}

const isSnap = (s: SnapPoint | SnapFailure): s is SnapPoint => 'edge' in s;

/**
 * Szybki test osiągalności (dwukierunkowy BFS z naprzemiennym rozszerzaniem frontów).
 * Gdy jedna strona jest „zamknięta” (np. cel otoczony schodami), kończy się po przejrzeniu małej kieszeni,
 * zamiast przeszukiwać cały graf. Używany tylko do diagnostyki braku trasy.
 */
// Rzadkie tablice indeksowane idx krawędzi / nr węzła – znacznie szybsze niż Map przy setkach tysięcy odwołań.
type EvalCaches = { edge: (EdgeEvaluation | undefined)[]; node: (NodeEvaluation | undefined)[]; nowMs: number };
const newCaches = (): EvalCaches => ({ edge: [], node: [], nowMs: Date.now() });

function reachable(graph: Graph, origin: Coordinate, destination: Coordinate, prefs: Preferences, layer: BarrierLayer, budget = Infinity, caches: EvalCaches = newCaches()): boolean | null {
  const start = snapPoint(graph, origin, prefs, layer);
  const end = snapPoint(graph, destination, prefs, layer);
  if (!isSnap(start) || !isSnap(end)) return false;
  if (start.edge.idx === end.edge.idx) return true;
  // Oceny krawędzi/węzłów są współdzielone z A* (ten sam cache), więc test nie dubluje pracy.
  const okEdge = (e: Edge) => { let v = caches.edge[e.idx]; if (!v) { v = evaluateEdge(e, prefs, layer, caches.nowMs); caches.edge[e.idx] = v; } return !v.excluded; };
  const okNode = (n: number) => { let v = caches.node[n]; if (!v) { v = evaluateNode(graph, n, prefs, layer, caches.nowMs); caches.node[n] = v; } return !v.excluded; };
  const seen = new Uint8Array(graph.nodeCount); // 1 = od startu, 2 = od celu
  // Węzły wykluczone (np. wysoki krawężnik) nie mogą być ani punktem wejścia, ani miejscem spotkania frontów.
  const frontier: [number[], number[]] = [[start.edge.from, start.edge.to].filter(okNode), [end.edge.from, end.edge.to].filter(okNode)];
  for (const n of frontier[0]) seen[n] = 1;
  for (const n of frontier[1]) { if (seen[n] === 1) return true; seen[n] = 2; }
  let expanded = 0;
  while (frontier[0].length && frontier[1].length) {
    const side = frontier[0].length <= frontier[1].length ? 0 : 1;
    const mark = side === 0 ? 1 : 2;
    const next: number[] = [];
    for (const n of frontier[side]) {
      expanded++;
      for (let k = graph.offsets[n]!; k < graph.offsets[n + 1]!; k++) {
        const m = graph.adjNode[k]!;
        if (seen[m] === mark) continue;
        if (!okEdge(graph.edges[graph.adjEdge[k]!]!)) continue;
        if (!okNode(m)) continue;
        if (seen[m] !== 0) return true; // spotkanie frontów w dopuszczalnym węźle
        seen[m] = mark;
        next.push(m);
      }
    }
    if (expanded > budget) return null; // nierozstrzygnięte w budżecie – obie strony są duże, trasa prawdopodobnie istnieje
    frontier[side] = next;
  }
  return false;
}

export function astar(graph: Graph, origin: Coordinate, destination: Coordinate, prefs: Preferences, layer: BarrierLayer, relaxedMode = false): AStarResult {
  const [minLon, minLat, maxLon, maxLat] = graph.meta.bounds;
  const inside = (c: Coordinate) => c.longitude >= minLon && c.longitude <= maxLon && c.latitude >= minLat && c.latitude <= maxLat;
  if (!inside(origin) || !inside(destination)) {
    return { ok: false, origin: null, destination: null, details: { reason: 'outside-coverage', explanation: 'Punkt leży poza obszarem pokrycia (Kraków z buforem 2 km).', suggestions: ['Wybierz punkt w granicach Krakowa.'], exploredNodes: 0 } };
  }
  const start = snapPoint(graph, origin, prefs, layer);
  if (!isSnap(start)) {
    return { ok: false, origin: null, destination: null, details: { reason: 'origin-unreachable', explanation: start.nearestEdge ? `Najbliższy odcinek przy starcie (${Math.round(start.nearestDistanceM ?? 0)} m, ${start.nearestEdge.name || 'bez nazwy'}) nie spełnia preferencji: ${start.reason}. W pobliżu nie ma innego dopuszczalnego odcinka.` : 'W promieniu 400 m od punktu startowego nie ma sieci pieszej OSM.', suggestions: ['Przesuń punkt startowy bliżej chodnika lub ulicy.', 'Zmień ustawienie „brak danych” na „zwiększ koszt”.'], exploredNodes: 0 } };
  }
  const end = snapPoint(graph, destination, prefs, layer);
  if (!isSnap(end)) {
    return { ok: false, origin: start, destination: null, details: { reason: 'destination-unreachable', explanation: end.nearestEdge ? `Najbliższy odcinek przy celu (${Math.round(end.nearestDistanceM ?? 0)} m, ${end.nearestEdge.name || 'bez nazwy'}) nie spełnia preferencji: ${end.reason}. W pobliżu nie ma innego dopuszczalnego odcinka.` : 'W promieniu 400 m od celu nie ma sieci pieszej OSM.', suggestions: ['Wybierz cel bliżej chodnika lub ulicy.', 'Poluzuj preferencje (np. większy krawężnik).'], exploredNodes: 0 } };
  }

  const caches = newCaches();
  const nowMs = caches.nowMs;
  const edgeEval = caches.edge;
  const nodeEval = caches.node;
  const evalEdge = (e: Edge) => { let v = edgeEval[e.idx]; if (!v) { v = evaluateEdge(e, prefs, layer, nowMs); edgeEval[e.idx] = v; } return v; };
  const evalNode = (n: number) => { let v = nodeEval[n]; if (!v) { v = evaluateNode(graph, n, prefs, layer, nowMs); nodeEval[n] = v; } return v; };

  // Start i cel na tej samej krawędzi – trasa to fragment krawędzi.
  if (start.edge.idx === end.edge.idx) {
    const forward = end.alongM >= start.alongM;
    const step: PathStep = { edge: start.edge, forward, evaluation: start.evaluation, nodeEvaluation: null, fromM: start.alongM, toM: end.alongM };
    return { ok: true, steps: [step], exploredNodes: 0, costM: Math.abs(end.alongM - start.alongM) * start.evaluation.factor, origin: start, destination: end };
  }

  const noRoute = (explored: number): AStarResult => {
    if (relaxedMode) {
      return { ok: false, origin: start, destination: end, details: { reason: 'disconnected', explanation: 'Punkty nie są połączone w sieci pieszej OSM w granicach pokrycia.', suggestions: [], exploredNodes: explored } };
    }
    // Rozróżniamy brak połączenia w sieci od zablokowania przez preferencje/bariery: sprawdzamy, które pojedyncze poluzowanie przywraca trasę.
    const relaxed: Preferences = { avoidSteps: false, avoidRoughSurface: false, maxIncline: 30, maxKerbHeightCm: 30, minWidthCm: 30, unknownPolicy: 'penalize' };
    if (reachable(graph, origin, destination, relaxed, layerEmpty()) !== true) {
      return {
        ok: false, origin: start, destination: end,
        details: { reason: 'disconnected', explanation: 'Punkty nie są połączone w sieci pieszej OSM w granicach pokrycia (nawet bez ograniczeń). Może brakować fragmentu chodnika w danych OSM.', suggestions: ['Wybierz inny punkt docelowy w pobliżu.', 'Jeśli znasz to miejsce – uzupełnij OpenStreetMap.'], exploredNodes: explored },
      };
    }
    const candidates: { label: string; prefs: Preferences; layer: BarrierLayer; suggestion: string }[] = [
      { label: 'schody', prefs: { ...prefs, avoidSteps: false }, layer, suggestion: 'Trasa istnieje tylko przez schody – jeśli to dla Ciebie możliwe, wyłącz „Omijaj schody”.' },
      { label: `krawężnik powyżej ${prefs.maxKerbHeightCm} cm`, prefs: { ...prefs, maxKerbHeightCm: 30 }, layer, suggestion: 'Zwiększ dopuszczalną wysokość krawężnika.' },
      { label: 'złą nawierzchnię', prefs: { ...prefs, avoidRoughSurface: false }, layer, suggestion: 'Wyłącz „Omijaj złą nawierzchnię”.' },
      { label: `szerokość poniżej ${prefs.minWidthCm} cm`, prefs: { ...prefs, minWidthCm: 30 }, layer, suggestion: 'Zmniejsz wymaganą szerokość przejścia.' },
      { label: `nachylenie powyżej ${prefs.maxIncline} %`, prefs: { ...prefs, maxIncline: 30 }, layer, suggestion: 'Zwiększ dopuszczalne nachylenie.' },
      { label: 'odcinki bez danych', prefs: { ...prefs, unknownPolicy: 'penalize' }, layer, suggestion: 'Zmień „brak danych” na „pokazuj i ostrzegaj”.' },
      { label: 'zgłoszone bariery', prefs, layer: layerEmpty(), suggestion: 'Trasę blokuje zgłoszona bariera (remont, nieczynna winda…). Sprawdź bariery w pobliżu – może już zniknęła.' },
    ];
    const unlocking = candidates.filter((c) => (c.label === 'odcinki bez danych' ? prefs.unknownPolicy === 'exclude' : true) && reachable(graph, origin, destination, c.prefs, c.layer) === true);
    const explanation = unlocking.length
      ? `Nie znaleziono trasy spełniającej wszystkie preferencje. Trasa istnieje, jeśli dopuścisz: ${unlocking.map((u) => u.label).join(' lub ')}.`
      : 'Nie znaleziono trasy spełniającej wszystkie preferencje. Każde znane połączenie między punktami łączy kilka barier naraz (np. schody i krawężnik) albo brakuje danych i wybrano ich wykluczanie.';
    return {
      ok: false, origin: start, destination: end,
      details: {
        reason: 'blocked-by-preferences',
        explanation,
        suggestions: unlocking.length ? unlocking.map((u) => u.suggestion) : ['Poluzuj kilka ustawień naraz w preferencjach.', 'Wybierz inny punkt docelowy w pobliżu.'],
        exploredNodes: explored,
      },
    };
  };

  // Szybki test: jeśli cel jest nieosiągalny przy tych ustawieniach, nie przeszukujemy całego grafu A*.
  if (!relaxedMode && reachable(graph, origin, destination, prefs, layer, 6_000, caches) === false) return noRoute(0);

  const N = graph.nodeCount;
  const g = new Float64Array(N).fill(Infinity);
  const parentEdge = new Int32Array(N).fill(-1); // -2 = start wirtualny
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  const destLon = destination.longitude, destLat = destination.latitude;
  const h = (n: number) => haversineM(graph.lon[n]!, graph.lat[n]!, destLon, destLat) * 0.9;

  const sE = start.edge;
  const sLen = sE.lengthM;
  const seed = (node: number, costM: number) => { g[node] = costM; parentEdge[node] = -2; heap.push(costM + h(node), node); };
  seed(sE.from, start.alongM * start.evaluation.factor);
  if (g[sE.to]! > (sLen - start.alongM) * start.evaluation.factor) seed(sE.to, (sLen - start.alongM) * start.evaluation.factor);

  const eE = end.edge;
  const goalCost = new Map<number, number>([[eE.from, end.alongM * end.evaluation.factor], [eE.to, (eE.lengthM - end.alongM) * end.evaluation.factor]]);
  let best: { node: number; total: number } | null = null;
  let explored = 0;

  while (heap.size > 0) {
    const [f, n] = heap.pop();
    if (best && f >= best.total) break;
    if (closed[n]) continue;
    closed[n] = 1;
    explored++;
    if (explored > MAX_EXPLORED) break;
    // Koszt przejścia przez węzeł (krawężnik, bramka, słupki, bariera punktowa) – dotyczy też wejścia na odcinek docelowy.
    const ne = evalNode(n);
    if (ne.excluded) continue;
    const nodePenalty = ne.penaltyM;
    const gc = goalCost.get(n);
    if (gc !== undefined) {
      const total = g[n]! + nodePenalty + gc;
      if (!best || total < best.total) best = { node: n, total };
    }
    for (let k = graph.offsets[n]!; k < graph.offsets[n + 1]!; k++) {
      const eIdx = graph.adjEdge[k]!;
      const m = graph.adjNode[k]!;
      if (closed[m]) continue;
      const edge = graph.edges[eIdx]!;
      const ev = evalEdge(edge);
      if (ev.excluded) continue;
      const tentative = g[n]! + nodePenalty + edge.lengthM * ev.factor;
      if (tentative < g[m]!) {
        g[m] = tentative;
        parentEdge[m] = eIdx;
        heap.push(tentative + h(m), m);
      }
    }
  }

  if (!best) return noRoute(explored);

  // Rekonstrukcja ścieżki od węzła celu do węzła startowego.
  const steps: PathStep[] = [];
  let cur = best.node;
  while (parentEdge[cur]! >= 0) {
    const edge = graph.edges[parentEdge[cur]!]!;
    const forward = edge.to === cur;
    const prev = forward ? edge.from : edge.to;
    steps.push({ edge, forward, evaluation: evalEdge(edge), nodeEvaluation: evalNode(prev), fromM: forward ? 0 : edge.lengthM, toM: forward ? edge.lengthM : 0 });
    cur = prev;
  }
  steps.reverse();
  // Odcinek startowy (fragment) i końcowy (fragment).
  const startForward = cur === sE.to;
  const startStep: PathStep = { edge: sE, forward: startForward, evaluation: start.evaluation, nodeEvaluation: null, fromM: start.alongM, toM: startForward ? sE.lengthM : 0 };
  const endForward = best.node === eE.from;
  const endStep: PathStep = { edge: eE, forward: endForward, evaluation: end.evaluation, nodeEvaluation: evalNode(best.node), fromM: endForward ? 0 : eE.lengthM, toM: end.alongM };
  return { ok: true, steps: [startStep, ...steps, endStep], exploredNodes: explored, costM: best.total, origin: start, destination: end };
}
