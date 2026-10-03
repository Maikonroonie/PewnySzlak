import type { Barrier, DataMode } from '@pewnyszlak/domain';

/** Warstwa barier niezależna od grafu – odwołuje się do stabilnych identyfikatorów OSM (krawędzie way:seg, węzły). */
export class BarrierLayer {
  readonly version: string;
  readonly byEdge = new Map<string, Barrier[]>();
  readonly byNode = new Map<number, Barrier[]>();
  readonly all: Barrier[];

  constructor(barriers: Barrier[], version = new Date().toISOString()) {
    this.version = version;
    this.all = barriers;
    for (const b of barriers) {
      for (const e of b.edgeIds) {
        const list = this.byEdge.get(e);
        if (list) list.push(b); else this.byEdge.set(e, [b]);
      }
      for (const n of b.nodeIds) {
        const id = Number(n);
        const list = this.byNode.get(id);
        if (list) list.push(b); else this.byNode.set(id, [b]);
      }
    }
  }

  static empty(): BarrierLayer { return new BarrierLayer([], 'empty'); }

  forMode(mode: DataMode): BarrierLayer {
    if (mode === 'demo') return this;
    return new BarrierLayer(this.all.filter((b) => !b.isDemo), this.version);
  }
}

/** Czy bariera obowiązuje w danym momencie (okno czasowe). */
export function barrierIsCurrent(b: Barrier, now = Date.now()): boolean {
  if (b.state === 'resolved') return false;
  if (b.validFrom && Date.parse(b.validFrom) > now) return false;
  if (b.validUntil && Date.parse(b.validUntil) < now) return false;
  return true;
}
