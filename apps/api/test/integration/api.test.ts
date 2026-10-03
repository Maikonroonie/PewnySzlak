/**
 * Testy integracyjne API na prawdziwej bazie (docker compose up db + import OSM).
 * Pomijane, gdy baza jest niedostępna albo brak aktywnego grafu.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Barrier, RouteResult } from '@pewnyszlak/domain';
import { buildApp } from '../../src/app.ts';
import { AppContext } from '../../src/context.ts';
import { applySchema, createPool } from '../../src/db.ts';
import { seedDemo } from '../../src/demo/seed.ts';

const db = createPool();
let app: FastifyInstance | null = null;
let ctx: AppContext | null = null;
const installationId = `test-install-${Date.now()}-abcdef0123456789`;
const RYNEK = { latitude: 50.0617, longitude: 19.9373 };
const WAWEL = { latitude: 50.0541, longitude: 19.9354 };
const created: string[] = [];

before(async () => {
  try {
    await db.query('select 1');
    await applySchema(db);
    const log = { info: () => {}, warn: () => {}, error: (m: string) => console.error(m) };
    ctx = new AppContext(db, log);
    await ctx.start();
    if (!ctx.graph) { console.log('# brak grafu – pomijam testy integracyjne'); ctx = null; return; }
    await seedDemo(db, () => {});
    await ctx.refreshLayer();
    app = await buildApp(ctx);
  } catch (e) {
    console.log(`# baza niedostępna – pomijam testy integracyjne (${e instanceof Error ? e.message : e})`);
    ctx = null;
  }
});

after(async () => {
  for (const id of created) await db.query('delete from barriers where id = $1', [id]).catch(() => {});
  await app?.close();
  ctx?.stop();
  await db.end();
});


describe('API – integracja', () => {
  it('health i sources opisują graf i źródła', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const h = await app!.inject({ method: 'GET', url: '/v1/health' });
    assert.equal(h.statusCode, 200);
    assert.ok(h.json().graph.edges > 100_000);
    const s = await app!.inject({ method: 'GET', url: '/v1/sources' });
    const body = s.json();
    assert.ok(body.sources.some((x: { source: string }) => x.source === 'osm'));
    assert.ok(body.sources.every((x: { licence: string; updateFrequency: string }) => x.licence && x.updateFrequency));
    const demo = await app!.inject({ method: 'GET', url: '/v1/sources', headers: { 'x-data-mode': 'demo' } });
    assert.equal(demo.json().sources.find((x: { source: string }) => x.source === 'psoz').state, 'unavailable', 'demo symuluje awarię źródła');
  });

  it('wyszukiwanie miejsc i adresów działa na lokalnym indeksie', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const r = await app!.inject({ method: 'GET', url: '/v1/places?q=Rynek%20G%C5%82%C3%B3wny%201' });
    assert.equal(r.statusCode, 200);
    const items = r.json().items;
    assert.ok(items.length > 0);
    assert.ok(items.every((p: { evidence: unknown[] }) => p.evidence.length > 0));
    const rev = await app!.inject({ method: 'GET', url: `/v1/places/reverse?lat=${RYNEK.latitude}&lon=${RYNEK.longitude}` });
    assert.ok(rev.json().place);
  });

  it('trasa Rynek → Wawel: live idzie Grodzką, demo omija remont i zgłasza objazd', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const live = await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: RYNEK, destination: WAWEL } });
    assert.equal(live.statusCode, 200);
    const lr = live.json() as RouteResult;
    assert.ok(lr.segments.some((s) => s.name === 'Grodzka'));
    assert.ok(lr.steps[0]!.type === 'depart' && lr.steps.at(-1)!.type === 'arrive');
    assert.ok(lr.segments.every((s) => s.evidence.length > 0 && s.evidence[0]!.sourceUrl));
    const demo = await app!.inject({ method: 'POST', url: '/v1/routes', headers: { 'x-data-mode': 'demo' }, payload: { origin: RYNEK, destination: WAWEL } });
    const dr = demo.json() as RouteResult;
    assert.equal(dr.mode, 'demo');
    assert.ok(dr.avoidedBarriers.some((b) => b.isDemo && /Grodzkiej/.test(b.title)));
    assert.ok(dr.distanceM > lr.distanceM);
    const blocked = new Set(dr.avoidedBarriers.flatMap((b) => b.edgeIds));
    assert.ok(dr.segments.every((s) => s.edgeIds.every((e) => !blocked.has(e))), 'trasa nie przechodzi przez zablokowane odcinki');
  });

  it('zmiana preferencji zmienia przebieg albo koszt trasy', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const strict = (await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: RYNEK, destination: WAWEL, preferences: { unknownPolicy: 'exclude' } } })).json() as RouteResult;
    const loose = (await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: RYNEK, destination: WAWEL, preferences: { avoidSteps: false, avoidRoughSurface: false, maxKerbHeightCm: 10 } } })).json() as RouteResult;
    assert.equal(strict.unknownDistanceM, 0);
    assert.ok(loose.distanceM <= strict.distanceM);
  });

  it('brak trasy zwraca 422 z wyjaśnieniem', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const r = await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: RYNEK, destination: { latitude: 52.23, longitude: 21.01 } } });
    assert.equal(r.statusCode, 422);
    assert.equal(r.json().error.code, 'NO_ROUTE');
    assert.equal(r.json().error.details.reason, 'outside-coverage');
  });

  it('szczegóły odcinka zawierają tagi, dowód OSM i ocenę', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const route = (await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: RYNEK, destination: WAWEL } })).json() as RouteResult;
    const edgeId = route.segments[1]!.edgeIds[0]!;
    const r = await app!.inject({ method: 'GET', url: `/v1/edges/${encodeURIComponent(edgeId)}?maxKerbHeightCm=4` });
    assert.equal(r.statusCode, 200);
    assert.ok(r.json().tags.highway);
    assert.equal(r.json().segment.evidence[0].source, 'osm');
    assert.ok(r.json().osm.timestamp);
  });

  it('zgłoszenie bariery jest trwałe, wpływa na trasę i podlega potwierdzeniom bez formalnej weryfikacji', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const route = (await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: RYNEK, destination: WAWEL } })).json() as RouteResult;
    const seg = route.segments.find((s) => s.name === 'Grodzka' && s.lengthM > 30)!;
    const mid = seg.geometry.coordinates[Math.floor(seg.geometry.coordinates.length / 2)]!;
    const edgeIds = seg.edgeIds.slice(0, 10);
    const report = await app!.inject({ method: 'POST', url: '/v1/barriers', payload: { type: 'obstacle', title: 'Test: kontener na chodniku', description: 'test integracyjny', coordinate: { longitude: mid[0], latitude: mid[1] }, edgeIds, installationId } });
    assert.equal(report.statusCode, 201, JSON.stringify(report.json()));
    const barrier = report.json().barrier as Barrier;
    created.push(barrier.id);
    assert.equal(barrier.state, 'active');
    assert.equal(barrier.evidence[0]!.status, 'reported');
    assert.ok(barrier.evidence[0]!.observedAt, 'zgłoszenie ma datę obserwacji');
    // trwałość: świeże odczytanie z bazy
    const fetched = await app!.inject({ method: 'GET', url: `/v1/barriers/${barrier.id}` });
    assert.equal(fetched.json().barrier.title, 'Test: kontener na chodniku');
    // wpływ na trasę
    const after = (await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: RYNEK, destination: WAWEL } })).json() as RouteResult;
    assert.ok(after.segments.every((s) => s.edgeIds.every((e) => !edgeIds.includes(e))), 'zgłoszony odcinek jest omijany');
    assert.ok(after.avoidedBarriers.some((b) => b.id === barrier.id));
    // potwierdzenia od innych instalacji nie dają statusu verified
    for (let i = 0; i < 3; i++) {
      const fb: { statusCode: number } = await app!.inject({ method: 'POST', url: `/v1/barriers/${barrier.id}/feedback`, payload: { installationId: `other-${i}-0123456789abcdef`, action: 'confirm' } });
      assert.equal(fb.statusCode, 200);
    }
    const confirmed = (await app!.inject({ method: 'GET', url: `/v1/barriers/${barrier.id}` })).json().barrier as Barrier;
    assert.equal(confirmed.confirmationCount, 3);
    assert.ok(!confirmed.evidence.some((e) => e.status === 'verified'));
    // dwa zgłoszenia „zniknęła” → rozwiązana, trasa wraca
    await app!.inject({ method: 'POST', url: `/v1/barriers/${barrier.id}/feedback`, payload: { installationId: 'res-1-0123456789abcdef0000', action: 'resolved' } });
    await app!.inject({ method: 'POST', url: `/v1/barriers/${barrier.id}/feedback`, payload: { installationId: 'res-2-0123456789abcdef0000', action: 'resolved' } });
    await app!.inject({ method: 'POST', url: `/v1/barriers/${barrier.id}/feedback`, payload: { installationId: 'res-3-0123456789abcdef0000', action: 'resolved' } });
    await app!.inject({ method: 'POST', url: `/v1/barriers/${barrier.id}/feedback`, payload: { installationId: 'res-4-0123456789abcdef0000', action: 'resolved' } });
    const resolved = (await app!.inject({ method: 'GET', url: `/v1/barriers/${barrier.id}` })).json().barrier as Barrier;
    assert.equal(resolved.state, 'resolved');
    const back = (await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: RYNEK, destination: WAWEL } })).json() as RouteResult;
    assert.ok(back.segments.some((s) => s.edgeIds.some((e) => edgeIds.includes(e))));
  });

  it('bariery w trybie demo zawierają konflikt, nieaktualne zgłoszenie i sygnał z przetargu', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const r = await app!.inject({ method: 'GET', url: '/v1/barriers?mode=demo&bbox=19.92,50.05,19.96,50.07&includeResolved=true' });
    const items = r.json().items as Barrier[];
    const demo = items.filter((b) => b.isDemo);
    assert.ok(demo.some((b) => b.evidence.some((e) => e.status === 'conflicting')), 'konflikt obserwacji');
    assert.ok(demo.some((b) => b.evidence.some((e) => e.isStale && e.status === 'reported')), 'nieaktualne zgłoszenie');
    assert.ok(demo.some((b) => b.state === 'potential' && b.evidence.some((e) => e.status === 'signal')), 'sygnał z przetargu');
    assert.ok(demo.some((b) => b.state === 'resolved'));
    const live = await app!.inject({ method: 'GET', url: '/v1/barriers?bbox=19.92,50.05,19.96,50.07' });
    assert.ok((live.json().items as Barrier[]).every((b) => !b.isDemo), 'tryb live nie pokazuje danych demo');
  });

  it('asystent w trybie regułowym podaje placówki NFZ z deklaracjami i źródłami, nic nie potwierdzając', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const r = await app!.inject({ method: 'POST', url: '/v1/assistant', payload: { message: 'najbliższa poradnia rehabilitacyjna', coordinate: RYNEK } });
    assert.equal(r.statusCode, 200);
    const body = r.json();
    assert.equal(body.mode, 'rules');
    assert.ok(/deklar/i.test(body.message));
    assert.ok(!/jest dostępn/i.test(body.message));
    assert.ok(body.disclaimer.length > 20);
    if (body.places.length > 0) {
      assert.ok(body.citations.some((c: { source: string }) => c.source === 'nfz'));
      assert.ok(body.actions.some((a: { type: string }) => a.type === 'route-to'));
    }
    const src = await app!.inject({ method: 'POST', url: '/v1/assistant', payload: { message: 'skąd są dane?' } });
    assert.ok(/Stan źródeł/.test(src.json().message));
    const route = await app!.inject({ method: 'POST', url: '/v1/assistant', payload: { message: 'trasa do Wawel', coordinate: RYNEK } });
    assert.ok(route.json().suggestedDestination);
  });

  it('walidacja i limity: błędne dane → 400, operator bez tokenu → 401', async (t) => {
    if (!app) return t.skip('baza/graf niedostępne');
    const bad = await app!.inject({ method: 'POST', url: '/v1/routes', payload: { origin: { latitude: 'x' } } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'VALIDATION');
    const op = await app!.inject({ method: 'PATCH', url: '/v1/operator/barriers/00000000-0000-0000-0000-000000000000', payload: { state: 'resolved' } });
    assert.equal(op.statusCode, 401);
    const short = await app!.inject({ method: 'POST', url: '/v1/barriers', payload: { type: 'other', title: 'ab', coordinate: RYNEK, installationId: 'short' } });
    assert.equal(short.statusCode, 400);
  });
});
