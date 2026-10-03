import { BarrierLayer } from './barriers/layer.ts';
import { BarrierRepo } from './barriers/repo.ts';
import { config } from './config.ts';
import type { Db } from './db.ts';
import type { Graph } from './graph/graph.ts';
import { activeVersion, loadGraph, type ActiveVersion } from './graph/load.ts';
import { FacilityRepo, PlaceRepo } from './places/repo.ts';

export type Logger = { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

export class AppContext {
  graph: Graph | null = null;
  version: ActiveVersion | null = null;
  layer: BarrierLayer = BarrierLayer.empty();
  readonly barriers: BarrierRepo;
  readonly places: PlaceRepo;
  readonly facilities: FacilityRepo;
  private timer: NodeJS.Timeout | null = null;
  private graphTimer: NodeJS.Timeout | null = null;

  constructor(readonly db: Db, readonly log: Logger) {
    this.barriers = new BarrierRepo(db);
    this.places = new PlaceRepo(db);
    this.facilities = new FacilityRepo(db);
  }

  async start(opts: { loadGraph?: boolean } = {}): Promise<void> {
    if (opts.loadGraph !== false) {
      await this.reloadGraph();
    }
    await this.refreshLayer();
    if (!config.isTest) {
      this.timer = setInterval(() => this.refreshLayer().catch((e) => this.log.warn(`barrier refresh failed: ${e}`)), config.barrierRefreshSeconds * 1000);
      this.timer.unref();
      // Nowa wersja grafu (po imporcie) jest wczytywana automatycznie.
      this.graphTimer = setInterval(() => this.checkGraphVersion().catch((e) => this.log.warn(`graph check failed: ${e}`)), 5 * 60 * 1000);
      this.graphTimer.unref();
    }
  }

  async reloadGraph(): Promise<void> {
    const t0 = Date.now();
    const graph = await loadGraph(this.db, (m) => this.log.info(m));
    if (!graph) {
      this.log.warn('Brak aktywnej wersji grafu – routing niedostępny do czasu importu OSM.');
      return;
    }
    this.graph = graph;
    this.version = await activeVersion(this.db);
    this.log.info(`graph ${graph.meta.version} ready: ${graph.nodeCount} nodes, ${graph.edges.length} edges (${Date.now() - t0} ms)`);
  }

  async checkGraphVersion(): Promise<void> {
    const v = await activeVersion(this.db);
    if (v && v.id !== this.version?.id) {
      this.log.info(`new graph version ${v.id} detected – reloading`);
      await this.reloadGraph();
    }
  }

  async refreshLayer(): Promise<void> {
    this.layer = await this.barriers.loadLayer();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.graphTimer) clearInterval(this.graphTimer);
  }
}
