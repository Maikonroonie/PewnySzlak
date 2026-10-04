import { edgeAttrs, nodeAttrs, type EdgeAttrs, type NodeAttrs, type Tags } from './accessibility.ts';
import { haversineM, pointToPolylineM } from './geo.ts';

export type NodeRecord = { id: number; lon: number; lat: number; tags: Tags | null; osmTimestamp: string | null };
export type EdgeRecord = {
  id: string;
  wayId: number;
  fromNode: number;
  toNode: number;
  name: string | null;
  lengthM: number;
  tags: Tags;
  osmTimestamp: string | null;
  osmVersion: number | null;
  /** [lon, lat][] */
  coords: [number, number][];
};

export type GraphMeta = {
  version: string;
  createdAt: string;
  dataTimestamp: string | null;
  coverage: string;
  bounds: [number, number, number, number];
};

export type Edge = EdgeRecord & { idx: number; from: number; to: number; attrs: EdgeAttrs };

const CELL = 0.0025;

export class Graph {
  readonly meta: GraphMeta;
  readonly nodeCount: number;
  readonly nodeIds: Float64Array;
  readonly lon: Float64Array;
  readonly lat: Float64Array;
  readonly nodeIndex = new Map<number, number>();
  readonly nodeTags = new Map<number, Tags>();
  readonly nodeAttrs = new Map<number, NodeAttrs>();
  readonly nodeTimestamps = new Map<number, string>();
  readonly edges: Edge[];
  readonly edgeById = new Map<string, number>();
  readonly offsets: Int32Array;
  readonly adjEdge: Int32Array;
  readonly adjNode: Int32Array;
  private readonly grid = new Map<string, number[]>();

  constructor(meta: GraphMeta, nodes: NodeRecord[], edges: EdgeRecord[]) {
    this.meta = meta;
    this.nodeCount = nodes.length;
    this.nodeIds = new Float64Array(nodes.length);
    this.lon = new Float64Array(nodes.length);
    this.lat = new Float64Array(nodes.length);
    nodes.forEach((n, i) => {
      this.nodeIds[i] = n.id;
      this.lon[i] = n.lon;
      this.lat[i] = n.lat;
      this.nodeIndex.set(n.id, i);
      if (n.tags && Object.keys(n.tags).length > 0) {
        this.nodeTags.set(i, n.tags);
        this.nodeAttrs.set(i, nodeAttrs(n.tags));
      }
      if (n.osmTimestamp) this.nodeTimestamps.set(i, n.osmTimestamp);
    });
    const degree = new Int32Array(nodes.length);
    const built: Edge[] = [];
    for (const e of edges) {
      const from = this.nodeIndex.get(e.fromNode);
      const to = this.nodeIndex.get(e.toNode);
      if (from === undefined || to === undefined) continue;
      const idx = built.length;
      built.push({ ...e, idx, from, to, attrs: edgeAttrs(e.tags) });
      this.edgeById.set(e.id, idx);
      degree[from]!++;
      degree[to]!++;
    }
    this.edges = built;
    this.offsets = new Int32Array(nodes.length + 1);
    for (let i = 0; i < nodes.length; i++) this.offsets[i + 1] = this.offsets[i]! + degree[i]!;
    this.adjEdge = new Int32Array(this.offsets[nodes.length]!);
    this.adjNode = new Int32Array(this.offsets[nodes.length]!);
    const fill = new Int32Array(nodes.length);
    for (const e of built) {
      const a = this.offsets[e.from]! + fill[e.from]!++;
      this.adjEdge[a] = e.idx;
      this.adjNode[a] = e.to;
      const b = this.offsets[e.to]! + fill[e.to]!++;
      this.adjEdge[b] = e.idx;
      this.adjNode[b] = e.from;
      this.indexEdge(e);
    }
  }

  private indexEdge(e: Edge) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of e.coords) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cy = Math.floor(minY / CELL); cy <= Math.floor(maxY / CELL); cy++) {
        const key = `${cx}:${cy}`;
        const bucket = this.grid.get(key);
        if (bucket) bucket.push(e.idx); else this.grid.set(key, [e.idx]);
      }
    }
  }

  nodeId(idx: number): number { return this.nodeIds[idx]!; }
  nodeCoord(idx: number): [number, number] { return [this.lon[idx]!, this.lat[idx]!]; }

  edge(id: string): Edge | undefined {
    const idx = this.edgeById.get(id);
    return idx === undefined ? undefined : this.edges[idx];
  }

  /** Krawędzie w komórkach siatki wokół punktu (promień w komórkach). */
  edgesNear(lon: number, lat: number, ring: number): number[] {
    const cx = Math.floor(lon / CELL);
    const cy = Math.floor(lat / CELL);
    const out: number[] = [];
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const bucket = this.grid.get(`${cx + dx}:${cy + dy}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  /** Najbliższa krawędź spełniająca predykat – przeszukuje pierścienie siatki aż do maxDistanceM. */
  snap(lon: number, lat: number, accept: (edge: Edge) => boolean, maxDistanceM = 400): { edge: Edge; distanceM: number; point: [number, number]; alongM: number } | null {
    const all = this.snapMany(lon, lat, accept, maxDistanceM, 1);
    return all[0] ?? null;
  }

  /** Najbliższe krawędzie (rosnąco po dystansie) – do wyboru snapu połączonego z trasą (parki / staw). */
  snapMany(lon: number, lat: number, accept: (edge: Edge) => boolean, maxDistanceM = 400, limit = 8): { edge: Edge; distanceM: number; point: [number, number]; alongM: number }[] {
    const hits: { edge: Edge; distanceM: number; point: [number, number]; alongM: number }[] = [];
    const seen = new Set<number>();
    const maxRing = Math.ceil(maxDistanceM / (CELL * 111_000)) + 1;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (const idx of this.edgesNear(lon, lat, ring)) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        const edge = this.edges[idx]!;
        if (!accept(edge)) continue;
        const hit = pointToPolylineM(lon, lat, edge.coords);
        if (hit.distanceM > maxDistanceM) continue;
        hits.push({ edge, distanceM: hit.distanceM, point: hit.point, alongM: hit.alongM });
      }
      if (hits.length >= limit * 3 && hits.some((h) => h.distanceM < (ring - 1) * CELL * 111_000 * 0.7)) break;
    }
    hits.sort((a, b) => a.distanceM - b.distanceM);
    return hits.slice(0, limit);
  }

  edgesInBbox(minLon: number, minLat: number, maxLon: number, maxLat: number): Edge[] {
    const out = new Set<number>();
    for (let cx = Math.floor(minLon / CELL); cx <= Math.floor(maxLon / CELL); cx++) {
      for (let cy = Math.floor(minLat / CELL); cy <= Math.floor(maxLat / CELL); cy++) {
        const bucket = this.grid.get(`${cx}:${cy}`);
        if (bucket) for (const i of bucket) out.add(i);
      }
    }
    return [...out].map((i) => this.edges[i]!);
  }

  distanceBetweenNodes(a: number, b: number): number {
    return haversineM(this.lon[a]!, this.lat[a]!, this.lon[b]!, this.lat[b]!);
  }
}
