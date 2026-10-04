import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preferencesForActivity, type Place } from '@pewnyszlak/domain';
import { BarrierLayer } from '../../src/barriers/layer.ts';
import { exploreAround } from '../../src/graph/explore.ts';
import { makeGraph, pt } from '../helpers/graph.ts';

const FOOT = { highway: 'footway', surface: 'asphalt' };

function tinyGraph() {
  const A = pt(0, 0), B = pt(80, 0), C = pt(160, 0), D = pt(80, 90);
  const nodes = [
    { id: 1, ...A }, { id: 2, ...B }, { id: 3, ...C }, { id: 4, ...D },
  ];
  const edges = [
    { id: 'ab:0', from: 1, to: 2, tags: FOOT, name: 'Gładka' },
    { id: 'bc:0', from: 2, to: 3, tags: { highway: 'steps', surface: 'paving_stones' }, name: 'Schody' },
    { id: 'bd:0', from: 2, to: 4, tags: { highway: 'footway', surface: 'sett' }, name: 'Kostka' },
    { id: 'dc:0', from: 4, to: 3, tags: FOOT, name: 'Objazd' },
  ];
  return makeGraph(nodes, edges);
}

const place = (id: string, lon: number, lat: number, wheelchair: Place['accessibility']['wheelchair'] = null): Place => ({
  id,
  kind: 'place',
  name: id,
  category: 'attraction',
  address: null,
  coordinate: { longitude: lon, latitude: lat },
  distanceM: Math.round(Math.hypot(lon, lat)),
  accessibility: { steps: null, surface: null, smoothness: null, incline: null, widthCm: null, kerbHeightCm: null, wheelchair },
  amenities: { ramp: null, toilet: null, elevator: null, carPark: null, rest: null },
  entranceVerified: wheelchair != null,
  evidence: [{
    id: `ev-${id}`,
    source: 'osm',
    sourceId: id,
    sourceUrl: null,
    status: wheelchair ? 'mapped' : 'estimated',
    description: wheelchair ? `wheelchair=${wheelchair}` : 'brak tagu',
    updatedAt: '2024-01-01T00:00:00.000Z',
    fetchedAt: '2024-06-01T00:00:00.000Z',
    observedAt: null,
    isStale: false,
  }],
});

describe('exploreAround – komfortowa sieć', () => {
  it('oznacza schody jako excluded przy wózku i zwraca sugestie miejsc', () => {
    const g = tinyGraph();
    const prefs = preferencesForActivity('wheelchair');
    const originPt = pt(0, 0);
    const places = [place('rynek', originPt.lon + 0.0001, originPt.lat, 'yes'), place('schody-poi', pt(150, 0).lon, pt(150, 0).lat, 'no')];
    const res = exploreAround(g, BarrierLayer.empty(), { origin: { longitude: originPt.lon, latitude: originPt.lat }, preferences: prefs, radiusM: 500 }, places, []);
    assert.ok(res.comfortEdges.length > 0);
    const stairs = res.comfortEdges.find((e) => e.id === 'bc:0');
    assert.ok(stairs);
    assert.equal(stairs!.status, 'excluded');
    assert.ok(res.suggestions.length >= 1);
    assert.equal(res.suggestions[0]!.place.id, 'rynek');
    assert.match(res.disclaimer, /wózka|dostępności/i);
  });

  it('dla roweru faworyzuje zoo/park względem bliskiego muzeum', () => {
    const g = tinyGraph();
    const prefs = preferencesForActivity('bike');
    const originPt = pt(0, 0);
    const museum: Place = {
      ...place('muzeum', originPt.lon + 0.0002, originPt.lat, null),
      category: 'tourism=museum',
      name: 'Muzeum',
      distanceM: 80,
    };
    const zoo: Place = {
      ...place('zoo', originPt.lon + 0.05, originPt.lat + 0.02, null),
      category: 'tourism=zoo',
      name: 'Zoo',
      distanceM: 6_500,
    };
    const res = exploreAround(
      g,
      BarrierLayer.empty(),
      { origin: { longitude: originPt.lon, latitude: originPt.lat }, preferences: prefs, radiusM: 20_000 },
      [museum, zoo],
      [],
    );
    assert.ok(res.suggestions.length >= 1);
    assert.equal(res.suggestions[0]!.place.id, 'zoo');
  });
});

describe('exploreAround – nawierzchnia', () => {
  it('dla rolek wyklucza nierówną nawierzchnię (sett) gdy avoidRoughSurface', () => {
    const g = tinyGraph();
    const prefs = preferencesForActivity('skates');
    const originPt = pt(0, 0);
    const res = exploreAround(g, BarrierLayer.empty(), { origin: { longitude: originPt.lon, latitude: originPt.lat }, preferences: prefs, radiusM: 500 }, [], []);
    const sett = res.comfortEdges.find((e) => e.id === 'bd:0');
    assert.ok(sett);
    assert.equal(sett!.status, 'excluded');
    const smooth = res.comfortEdges.find((e) => e.id === 'ab:0');
    assert.ok(smooth);
    assert.equal(smooth!.status, 'ok');
  });
});
