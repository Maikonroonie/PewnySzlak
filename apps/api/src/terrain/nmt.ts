import type { Coordinate, TerrainProfileResult } from '@pewnyszlak/domain';
import { haversineM } from '../graph/geo.ts';

export const NMT_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel';
export type Grid = { cols: number; rows: number; x: number; y: number; dx: number; dy: number; values: Float32Array; nodata: number };
/** Arc/Info ASCII can use cellsize OR unequal dx/dy, and does not always declare NoData. */
export function parseGrid(text: string): Grid {
  const lines = text.trim().split(/\r?\n/), meta: Record<string, number> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const match = lines[i]!.trim().match(/^(ncols|nrows|xllcorner|yllcorner|xllcenter|yllcenter|cellsize|dx|dy|nodata_value)\s+(.+)$/i);
    if (!match) break;
    meta[match[1]!.toLowerCase()] = Number(match[2]);
  }
  const cols = meta.ncols!, rows = meta.nrows!, dx = meta.dx ?? meta.cellsize!, dy = meta.dy ?? meta.cellsize!;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 || cols > 512 || rows > 512 || !(dx > 0) || !(dy > 0)) throw new Error('Nieprawidłowa siatka wysokości NMT.');
  const values = Float32Array.from(lines.slice(i).join(' ').trim().split(/\s+/).map(Number));
  if (values.length !== cols * rows || !Number.isFinite(meta.xllcorner ?? meta.xllcenter) || !Number.isFinite(meta.yllcorner ?? meta.yllcenter)) throw new Error('Niekompletna siatka wysokości NMT.');
  return { cols, rows, dx, dy, x: meta.xllcorner ?? meta.xllcenter! - dx / 2, y: meta.yllcorner ?? meta.yllcenter! - dy / 2, values, nodata: meta.nodata_value ?? -9999 };
}
export function sampleGrid(grid: Grid, c: Coordinate): number | null {
  const x = (c.longitude - grid.x) / grid.dx - 0.5, y = grid.rows - (c.latitude - grid.y) / grid.dy - 0.5;
  if (x < 0 || y < 0 || x > grid.cols - 1 || y > grid.rows - 1) return null;
  const col = Math.floor(x), row = Math.floor(y), tx = x - col, ty = y - row;
  const at = (cx: number, cy: number) => grid.values[Math.min(cy, grid.rows - 1) * grid.cols + Math.min(cx, grid.cols - 1)]!;
  const samples = [at(col, row), at(col + 1, row), at(col, row + 1), at(col + 1, row + 1)];
  if (samples.some(v => !Number.isFinite(v) || v === grid.nodata || v < -100 || v > 3000)) return null;
  const z = samples[0]! * (1 - tx) * (1 - ty) + samples[1]! * tx * (1 - ty) + samples[2]! * (1 - tx) * ty + samples[3]! * tx * ty;
  return Math.round(z * 10) / 10;
}
const cache = new Map<string, { grid: Grid; fetchedAt: string }>();
const pending = new Map<string, Promise<{ grid: Grid; fetchedAt: string }>>();
export async function terrainProfile(points: Coordinate[]): Promise<TerrainProfileResult> {
  const west = Math.floor((Math.min(...points.map(p => p.longitude)) - 0.001) * 1000) / 1000;
  const east = Math.ceil((Math.max(...points.map(p => p.longitude)) + 0.001) * 1000) / 1000;
  const south = Math.floor((Math.min(...points.map(p => p.latitude)) - 0.001) * 1000) / 1000;
  const north = Math.ceil((Math.max(...points.map(p => p.latitude)) + 0.001) * 1000) / 1000;
  const width = Math.max(64, Math.min(512, Math.ceil((east - west) * 71500 / 5)));
  const height = Math.max(64, Math.min(512, Math.ceil((north - south) * 111320 / 5)));
  const key = [west, south, east, north, width, height].join(',');
  let item = cache.get(key);
  if (item && Date.now() - Date.parse(item.fetchedAt) > 86_400_000) { cache.delete(key); item = undefined; }
  if (!item) {
    let work = pending.get(key);
    if (!work) {
      work = (async () => {
        const url = new URL(NMT_URL);
        const params = { SERVICE: 'WCS', VERSION: '1.0.0', REQUEST: 'GetCoverage', COVERAGE: 'DTM_PL-EVRF2007-NH', CRS: 'EPSG:4326', BBOX: [west, south, east, north].join(','), WIDTH: String(width), HEIGHT: String(height), FORMAT: 'AAIGrid' };
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        const response = await fetch(url, { signal: AbortSignal.timeout(14_000), headers: { 'User-Agent': 'PewnySzlak/1.0 (terrain-profile)' } });
        if (!response.ok) throw new Error('Usługa NMT jest niedostępna.');
        const raw = await response.text();
        if (raw.length > 12_000_000) throw new Error('Zbyt duża odpowiedź NMT.');
        const value = { grid: parseGrid(raw), fetchedAt: new Date().toISOString() };
        if (cache.size >= 12) cache.delete(cache.keys().next().value!);
        cache.set(key, value); return value;
      })().finally(() => pending.delete(key));
      pending.set(key, work);
    }
    item = await work;
  }
  let distance = 0;
  return {
    source: 'GUGiK · Numeryczny Model Terenu', sourceUrl: 'https://www.geoportal.gov.pl/pl/dane/numeryczny-model-terenu-nmt/',
    fetchedAt: item.fetchedAt, surveyedAt: null, model: 'DTM_PL-EVRF2007-NH',
    resolutionM: Math.round(Math.max(item.grid.dx * 71500, item.grid.dy * 111320) * 10) / 10,
    warning: 'Profil powierzchni gruntu, nie pomiar chodnika. NMT nie opisuje mostów, krawężników, schodów ani działających wind. Data pomiaru nie jest udostępniona w tej odpowiedzi. Profil nie zmienia oceny dostępności ani przebiegu trasy.',
    points: points.map((p, i) => { if (i > 0) distance += haversineM(points[i - 1]!.longitude, points[i - 1]!.latitude, p.longitude, p.latitude); return { ...p, distanceM: Math.round(distance), elevationM: sampleGrid(item!.grid, p) }; }),
  };
}
