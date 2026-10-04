import type { Barrier, ComfortEdge, ExploreRequest, ExploreResponse, ExploreSuggestion, Place, Preferences } from '@pewnyszlak/domain';
import { formatDistance } from '@pewnyszlak/domain';
import type { BarrierLayer } from '../barriers/layer.ts';
import { evaluateEdge, evaluateNode } from './cost.ts';
import { haversineM } from './geo.ts';
import type { Graph } from './graph.ts';
import { snapPoint } from './astar.ts';

/** Mniej krawędzi = szybsza odpowiedź i lżejsza mapa na telefonie. */
const MAX_EDGES_RETURNED = 72;
const MAX_BFS_NODES = 1_200;

function simplifyLine(coords: [number, number][]): [number, number][] {
  if (coords.length <= 3) return coords;
  const mid = coords[Math.floor(coords.length / 2)]!;
  return [coords[0]!, mid, coords[coords.length - 1]!];
}

function fitForPlace(place: Place, prefs: Preferences): { fitSummary: string; gaps: string[] } {
  const gaps: string[] = [];
  const a = place.accessibility;
  const am = place.amenities;
  if (prefs.activity === 'wheelchair' || prefs.avoidSteps) {
    if (a.steps === true) gaps.push('Schody przy wejściu');
    if (a.wheelchair === 'no') gaps.push('Oznaczone jako niedostępne dla wózka');
  }
  if (am?.ramp === false) gaps.push('Brak deklarowanej pochylni');
  if (am?.elevator === false && prefs.activity === 'wheelchair') gaps.push('Brak deklarowanej windy');

  const positives: string[] = [];
  if (a.wheelchair === 'yes' || a.wheelchair === 'designated') positives.push('oznaczenie dla wózka');
  if (am?.ramp === true) positives.push('pochylnia');
  if (am?.toilet === true) positives.push('toaleta');
  if (am?.elevator === true) positives.push('winda');
  if (am?.rest === true) positives.push('odpoczynek');
  if (place.terrainChecked || place.evidence.some((e) => e.status === 'verified' && e.observedAt)) positives.push('sprawdzone w terenie');
  if (place.category?.startsWith('heritage=')) positives.push('wpis w rejestrze/ewidencji zabytków');

  if (positives.length && gaps.length === 0) {
    return { fitSummary: `Wg danych: ${positives.join(', ')}.`, gaps: [] };
  }
  if (positives.length && gaps.length) {
    return { fitSummary: `Częściowo pasuje (${positives.join(', ')}).`, gaps: gaps.slice(0, 2) };
  }
  if (gaps.length) {
    return { fitSummary: 'Są sygnały utrudnień – sprawdź przed wizytą.', gaps: gaps.slice(0, 2) };
  }
  // Dla roweru/spaceru „wejście” nic nie mówi – to tylko brak tagów OSM o dostępności budynku.
  if (prefs.activity === 'wheelchair') {
    return { fitSummary: 'Brak szczegółów o wejściu w danych OSM.', gaps: [] };
  }
  return { fitSummary: '', gaps: [] };
}

function catOf(place: Place): string {
  return (place.category ?? '').toLowerCase();
}

/** Im niższy wynik, tym lepsza propozycja. Zależnie od aktywności (rower ≠ muzea na Rynku). */
function sightScore(place: Place, prefs: Preferences, radiusM: number, distanceM: number): number {
  const c = catOf(place);
  const activity = prefs.activity;
  const verified = place.terrainChecked || place.id.startsWith('verified-');

  let rank = 8;
  if (c.includes('zoo') || c.includes('theme_park') || c.includes('nature_reserve')) rank = 0;
  else if (c.includes('park') || c.includes('garden') || c.includes('viewpoint')) rank = 1;
  else if (c.includes('castle') || c.includes('fort') || c.includes('palace') || c.includes('manor')) rank = 2;
  else if (c.includes('attraction')) rank = 3;
  else if (c.includes('museum') || c.includes('gallery')) rank = 4;
  else if (c.includes('heritage=register') || c.includes('monument') || c.includes('city_gate')) rank = 5;
  else if (c.includes('theatre') || c.includes('arts_centre') || c.includes('memorial') || c.includes('artwork')) rank = 6;
  else if (c.includes('place_of_worship') || c.includes('church') || c.includes('library') || c.includes('fountain')) rank = 7;

  if (activity === 'bike' || activity === 'run') {
    // Dalekie cele rekreacyjne > lokalne muzea / zweryfikowany Rynek.
    if (c.includes('zoo') || c.includes('theme_park') || c.includes('nature_reserve')) rank = 0;
    else if (c.includes('park') || c.includes('garden') || c.includes('viewpoint')) rank = 1;
    else if (c.includes('castle') || c.includes('fort') || c.includes('attraction')) rank = 2;
    else if (c.includes('museum') || c.includes('gallery')) rank = 4;
    else if (c.includes('artwork') || c.includes('memorial') || c.includes('fountain')) rank = 7;
    if (verified) rank = Math.min(rank + 2, 8); // nie wypychaj zoo przez Rynek
  } else if (activity === 'wheelchair') {
    if (verified) rank = -1;
    if (place.accessibility.wheelchair === 'yes' || place.accessibility.wheelchair === 'designated') rank -= 1;
  } else if (verified) {
    rank = Math.min(rank, 1);
  }

  // Preferuj dystans „w sam raz” względem promienia (szczególnie rower).
  let distPenalty = distanceM / 1000;
  if (activity === 'bike' || activity === 'run') {
    const target = Math.min(Math.max(radiusM * 0.55, 2_500), activity === 'bike' ? 12_000 : 6_000);
    distPenalty = Math.abs(distanceM - target) / 1000;
    // Lekko karaj bardzo bliskie punkty przy dużym promieniu.
    if (radiusM >= 5_000 && distanceM < radiusM * 0.2) distPenalty += 3;
  }

  return rank * 10 + distPenalty;
}

function diversifySuggestions(items: ExploreSuggestion[], limit = 8): ExploreSuggestion[] {
  const out: ExploreSuggestion[] = [];
  for (const s of items) {
    if (out.length >= limit) break;
    const tooClose = out.some((o) => {
      if (!o.place.coordinate || !s.place.coordinate) return false;
      return haversineM(
        o.place.coordinate.longitude, o.place.coordinate.latitude,
        s.place.coordinate.longitude, s.place.coordinate.latitude,
      ) < 450;
    });
    if (tooClose && out.length >= 3) continue;
    out.push(s);
  }
  // Przy dużym zasięgu zapewnij ≥1 dalszy punkt, jeśli jest w puli.
  if (items[0] && items[0].distanceM > 0) {
    const far = items.find((s) => s.distanceM >= Math.max(items[0]!.distanceM * 2, 2_000));
    if (far && !out.some((o) => o.place.id === far.place.id) && out.length >= 2) {
      out[out.length - 1] = far;
    }
  }
  return out;
}

/** Komfortowa sieć wokół startu: lekki BFS (Map zamiast Float64Array całego grafu). */
export function exploreAround(
  graph: Graph,
  layer: BarrierLayer,
  req: ExploreRequest,
  places: Place[],
  barriers: Barrier[],
): ExploreResponse {
  const prefs = req.preferences;
  const radiusM = req.radiusM;
  const comfortRadiusM = Math.min(radiusM, 2_000);
  const snap = snapPoint(graph, req.origin, { ...prefs, avoidSteps: false, avoidRoughSurface: false, maxIncline: 30, maxKerbHeightCm: 30, minWidthCm: 30, unknownPolicy: 'penalize' }, layer, 350);
  const comfortEdges: ComfortEdge[] = [];
  const stats = { ok: 0, uncertain: 0, excluded: 0, sampled: 0 };
  const seenEdge = new Set<number>();

  if ('edge' in snap && snap.edge) {
    const startNode = snap.alongM < snap.edge.lengthM / 2 ? snap.edge.from : snap.edge.to;
    const dist = new Map<number, number>([[startNode, 0]]);
    const queue = [startNode];
    let qi = 0;
    let visited = 0;
    while (qi < queue.length && visited < MAX_BFS_NODES && comfortEdges.length < MAX_EDGES_RETURNED) {
      const n = queue[qi++]!;
      const d0 = dist.get(n) ?? Infinity;
      if (d0 > comfortRadiusM) continue;
      visited++;
      const begin = graph.offsets[n]!;
      const end = graph.offsets[n + 1]!;
      for (let i = begin; i < end; i++) {
        const eIdx = graph.adjEdge[i]!;
        const edge = graph.edges[eIdx]!;
        const to = graph.adjNode[i]!;
        const nd = evaluateNode(graph, to, prefs, layer);
        const ev = evaluateEdge(edge, prefs, layer);
        if (!seenEdge.has(eIdx)) {
          seenEdge.add(eIdx);
          let status: ComfortEdge['status'] = 'ok';
          let reason: string | null = null;
          if (ev.excluded || nd.excluded) {
            status = 'excluded';
            reason = ev.reason ?? nd.reason;
            stats.excluded++;
          } else if (ev.uncertain || nd.uncertain) {
            status = 'uncertain';
            reason = ev.warnings[0] ?? nd.warnings[0] ?? 'Brak pełnych danych';
            stats.uncertain++;
          } else {
            stats.ok++;
          }
          // Preferuj ok/uncertain; excluded tylko do ~25% próbki
          const allowExcluded = comfortEdges.filter((e) => e.status === 'excluded').length < Math.floor(MAX_EDGES_RETURNED * 0.25);
          if (comfortEdges.length < MAX_EDGES_RETURNED && (status !== 'excluded' || allowExcluded)) {
            comfortEdges.push({
              id: edge.id,
              status,
              reason,
              name: edge.name ?? '',
              lengthM: Math.round(edge.lengthM),
              geometry: { type: 'LineString', coordinates: simplifyLine(edge.coords) },
            });
          }
        }
        if (ev.excluded || nd.excluded) continue;
        const next = d0 + edge.lengthM;
        const prev = dist.get(to);
        if (next <= comfortRadiusM && (prev === undefined || next < prev)) {
          dist.set(to, next);
          queue.push(to);
        }
      }
    }
  }

  // Fallback bbox tylko gdy BFS prawie nic nie znalazł (start poza siecią)
  if (comfortEdges.length < 12) {
    const dLat = comfortRadiusM / 111_000;
    const dLon = comfortRadiusM / (111_000 * Math.cos((req.origin.latitude * Math.PI) / 180));
    for (const edge of graph.edgesInBbox(req.origin.longitude - dLon, req.origin.latitude - dLat, req.origin.longitude + dLon, req.origin.latitude + dLat)) {
      if (seenEdge.has(edge.idx) || comfortEdges.length >= MAX_EDGES_RETURNED) continue;
      const mid = edge.coords[Math.floor(edge.coords.length / 2)]!;
      if (haversineM(req.origin.longitude, req.origin.latitude, mid[0], mid[1]) > comfortRadiusM) continue;
      const ev = evaluateEdge(edge, prefs, layer);
      const status: ComfortEdge['status'] = ev.excluded ? 'excluded' : ev.uncertain ? 'uncertain' : 'ok';
      if (status === 'ok') stats.ok++; else if (status === 'uncertain') stats.uncertain++; else stats.excluded++;
      comfortEdges.push({
        id: edge.id,
        status,
        reason: ev.reason ?? ev.warnings[0] ?? null,
        name: edge.name ?? '',
        lengthM: Math.round(edge.lengthM),
        geometry: { type: 'LineString', coordinates: simplifyLine(edge.coords) },
      });
      seenEdge.add(edge.idx);
    }
  }
  stats.sampled = comfortEdges.length;

  const ranked = places
    .filter((p) => p.coordinate)
    .map((place) => {
      const distanceM = place.distanceM ?? Math.round(haversineM(req.origin.longitude, req.origin.latitude, place.coordinate!.longitude, place.coordinate!.latitude));
      const { fitSummary, gaps } = fitForPlace(place, prefs);
      return { place, distanceM, fitSummary, gaps };
    })
    .sort((a, b) => {
      const sa = sightScore(a.place, prefs, radiusM, a.distanceM);
      const sb = sightScore(b.place, prefs, radiusM, b.distanceM);
      if (Math.abs(sa - sb) > 0.05) return sa - sb;
      const ga = a.gaps.length - (a.place.accessibility.wheelchair === 'yes' || a.place.accessibility.wheelchair === 'designated' ? 2 : 0);
      const gb = b.gaps.length - (b.place.accessibility.wheelchair === 'yes' || b.place.accessibility.wheelchair === 'designated' ? 2 : 0);
      return ga - gb || a.distanceM - b.distanceM;
    });
  const suggestions = diversifySuggestions(ranked, 10);

  return {
    origin: req.origin,
    radiusM: req.radiusM,
    preferences: prefs,
    places,
    barriers,
    comfortEdges,
    stats,
    suggestions,
    disclaimer: `Propozycje miejsc w zasięgu ok. ${formatDistance(req.radiusM)} (dla ${prefs.activity === 'bike' ? 'roweru' : prefs.activity === 'wheelchair' ? 'wózka' : 'aktywności'}: cele rekreacyjne i krajobrazowe mają pierwszeństwo przed samym centrum). Kolory opisują dane OSM i zgłoszenia – nie gwarantują dostępności.`,
  };
}
