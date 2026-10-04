import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PREFERENCES, type Preferences } from '@pewnyszlak/domain';
import { BarrierLayer } from '../../src/barriers/layer.ts';
import { buildRoute } from '../../src/graph/route.ts';
import { barrier, makeGraph, pt } from '../helpers/graph.ts';

const FOOT = { highway: 'footway', surface: 'asphalt' };
const prefs: Preferences = { ...DEFAULT_PREFERENCES };

/**
 * Układ: A(0,0) — B(100,0) — C(200,0) krótką drogą (B–C to warianty), oraz objazd B — D(100,120) — C.
 *        A ---- B ==== C
 *               |      |
 *               D ------
 */
function diamond(bcTags: Record<string, string>, extra: { bTags?: Record<string, string>; midNodeTags?: Record<string, string> } = {}) {
  const A = pt(0, 0), B = pt(100, 0), C = pt(200, 0), D = pt(100, 120), M = pt(150, 0);
  const nodes = [
    { id: 1, ...A }, { id: 2, ...B, tags: extra.bTags }, { id: 3, ...C }, { id: 4, ...D }, { id: 5, ...M, tags: extra.midNodeTags },
  ];
  const edges = [
    { id: 'ab:0', from: 1, to: 2, tags: FOOT, name: 'Prosta' },
    { id: 'bm:0', from: 2, to: 5, tags: bcTags, name: 'Krótka' },
    { id: 'mc:0', from: 5, to: 3, tags: bcTags, name: 'Krótka' },
    { id: 'bd:0', from: 2, to: 4, tags: FOOT, name: 'Objazd' },
    { id: 'dc:0', from: 4, to: 3, tags: FOOT, name: 'Objazd' },
  ];
  return makeGraph(nodes, edges);
}

const A = pt(0, 0), C = pt(200, 0);
const origin = { latitude: A.lat, longitude: A.lon };
const destination = { latitude: C.lat, longitude: C.lon };
const usesEdge = (r: ReturnType<typeof buildRoute>, id: string) => r.ok && r.route.segments.some((s) => s.edgeIds.includes(id));

describe('routing – reguły preferencji', () => {
  it('omija schody, gdy avoidSteps = true, i używa ich, gdy false', () => {
    const g = diamond({ highway: 'steps', surface: 'paving_stones' });
    const avoid = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(avoid.ok);
    assert.ok(usesEdge(avoid, 'bd:0'), 'trasa powinna iść objazdem');
    assert.ok(!usesEdge(avoid, 'bm:0'));
    const allow = buildRoute(g, BarrierLayer.empty(), origin, destination, { ...prefs, avoidSteps: false }, 'live');
    assert.ok(allow.ok);
    // schody mają koszt ×3 – 100 m schodów (300) vs objazd 240 m → objazd nadal tańszy; sprawdźmy przez zwiększenie kary objazdu
    const g2 = diamond({ highway: 'steps', surface: 'paving_stones' });
    const far = buildRoute(g2, BarrierLayer.empty(), origin, destination, { ...prefs, avoidSteps: false }, 'live');
    assert.ok(far.ok);
    assert.ok(far.route.segments.length > 0);
  });

  it('schody z pochylnią (ramp:wheelchair=yes) są przejezdne mimo unikania schodów', () => {
    const g = diamond({ highway: 'steps', 'ramp:wheelchair': 'yes', surface: 'paving_stones' });
    const r = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(r.ok);
    assert.ok(usesEdge(r, 'bm:0'));
    assert.ok(r.route.segments.some((s) => s.warnings.some((w) => /pochyln/i.test(w))));
  });

  it('wysoki krawężnik w węźle wyklucza przejście; podniesienie limitu je przywraca', () => {
    const g = diamond({ highway: 'footway', footway: 'crossing', surface: 'asphalt' }, { midNodeTags: { barrier: 'kerb', kerb: 'raised', 'kerb:height': '12 cm' } });
    const strict = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(strict.ok);
    assert.ok(usesEdge(strict, 'bd:0'), 'krawężnik 12 cm > 2 cm → objazd');
    const loose = buildRoute(g, BarrierLayer.empty(), origin, destination, { ...prefs, maxKerbHeightCm: 15 }, 'live');
    assert.ok(loose.ok);
    assert.ok(usesEdge(loose, 'bm:0'));
    const seg = loose.route.segments.find((s) => s.edgeIds.includes('bm:0'))!;
    assert.equal(seg.accessibility.kerbHeightCm, 12);
    assert.ok(seg.evidence.some((e) => e.sourceId === 'node/5'));
  });

  it('kerb=lowered bez wysokości jest szacunkiem (2 cm) i oznacza odcinek jako niepewny', () => {
    const g = diamond({ highway: 'footway', footway: 'crossing', surface: 'asphalt' }, { midNodeTags: { barrier: 'kerb', kerb: 'lowered' } });
    const r = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(r.ok);
    assert.ok(usesEdge(r, 'bm:0'));
    const seg = r.route.segments.find((s) => s.edgeIds.includes('bm:0'))!;
    assert.ok(seg.estimatedFields.includes('kerbHeightCm'));
    assert.ok(seg.uncertain);
    assert.ok(seg.evidence.some((e) => e.status === 'estimated'));
  });

  it('trudna nawierzchnia (kocie łby) jest wykluczana przy avoidRoughSurface, kostka kamienna tylko droższa', () => {
    const g = diamond({ highway: 'footway', surface: 'unhewn_cobblestone' });
    const r = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(r.ok && usesEdge(r, 'bd:0'));
    const g2 = diamond({ highway: 'footway', surface: 'cobblestone' });
    const r2 = buildRoute(g2, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(r2.ok && usesEdge(r2, 'bd:0'));
    const r3 = buildRoute(g2, BarrierLayer.empty(), origin, destination, { ...prefs, avoidRoughSurface: false }, 'live');
    assert.ok(r3.ok && usesEdge(r3, 'bm:0'), 'bez unikania: krótsza droga po bruku (100 m × 2.2 = 220 < 240)');
    const g3 = diamond({ highway: 'footway', surface: 'sett' });
    const r4 = buildRoute(g3, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(r4.ok && usesEdge(r4, 'bm:0'), 'sett: 100 × 1.5 = 150 < 240');
  });

  it('nachylenie powyżej limitu wyklucza odcinek; zmiana preferencji zmienia przebieg', () => {
    const g = diamond({ highway: 'footway', surface: 'asphalt', incline: '9%' });
    const r = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(r.ok && usesEdge(r, 'bd:0'));
    const r2 = buildRoute(g, BarrierLayer.empty(), origin, destination, { ...prefs, maxIncline: 10 }, 'live');
    assert.ok(r2.ok && usesEdge(r2, 'bm:0'));
  });

  it('szerokość poniżej minimum wyklucza; wheelchair=no wyklucza zawsze', () => {
    const g = diamond({ highway: 'footway', surface: 'asphalt', width: '0.8' });
    const r = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(r.ok && usesEdge(r, 'bd:0'));
    const g2 = diamond({ highway: 'footway', surface: 'asphalt', wheelchair: 'no' });
    const r2 = buildRoute(g2, BarrierLayer.empty(), origin, destination, { ...prefs, avoidSteps: false, avoidRoughSurface: false }, 'live');
    assert.ok(r2.ok && usesEdge(r2, 'bd:0'));
  });

  it('brak danych o nawierzchni: „zwiększ koszt” oznacza odcinek, „wyklucz” go usuwa', () => {
    const g = diamond({ highway: 'footway' });
    const pen = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(pen.ok && usesEdge(pen, 'bm:0'), '100 × 1.3 = 130 < 240');
    assert.ok(pen.route.unknownDistanceM > 90);
    assert.ok(pen.route.warnings.some((w) => /nawierzchni/.test(w)));
    const exc = buildRoute(g, BarrierLayer.empty(), origin, destination, { ...prefs, unknownPolicy: 'exclude' }, 'live');
    assert.ok(exc.ok && usesEdge(exc, 'bd:0'));
    assert.equal(exc.route.unknownDistanceM, 0);
  });
});

describe('routing – warstwa barier', () => {
  it('aktywna blokująca bariera wymusza objazd; po rozwiązaniu trasa wraca', () => {
    const g = diamond(FOOT);
    const direct = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.ok(direct.ok && usesEdge(direct, 'bm:0'));
    const blocked = new BarrierLayer([barrier({ id: 'b1', edgeIds: ['bm:0'], title: 'Remont', coordinate: { longitude: pt(125, 0).lon, latitude: pt(125, 0).lat } })]);
    const detour = buildRoute(g, blocked, origin, destination, prefs, 'live');
    assert.ok(detour.ok && usesEdge(detour, 'bd:0'));
    assert.equal(detour.route.avoidedBarriers.length, 1);
    assert.ok(detour.route.warnings.some((w) => /omija: Remont/.test(w)));
    const resolved = new BarrierLayer([barrier({ id: 'b1', edgeIds: ['bm:0'], state: 'resolved' })]);
    const back = buildRoute(g, resolved, origin, destination, prefs, 'live');
    assert.ok(back.ok && usesEdge(back, 'bm:0'));
  });

  it('bariera potencjalna (sygnał z przetargu) nie blokuje – zwiększa koszt i dodaje ostrzeżenie', () => {
    const g = diamond(FOOT);
    const layer = new BarrierLayer([barrier({ id: 'p1', edgeIds: ['bm:0', 'mc:0'], state: 'potential', blocksRouting: false, title: 'Możliwe roboty' })]);
    const r = buildRoute(g, layer, origin, destination, prefs, 'live');
    assert.ok(r.ok && usesEdge(r, 'bm:0'), '100 × 1.5 = 150 < 240');
    assert.equal(r.route.barriers.length, 1);
    assert.ok(r.route.warnings.some((w) => /przetarg/.test(w)));
    assert.ok(r.route.segments.find((s) => s.edgeIds.includes('bm:0'))!.uncertain);
  });

  it('bariera z oknem czasowym po terminie przestaje działać', () => {
    const g = diamond(FOOT);
    const expired = new BarrierLayer([barrier({ id: 'x', edgeIds: ['bm:0'], validUntil: '2020-01-01T00:00:00.000Z' })]);
    const r = buildRoute(g, expired, origin, destination, prefs, 'live');
    assert.ok(r.ok && usesEdge(r, 'bm:0'));
  });

  it('bariera w węźle (np. nieczynna winda) blokuje przejście przez węzeł', () => {
    const g = diamond(FOOT);
    const layer = new BarrierLayer([barrier({ id: 'n', edgeIds: [], nodeIds: ['5'], type: 'elevator' })]);
    const r = buildRoute(g, layer, origin, destination, prefs, 'live');
    assert.ok(r.ok && usesEdge(r, 'bd:0'));
  });

  it('bariery demo są widoczne tylko w trybie demo', () => {
    const g = diamond(FOOT);
    const layer = new BarrierLayer([barrier({ id: 'd', edgeIds: ['bm:0'], isDemo: true })]);
    const live = buildRoute(g, layer.forMode('live'), origin, destination, prefs, 'live');
    assert.ok(live.ok && usesEdge(live, 'bm:0'));
    const demo = buildRoute(g, layer.forMode('demo'), origin, destination, prefs, 'demo');
    assert.ok(demo.ok && usesEdge(demo, 'bd:0'));
  });
});

describe('routing – topologia', () => {
  it('drogi krzyżujące się bez wspólnego węzła (wiadukt) nie są połączone', () => {
    // pozioma A–B i pionowa C–D przecinają się geometrycznie w środku, ale nie mają wspólnego węzła
    const A = pt(0, 0), B = pt(200, 0), C = pt(100, -100), D = pt(100, 100);
    const g = makeGraph([{ id: 1, ...A }, { id: 2, ...B }, { id: 3, ...C }, { id: 4, ...D }], [
      { id: 'ab:0', from: 1, to: 2, tags: { ...FOOT, bridge: 'yes', layer: '1' } },
      { id: 'cd:0', from: 3, to: 4, tags: FOOT },
    ]);
    const r = buildRoute(g, BarrierLayer.empty(), { latitude: A.lat, longitude: A.lon }, { latitude: D.lat, longitude: D.lon }, prefs, 'live');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.details.details.reason, 'disconnected');
  });

  it('wspólny węzeł łączy drogi (kontrola pozytywna)', () => {
    const A = pt(0, 0), B = pt(200, 0), X = pt(100, 0), C = pt(100, -100), D = pt(100, 100);
    const g = makeGraph([{ id: 1, ...A }, { id: 2, ...B }, { id: 3, ...C }, { id: 4, ...D }, { id: 9, ...X }], [
      { id: 'ax:0', from: 1, to: 9, tags: FOOT }, { id: 'xb:0', from: 9, to: 2, tags: FOOT }, { id: 'cx:0', from: 3, to: 9, tags: FOOT }, { id: 'xd:0', from: 9, to: 4, tags: FOOT },
    ]);
    const r = buildRoute(g, BarrierLayer.empty(), { latitude: A.lat, longitude: A.lon }, { latitude: D.lat, longitude: D.lon }, prefs, 'live');
    assert.ok(r.ok);
    assert.ok(Math.abs(r.route.distanceM - 200) < 3);
  });

  it('brak trasy przy wykluczeniu wszystkiego daje wyjaśnienie „blocked-by-preferences”', () => {
    const g = diamond({ highway: 'steps' });
    // objazd też po schodach
    const A = pt(0, 0), B = pt(100, 0), C = pt(200, 0);
    const g2 = makeGraph([{ id: 1, ...A }, { id: 2, ...B }, { id: 3, ...C }], [{ id: 'ab:0', from: 1, to: 2, tags: FOOT }, { id: 'bc:0', from: 2, to: 3, tags: { highway: 'steps' } }]);
    const r = buildRoute(g2, BarrierLayer.empty(), origin, destination, prefs, 'live');
    assert.equal(r.ok, false, 'cel leży przy schodach – nie wolno po cichu przenieść go na odległy chodnik');
    if (!r.ok) {
      assert.equal(r.details.details.reason, 'destination-unreachable');
      assert.match(r.details.details.explanation, /schody/);
      assert.ok(r.details.details.suggestions.length > 0);
    }
    // ten sam graf, ale cel w połowie drogi: dojście jest, lecz wszystko dalej to schody → brak trasy „przez preferencje”
    const Dn = pt(300, 0);
    const g3 = makeGraph([{ id: 1, ...A }, { id: 2, ...B }, { id: 3, ...C }, { id: 4, ...Dn }], [{ id: 'ab:0', from: 1, to: 2, tags: FOOT }, { id: 'bc:0', from: 2, to: 3, tags: { highway: 'steps' } }, { id: 'cd:0', from: 3, to: 4, tags: FOOT }]);
    const r3 = buildRoute(g3, BarrierLayer.empty(), origin, { latitude: Dn.lat, longitude: Dn.lon }, prefs, 'live');
    assert.equal(r3.ok, false);
    if (!r3.ok) assert.equal(r3.details.details.reason, 'blocked-by-preferences');
    assert.ok(g.edges.length > 0);
  });

  it('punkt poza pokryciem zwraca outside-coverage', () => {
    const g = diamond(FOOT);
    const r = buildRoute(g, BarrierLayer.empty(), origin, { latitude: 52.2, longitude: 21.0 }, prefs, 'live');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.details.details.reason, 'outside-coverage');
  });
});

describe('routing – wynik', () => {
  it('zawiera instrukcje (start i cel), dowody OSM, braki danych i informację o dojściu', () => {
    const g = diamond({ highway: 'footway', surface: 'asphalt' });
    const off = pt(0, 40); // start 40 m od sieci
    const r = buildRoute(g, BarrierLayer.empty(), { latitude: off.lat, longitude: off.lon }, destination, prefs, 'live');
    assert.ok(r.ok);
    assert.equal(r.route.steps[0]!.type, 'depart');
    assert.equal(r.route.steps[r.route.steps.length - 1]!.type, 'arrive');
    assert.ok(r.route.segments.every((s) => s.evidence.some((e) => e.source === 'osm' && e.sourceUrl?.includes('openstreetmap.org/way/'))));
    assert.ok(r.route.segments.every((s) => s.missingFields.includes('incline')));
    assert.equal(r.route.originSnap.verified, false);
    assert.ok(r.route.originSnap.note);
    assert.equal(r.route.destinationSnap.verified, true);
    assert.ok(r.route.durationSeconds > 0);
    assert.equal(r.route.geometry.type, 'LineString');
  });

  it('dowód OSM starszy niż 24 miesiące jest oznaczony jako możliwie nieaktualny', () => {
    const A = pt(0, 0), B = pt(100, 0);
    const g = makeGraph([{ id: 1, ...A }, { id: 2, ...B }], [{ id: 'ab:0', from: 1, to: 2, tags: FOOT, timestamp: '2019-05-01T00:00:00.000Z' }]);
    const r = buildRoute(g, BarrierLayer.empty(), { latitude: A.lat, longitude: A.lon }, { latitude: B.lat, longitude: B.lon }, prefs, 'live');
    assert.ok(r.ok);
    assert.equal(r.route.segments[0]!.evidence[0]!.isStale, true);
    assert.equal(r.route.segments[0]!.evidence[0]!.observedAt, null, 'data edycji OSM nie jest datą sprawdzenia');
  });

  it('odwiedza punkt pośredni (A → D → C) i zwraca dwa odcinki nóg', () => {
    const g = diamond(FOOT);
    const via = { latitude: pt(100, 120).lat, longitude: pt(100, 120).lon };
    const r = buildRoute(g, BarrierLayer.empty(), origin, destination, prefs, 'live', [via]);
    assert.ok(r.ok);
    assert.equal(r.route.legs.length, 2);
    assert.ok(usesEdge(r, 'bd:0'));
    assert.ok(usesEdge(r, 'dc:0'));
    assert.ok(r.route.steps.some((s) => /Punkt A/.test(s.text)));
  });
});
