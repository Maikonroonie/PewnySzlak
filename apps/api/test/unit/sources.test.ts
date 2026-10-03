import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kerbHeightCm, parseIncline, parseLengthCm, segmentKind, surfaceClassOf, nodeAttrs } from '../../src/graph/accessibility.ts';
import { McpClient } from '../../src/sync/mcp.ts';
import { classifyTender, extractStreetCandidates } from '../../src/sync/zdykty.ts';
import { addressKey } from '../../src/sync/nfz.ts';
import { rowToBarrier } from '../../src/barriers/repo.ts';

describe('parsowanie tagów OSM', () => {
  it('nachylenie', () => {
    assert.equal(parseIncline('5%'), 5);
    assert.equal(parseIncline('-8%'), 8);
    assert.equal(parseIncline('up'), null);
    assert.equal(parseIncline(undefined), null);
  });
  it('długości', () => {
    assert.equal(parseLengthCm('1.5'), 150);
    assert.equal(parseLengthCm('150 cm'), 150);
    assert.equal(parseLengthCm('0.9 m'), 90);
    assert.equal(parseLengthCm('2'), 200);
  });
  it('krawężnik: pomiar vs szacunek vs brak', () => {
    assert.deepEqual(kerbHeightCm({ 'kerb:height': '0.03' }), { value: 3, estimated: false, unknown: false });
    assert.deepEqual(kerbHeightCm({ kerb: 'lowered' }), { value: 2, estimated: true, unknown: false });
    assert.deepEqual(kerbHeightCm({ kerb: 'raised' }), { value: 12, estimated: true, unknown: false });
    assert.deepEqual(kerbHeightCm({ highway: 'crossing' }), { value: null, estimated: false, unknown: true });
  });
  it('klasy nawierzchni', () => {
    assert.equal(surfaceClassOf({ surface: 'asphalt' }), 0);
    assert.equal(surfaceClassOf({ surface: 'sett' }), 1);
    assert.equal(surfaceClassOf({ surface: 'sett', smoothness: 'good' }), 0);
    assert.equal(surfaceClassOf({ surface: 'sett', smoothness: 'bad' }), 2);
    assert.equal(surfaceClassOf({ surface: 'unhewn_cobblestone' }), 3);
    assert.equal(surfaceClassOf({}), -1);
  });
  it('rodzaje odcinków', () => {
    assert.equal(segmentKind({ highway: 'footway', footway: 'sidewalk' }), 'sidewalk');
    assert.equal(segmentKind({ highway: 'footway', footway: 'crossing' }), 'crossing');
    assert.equal(segmentKind({ highway: 'primary' }), 'carriageway');
    assert.equal(segmentKind({ highway: 'residential', sidewalk: 'both' }), 'sidewalk');
    assert.equal(segmentKind({ highway: 'living_street' }), 'shared-road');
  });
  it('bariery punktowe', () => {
    assert.equal(nodeAttrs({ barrier: 'turnstile' }).impassable, true);
    assert.equal(nodeAttrs({ barrier: 'cycle_barrier' }).impassable, false);
    assert.ok(nodeAttrs({ barrier: 'cycle_barrier' }).penaltyM > 30);
    assert.equal(nodeAttrs({ barrier: 'cycle_barrier', wheelchair: 'no' }).impassable, true);
    assert.equal(nodeAttrs({ barrier: 'bollard', maxwidth: '0.8' }).maxWidthCm, 80);
    assert.equal(nodeAttrs({ highway: 'elevator' }).isElevator, true);
  });
});

describe('z-dykty – klasyfikacja i geokodowanie tytułów', () => {
  it('rozpoznaje roboty istotne dla pieszych', () => {
    assert.equal(classifyTender('Budowa chodnika przy ul. Lubockiej – projekt z Budżetu Obywatelskiego'), 'pedestrian');
    assert.equal(classifyTender('Przebudowa ul. Rybitwy na odcinku od ul. Szparagowej'), 'possible');
    assert.equal(classifyTender('Remont 4 lokali mieszkalnych zasobu Gminy Miejskiej Kraków'), 'none');
    assert.equal(classifyTender('Wymiana okien w budynku Sądu'), 'none');
    assert.equal(classifyTender('Modernizacja budynku obejmująca remont klatki schodowej nr 2'), 'none');
  });
  it('wyciąga kandydatów na ulice', () => {
    assert.deepEqual(extractStreetCandidates('Budowa chodnika przy ul. Lubockiej – projekt'), ['Lubockiej']);
    assert.deepEqual(extractStreetCandidates('Przebudowa ul. Rybitwy na odcinku od ul. Szparagowej do ul. Rybitwy 88a'), ['Rybitwy', 'Szparagowej']);
    assert.ok(extractStreetCandidates('Przebudowa drogi powiatowej ul. Witosa (klasy technicznej GP) w Krakowie').includes('Witosa'));
    assert.deepEqual(extractStreetCandidates('Remont elewacji'), []);
  });
});

describe('NFZ – klucz adresu', () => {
  it('wybiera nazwisko / nazwę własną z adresu i numer', () => {
    assert.deepEqual(addressKey('UL. KS. KAZIMIERZA SIEMASZKI 17E'), { token: 'siemaszki', number: '17e', street: 'kazimierza siemaszki' });
    assert.equal(addressKey('UL. AL. F. FOCHA 33').token, 'focha');
    assert.equal(addressKey('OSIEDLE UROCZE 2').token, 'urocze');
    assert.equal(addressKey('UL. OS. NA SKARPIE 6').token, 'skarpie');
  });
});

describe('klient MCP', () => {
  const fakeFetch = (payload: unknown, sse = false): typeof fetch => (async () => new Response(sse ? `event: message\ndata: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload), { status: 200, headers: { 'content-type': sse ? 'text/event-stream' : 'application/json' } })) as typeof fetch;
  it('odczytuje structuredContent z JSON', async () => {
    const c = new McpClient('http://x', 1000, fakeFetch({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ok' }], structuredContent: { dane: [1] } } }));
    const r = await c.callTool<{ dane: number[] }>('t', {});
    assert.deepEqual(r.structured, { dane: [1] });
  });
  it('obsługuje SSE i JSON w tekście', async () => {
    const c = new McpClient('http://x', 1000, fakeFetch({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'opis' }, { type: 'text', text: '{"a":1}' }] } }, true));
    const r = await c.callTool<{ a: number }>('t', {});
    assert.deepEqual(r.structured, { a: 1 });
  });
  it('błąd HTTP → wyjątek (źródło niedostępne)', async () => {
    const c = new McpClient('http://x', 1000, (async () => new Response('nope', { status: 503 })) as typeof fetch);
    await assert.rejects(() => c.listTools(), /HTTP 503/);
  });
});

describe('bariery – sprzeczne obserwacje', () => {
  it('potwierdzenia i zaprzeczenia dają status „sprzeczne”, bez automatycznej weryfikacji', () => {
    const b = rowToBarrier({
      id: '1', type: 'kerb', title: 'K', description: '', lon: 1, lat: 1, edge_ids: [], node_ids: [], state: 'active', blocks_routing: false, valid_from: null, valid_until: null, is_demo: false, origin_source: 'community',
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z', meta: {}, confirmations: 2, rejections: 1, resolved: 0,
      evidence: [{ id: 'e1', source: 'community', source_id: 'r1', source_url: null, status: 'reported', description: null, updated_at: null, observed_at: '2026-01-01T00:00:00.000Z', fetched_at: '2026-01-01T00:00:00.000Z' }],
    } as never);
    assert.ok(b.evidence.some((e) => e.status === 'conflicting'));
    assert.ok(!b.evidence.some((e) => e.status === 'verified'));
  });
  it('stare zgłoszenie jest oznaczone jako możliwie nieaktualne', () => {
    const b = rowToBarrier({
      id: '2', type: 'elevator', title: 'W', description: '', lon: 1, lat: 1, edge_ids: [], node_ids: [], state: 'active', blocks_routing: false, valid_from: null, valid_until: null, is_demo: false, origin_source: 'community',
      created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', meta: {}, confirmations: 0, rejections: 0, resolved: 0,
      evidence: [{ id: 'e1', source: 'community', source_id: 'r1', source_url: null, status: 'reported', description: null, updated_at: null, observed_at: '2025-01-01T00:00:00.000Z', fetched_at: '2025-01-01T00:00:00.000Z' }],
    } as never);
    assert.equal(b.evidence[0]!.isStale, true);
  });
});
