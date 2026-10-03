import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGrid, sampleGrid } from '../../src/terrain/nmt.ts';
import { segmentDifficulty, shortestBearing, previewPosition } from '../../../mobile/src/lib/route-preview.ts';
import { UNKNOWN_ACCESSIBILITY, type RouteSegment, type RouteResult } from '@pewnyszlak/domain';

const grid = 'ncols 2\nnrows 2\nxllcorner 19\nyllcorner 50\ndx 1\ndy 1\nNODATA_value -9999\n200 220\n180 200';
test('NMT respects north-to-south row order and interpolates cell centres', () => {
  const parsed = parseGrid(grid);
  assert.equal(sampleGrid(parsed, { longitude: 19.5, latitude: 51.5 }), 200);
  assert.equal(sampleGrid(parsed, { longitude: 20, latitude: 51 }), 200);
  assert.equal(sampleGrid(parsed, { longitude: 19.5, latitude: 50.5 }), 180);
  assert.equal(sampleGrid(parsed, { longitude: 25, latitude: 50 }), null);
});
test('NMT preserves missing samples instead of inventing a zero elevation', () => {
  assert.equal(sampleGrid(parseGrid(grid.replace('180 200', '-9999 200')), { longitude: 20, latitude: 51 }), null);
  assert.throws(() => parseGrid('<Exception>Service unavailable</Exception>'));
  assert.throws(() => parseGrid(grid.replace('200 220', '200')));
});
test('uncertainty alone does not paint a segment as a physical difficulty', () => {
  const s = { accessibility: UNKNOWN_ACCESSIBILITY, barriers: [], kind: 'footway', uncertain: true } as unknown as RouteSegment;
  assert.deepEqual(segmentDifficulty(s), []);
  assert.deepEqual(segmentDifficulty({ ...s, accessibility: { ...UNKNOWN_ACCESSIBILITY, incline: 5 } }), ['Nachylenie 5%']);
  assert.equal(segmentDifficulty({ ...s, accessibility: { ...UNKNOWN_ACCESSIBILITY, kerbHeightCm: 0 } }).length, 0);
});
test('preview interpolates by distance and takes shortest camera rotation', () => {
  const route = { geometry: { type: 'LineString', coordinates: [[19.9, 50], [19.902, 50]] } } as RouteResult;
  const middle = previewPosition(route, 0.5);
  assert.ok(Math.abs(middle.point.longitude - 19.901) < 0.000001);
  assert.equal(previewPosition(route, 2).point.longitude, 19.902);
  assert.equal(shortestBearing(359, 1), 361);
  assert.equal(shortestBearing(1, 359), -1);
});
