import { createHash } from 'node:crypto';
import type { Barrier, BarrierType, Evidence, EvidenceStatus, Source } from '@pewnyszlak/domain';
import { config } from '../config.ts';
import type { Db } from '../db.ts';
import { BarrierLayer } from './layer.ts';

export function installationHash(installationId: string): string {
  return createHash('sha256').update(`pewnyszlak:${installationId}`).digest('hex').slice(0, 32);
}

type BarrierRow = {
  id: string; type: BarrierType; title: string; description: string; lon: number | null; lat: number | null;
  edge_ids: string[]; node_ids: number[]; state: Barrier['state']; blocks_routing: boolean; valid_from: string | null; valid_until: string | null;
  is_demo: boolean; origin_source: Source; created_at: string; updated_at: string; meta: Record<string, unknown>;
  confirmations: number; rejections: number; resolved: number; evidence: EvidenceRow[] | null;
};
type EvidenceRow = { id: string; source: Source; source_id: string; source_url: string | null; status: EvidenceStatus; description: string | null; updated_at: string | null; observed_at: string | null; fetched_at: string };

const STALE_SIGNAL_DAYS = 120;

function toEvidence(e: EvidenceRow): Evidence {
  const ref = e.observed_at ?? e.updated_at ?? e.fetched_at;
  const ageDays = (Date.now() - Date.parse(ref)) / 86_400_000;
  const stale = e.status === 'signal' || e.status === 'reported' ? ageDays > STALE_SIGNAL_DAYS : ageDays > config.staleAfterMonths * 30.44;
  return {
    id: e.id, source: e.source, sourceId: e.source_id, sourceUrl: e.source_url, status: e.status,
    description: e.description ?? undefined, updatedAt: e.updated_at, observedAt: e.observed_at, fetchedAt: e.fetched_at, isStale: stale,
  };
}

export function rowToBarrier(r: BarrierRow): Barrier {
  const evidence = (r.evidence ?? []).map(toEvidence);
  const statuses = new Set(evidence.map((e) => e.status));
  // Sprzeczne obserwacje zachowujemy; oznaczamy je zbiorczo.
  const conflicting = (r.rejections > 0 && r.confirmations > 0) || r.state === 'disputed' || (statuses.has('mapped') && statuses.has('reported') && r.type === 'kerb');
  if (conflicting && !statuses.has('conflicting')) {
    evidence.unshift({ id: `${r.id}-conflict`, source: 'community', sourceId: r.id, sourceUrl: null, status: 'conflicting', updatedAt: r.updated_at, observedAt: null, fetchedAt: r.updated_at, isStale: false, description: `Potwierdzeń: ${r.confirmations}, zaprzeczeń: ${r.rejections}.` });
  }
  return {
    id: r.id, type: r.type, title: r.title, description: r.description,
    coordinate: r.lon !== null && r.lat !== null ? { longitude: r.lon, latitude: r.lat } : null,
    edgeIds: r.edge_ids ?? [], nodeIds: (r.node_ids ?? []).map(String), state: r.state, blocksRouting: r.blocks_routing,
    validFrom: r.valid_from, validUntil: r.valid_until, evidence, confirmationCount: r.confirmations, rejectionCount: r.rejections, resolvedCount: r.resolved,
    isDemo: r.is_demo, originSource: r.origin_source, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const SELECT = `
  select b.*, 
    coalesce((select count(*) from barrier_feedback f where f.barrier_id = b.id and f.action = 'confirm'), 0)::int as confirmations,
    coalesce((select count(*) from barrier_feedback f where f.barrier_id = b.id and f.action = 'reject'), 0)::int as rejections,
    coalesce((select count(*) from barrier_feedback f where f.barrier_id = b.id and f.action = 'resolved'), 0)::int as resolved,
    (select json_agg(json_build_object('id', e.id, 'source', e.source, 'source_id', e.source_id, 'source_url', e.source_url, 'status', e.status, 'description', e.description,
        'updated_at', e.updated_at, 'observed_at', e.observed_at, 'fetched_at', e.fetched_at) order by e.fetched_at)
      from barrier_evidence e where e.barrier_id = b.id) as evidence
  from barriers b`;

export class BarrierRepo {
  constructor(private readonly db: Db) {}

  async all(): Promise<Barrier[]> {
    const r = await this.db.query(`${SELECT} order by b.created_at desc`);
    return r.rows.map(rowToBarrier);
  }

  async loadLayer(): Promise<BarrierLayer> {
    const barriers = await this.all();
    const v = await this.db.query('select coalesce(max(updated_at), now()) as v, count(*)::int as n from barriers');
    return new BarrierLayer(barriers, `${v.rows[0].v}#${v.rows[0].n}`);
  }

  async byId(id: string): Promise<Barrier | null> {
    const r = await this.db.query(`${SELECT} where b.id = $1`, [id]);
    return r.rows[0] ? rowToBarrier(r.rows[0]) : null;
  }

  async inBbox(minLon: number, minLat: number, maxLon: number, maxLat: number, includeDemo: boolean, includeResolved = false): Promise<Barrier[]> {
    const r = await this.db.query(
      `${SELECT} where b.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326) and ($5 or not b.is_demo) and ($6 or b.state <> 'resolved') order by b.updated_at desc limit 500`,
      [minLon, minLat, maxLon, maxLat, includeDemo, includeResolved],
    );
    return r.rows.map(rowToBarrier);
  }

  async near(lon: number, lat: number, radiusM: number, includeDemo: boolean): Promise<Barrier[]> {
    const r = await this.db.query(
      `${SELECT} where ST_DWithin(b.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3) and ($4 or not b.is_demo) and b.state <> 'resolved' order by b.geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326) limit 50`,
      [lon, lat, radiusM, includeDemo],
    );
    return r.rows.map(rowToBarrier);
  }

  async createReport(input: { type: BarrierType; title: string; description: string; lon: number; lat: number; edgeIds: string[]; nodeIds?: number[]; installationId: string; isDemo?: boolean; blocksRouting?: boolean }): Promise<Barrier> {
    const hash = installationHash(input.installationId);
    const blocks = input.blocksRouting ?? ['steps', 'construction', 'elevator', 'kerb', 'narrow', 'obstacle'].includes(input.type);
    const client = await this.db.connect();
    try {
      await client.query('begin');
      const b = await client.query(
        `insert into barriers (type, title, description, lon, lat, geom, edge_ids, node_ids, state, blocks_routing, is_demo, origin_source, meta)
         values ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, 'active', $8, $9, 'community', $10) returning id`,
        [input.type, input.title, input.description, input.lon, input.lat, input.edgeIds, input.nodeIds ?? [], blocks, input.isDemo ?? false, JSON.stringify({ reporter: hash })],
      );
      const id = b.rows[0].id as string;
      await client.query(
        `insert into barrier_evidence (barrier_id, source, source_id, source_url, status, description, observed_at, fetched_at, installation_hash)
         values ($1, 'community', $2, null, 'reported', $3, now(), now(), $4)`,
        [id, `report/${id}`, `Zgłoszenie użytkownika aplikacji: ${input.title}`, hash],
      );
      await client.query('commit');
      return (await this.byId(id))!;
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }

  async countRecentReports(installationId: string, hours = 1): Promise<number> {
    const r = await this.db.query(`select count(*)::int as n from barrier_evidence where installation_hash = $1 and fetched_at > now() - ($2 || ' hours')::interval`, [installationHash(installationId), String(hours)]);
    return r.rows[0].n;
  }

  /** Potwierdzenie / zakwestionowanie / zgłoszenie usunięcia. Anonimowe głosy zmieniają stan tylko zbiorczo i nigdy nie dają statusu 'verified'. */
  async feedback(id: string, installationId: string, action: 'confirm' | 'reject' | 'resolved', comment?: string): Promise<Barrier | null> {
    const existing = await this.byId(id);
    if (!existing) return null;
    const hash = installationHash(installationId);
    const client = await this.db.connect();
    try {
      await client.query('begin');
      await client.query(`delete from barrier_feedback where barrier_id = $1 and installation_hash = $2`, [id, hash]);
      await client.query(`insert into barrier_feedback (barrier_id, installation_hash, action) values ($1, $2, $3)`, [id, hash, action]);
      await client.query(
        `insert into barrier_evidence (barrier_id, source, source_id, status, description, observed_at, installation_hash)
         values ($1, 'community', $2, 'reported', $3, now(), $4)`,
        [id, `feedback/${id}/${hash.slice(0, 8)}`, (action === 'confirm' ? 'Potwierdzenie przez użytkownika' : action === 'reject' ? 'Zakwestionowanie przez użytkownika' : 'Użytkownik zgłasza, że przeszkoda zniknęła') + (comment ? `: ${comment}` : ''), hash],
      );
      const counts = await client.query(
        `select
           count(*) filter (where action = 'confirm')::int as c,
           count(*) filter (where action = 'reject')::int as r,
           count(*) filter (where action = 'resolved')::int as d
         from barrier_feedback where barrier_id = $1`, [id]);
      const { c, r, d } = counts.rows[0];
      let newState = existing.state;
      let blocks = existing.blocksRouting;
      const verified = existing.evidence.some((e) => e.status === 'verified');
      if (!verified) {
        if (d >= 2 && d > c) { newState = 'resolved'; blocks = false; }
        else if (r >= 2 && r > c) { newState = 'disputed'; blocks = false; }
        else if (existing.state === 'disputed' && c > r) { newState = 'active'; blocks = existing.originSource === 'community'; }
        else if (existing.state === 'potential' && c >= 3 && c > r) {
          // Trzy niezależne potwierdzenia sygnału z przetargu → traktujemy jak zgłoszoną barierę aktywną (nadal niezweryfikowaną formalnie).
          newState = 'active'; blocks = true;
        }
      }
      await client.query(`update barriers set state = $2, blocks_routing = $3, updated_at = now() where id = $1`, [id, newState, blocks]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    return this.byId(id);
  }

  /** Korekta operatora: formalna weryfikacja, zmiana stanu, lokalizacji, czasu obowiązywania. */
  async operatorUpdate(id: string, actor: string, patch: { state?: Barrier['state']; blocksRouting?: boolean; edgeIds?: string[]; nodeIds?: number[]; validUntil?: string | null; note?: string; verify?: boolean }): Promise<Barrier | null> {
    const existing = await this.byId(id);
    if (!existing) return null;
    const client = await this.db.connect();
    try {
      await client.query('begin');
      await client.query(
        `update barriers set state = coalesce($2, state), blocks_routing = coalesce($3, blocks_routing), edge_ids = coalesce($4, edge_ids), node_ids = coalesce($5, node_ids), valid_until = case when $6::text = '__keep__' then valid_until else $6::timestamptz end, updated_at = now() where id = $1`,
        [id, patch.state ?? null, patch.blocksRouting ?? null, patch.edgeIds ?? null, patch.nodeIds ?? null, patch.validUntil === undefined ? '__keep__' : patch.validUntil],
      );
      await client.query(
        `insert into barrier_evidence (barrier_id, source, source_id, status, description, observed_at) values ($1, 'operator', $2, $3, $4, now())`,
        [id, `operator/${actor}/${Date.now()}`, patch.verify ? 'verified' : 'mapped', patch.note ?? (patch.verify ? 'Weryfikacja operatora' : 'Korekta operatora')],
      );
      await client.query(`insert into operator_log (actor, action, target, payload) values ($1, 'barrier.update', $2, $3)`, [actor, id, JSON.stringify(patch)]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    return this.byId(id);
  }

  async deleteBarrier(id: string, actor: string): Promise<boolean> {
    const r = await this.db.query('delete from barriers where id = $1', [id]);
    await this.db.query(`insert into operator_log (actor, action, target) values ($1, 'barrier.delete', $2)`, [actor, id]);
    return (r.rowCount ?? 0) > 0;
  }

  /** Upsert bariery pochodzącej ze źródła zewnętrznego (sygnał przetargowy, dane demo). */
  async upsertExternal(input: {
    originSource: Source; originSourceId: string; type: BarrierType; title: string; description: string; lon: number | null; lat: number | null;
    edgeIds: string[]; nodeIds?: number[]; state: Barrier['state']; blocksRouting: boolean; validFrom?: string | null; validUntil?: string | null; isDemo?: boolean; meta?: Record<string, unknown>;
    evidence: { source: Source; sourceId: string; sourceUrl: string | null; status: EvidenceStatus; description: string; updatedAt: string | null; observedAt: string | null; fetchedAt?: string }[];
  }): Promise<string> {
    const client = await this.db.connect();
    try {
      await client.query('begin');
      const r = await client.query(
        `insert into barriers (type, title, description, lon, lat, geom, edge_ids, node_ids, state, blocks_routing, valid_from, valid_until, is_demo, origin_source, origin_source_id, meta)
         values ($1, $2, $3, $4, $5, case when $4::float8 is null then null else ST_SetSRID(ST_MakePoint($4, $5), 4326) end, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         on conflict (origin_source, origin_source_id) where origin_source_id is not null do update set
           title = excluded.title, description = excluded.description,
           lon = coalesce(barriers.lon, excluded.lon), lat = coalesce(barriers.lat, excluded.lat), geom = coalesce(barriers.geom, excluded.geom),
           edge_ids = case when cardinality(barriers.edge_ids) > 0 then barriers.edge_ids else excluded.edge_ids end,
           valid_until = coalesce(excluded.valid_until, barriers.valid_until), meta = barriers.meta || excluded.meta, updated_at = now()
         returning id`,
        [input.type, input.title, input.description, input.lon, input.lat, input.edgeIds, input.nodeIds ?? [], input.state, input.blocksRouting, input.validFrom ?? null, input.validUntil ?? null, input.isDemo ?? false, input.originSource, input.originSourceId, JSON.stringify(input.meta ?? {})],
      );
      const id = r.rows[0].id as string;
      for (const e of input.evidence) {
        await client.query(
          `insert into barrier_evidence (barrier_id, source, source_id, source_url, status, description, updated_at, observed_at, fetched_at)
           select $1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now())
           where not exists (select 1 from barrier_evidence where barrier_id = $1 and source = $2 and source_id = $3)`,
          [id, e.source, e.sourceId, e.sourceUrl, e.status, e.description, e.updatedAt, e.observedAt, e.fetchedAt ?? null],
        );
      }
      await client.query('commit');
      return id;
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteDemo(): Promise<number> {
    const r = await this.db.query('delete from barriers where is_demo');
    return r.rowCount ?? 0;
  }
}
