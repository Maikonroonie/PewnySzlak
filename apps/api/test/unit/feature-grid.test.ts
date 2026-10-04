import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTerrainChecked, placeFeatureGrid, segmentFeatureGrid, type Place } from '@pewnyszlak/domain';
import { mergeVerifiedPlaces, VERIFIED_PLACE_SEEDS, verifiedPlacesNear } from '../../src/demo/verified-places.ts';

const basePlace = (over: Partial<Place> = {}): Place => ({
  id: 'n1',
  kind: 'place',
  name: 'Test',
  category: 'tourism=attraction',
  address: null,
  coordinate: { longitude: 19.9373, latitude: 50.0617 },
  accessibility: {},
  amenities: { ramp: null, toilet: null, elevator: null, carPark: null, rest: null },
  evidence: [],
  entranceVerified: false,
  ...over,
});

describe('placeFeatureGrid / segmentFeatureGrid', () => {
  it('zwraca 8 komórek PDF', () => {
    const grid = placeFeatureGrid(basePlace({
      accessibility: { steps: true, kerbHeightCm: 6, widthCm: 100, surface: 'asphalt', smoothness: null, incline: null, wheelchair: 'limited' },
      amenities: { ramp: true, toilet: false, elevator: null, carPark: null, rest: true },
    }));
    assert.equal(grid.length, 8);
    assert.equal(grid.find((c) => c.key === 'steps')!.value, 'yes');
    assert.equal(grid.find((c) => c.key === 'kerb')!.value, 'yes');
    assert.equal(grid.find((c) => c.key === 'ramp')!.value, 'yes');
    assert.equal(grid.find((c) => c.key === 'toilet')!.value, 'no');
    assert.equal(grid.find((c) => c.key === 'rest')!.value, 'yes');
    assert.equal(grid.find((c) => c.key === 'elevator')!.value, 'unknown');
  });

  it('segmentFeatureGrid mapuje extras', () => {
    const g = segmentFeatureGrid({ steps: false, surface: 'sett', widthCm: 80, kerbHeightCm: null, incline: null, smoothness: null, wheelchair: null }, { ramp: true, elevator: false });
    assert.equal(g.find((c) => c.key === 'steps')!.value, 'no');
    assert.equal(g.find((c) => c.key === 'surface')!.value, 'no');
    assert.equal(g.find((c) => c.key === 'width')!.value, 'no');
    assert.equal(g.find((c) => c.key === 'ramp')!.value, 'yes');
  });
});

describe('verified places overlay', () => {
  it('ma 6–8 seedów wokół Rynku', () => {
    assert.ok(VERIFIED_PLACE_SEEDS.length >= 6 && VERIFIED_PLACE_SEEDS.length <= 10);
    const near = verifiedPlacesNear(19.937, 50.062, 1500);
    assert.ok(near.length >= 5);
    assert.ok(near.every((p) => p.terrainChecked && p.evidence.some((e) => e.status === 'verified' && e.observedAt)));
  });

  it('merge nakłada dane na OSM w promieniu 40 m', () => {
    const osm = basePlace({ id: 'n-suk', name: 'Sukiennice', coordinate: { longitude: 19.9373, latitude: 50.0617 } });
    const merged = mergeVerifiedPlaces([osm], { lon: 19.937, lat: 50.062 }, 2000);
    const hit = merged.find((p) => p.id === 'n-suk');
    assert.ok(hit);
    assert.equal(hit!.terrainChecked, true);
    assert.equal(hit!.amenities?.ramp, true);
    assert.ok(isTerrainChecked(hit!));
    assert.ok(merged.some((p) => p.id.startsWith('verified-')));
  });
});
