import type { Barrier } from '@pewnyszlak/domain';
import { Graph, type EdgeRecord, type NodeRecord } from '../../src/graph/graph.ts';

export type N = { id: number; lon: number; lat: number; tags?: Record<string, string> };
export type E = { id?: string; from: number; to: number; tags: Record<string, string>; name?: string; via?: [number, number][]; timestamp?: string };

/** Mały graf testowy w okolicy Krakowa; współrzędne podane w metrach względem punktu bazowego. */
export function makeGraph(nodes: N[], edges: E[], bounds: [number, number, number, number] = [19.9, 50.0, 20.0, 50.1]): Graph {
  const nodeRecords: NodeRecord[] = nodes.map((n) => ({ id: n.id, lon: n.lon, lat: n.lat, tags: n.tags ?? null, osmTimestamp: '2025-01-01T00:00:00.000Z' }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edgeRecords: EdgeRecord[] = edges.map((e, i) => {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const coords: [number, number][] = [[a.lon, a.lat], ...(e.via ?? []), [b.lon, b.lat]];
    let len = 0;
    for (let k = 1; k < coords.length; k++) len += dist(coords[k - 1]!, coords[k]!);
    return { id: e.id ?? `${1000 + i}:0`, wayId: 1000 + i, fromNode: e.from, toNode: e.to, name: e.name ?? null, lengthM: len, tags: e.tags, osmTimestamp: e.timestamp ?? '2025-01-01T00:00:00.000Z', osmVersion: 1, coords };
  });
  return new Graph({ version: 'test', createdAt: '2026-01-01T00:00:00.000Z', dataTimestamp: null, coverage: 'test', bounds }, nodeRecords, edgeRecords);
}

export function dist(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const p1 = (a[1] * Math.PI) / 180, p2 = (b[1] * Math.PI) / 180;
  const dphi = p2 - p1, dl = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Punkt przesunięty o dx, dy metrów od bazy (19.95, 50.05). */
export function pt(dxM: number, dyM: number): { lon: number; lat: number } {
  const lat0 = 50.05, lon0 = 19.95;
  return { lon: lon0 + dxM / (111_320 * Math.cos((lat0 * Math.PI) / 180)), lat: lat0 + dyM / 110_540 };
}

export function barrier(partial: Partial<Barrier> & Pick<Barrier, 'id' | 'edgeIds'>): Barrier {
  return {
    type: 'construction', title: partial.title ?? 'Test', description: '', coordinate: null, nodeIds: [], state: 'active', blocksRouting: true, validFrom: null, validUntil: null,
    evidence: [], confirmationCount: 0, rejectionCount: 0, resolvedCount: 0, isDemo: false, originSource: 'community', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}
