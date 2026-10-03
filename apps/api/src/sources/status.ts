import type { DataMode, Source, SourceStatus, SourcesResponse } from '@pewnyszlak/domain';
import type { Db } from '../db.ts';
import type { ActiveVersion } from '../graph/load.ts';

export const SOURCE_META: Record<Exclude<Source, 'demo' | 'operator'>, { name: string; frequency: string; licence: string; staleAfterHours: number }> = {
  osm: { name: 'OpenStreetMap (Geofabrik, Małopolskie)', frequency: 'co tydzień (import wersjonowany)', licence: 'ODbL 1.0 © autorzy OpenStreetMap', staleAfterHours: 24 * 10 },
  community: { name: 'Zgłoszenia użytkowników aplikacji', frequency: 'na bieżąco', licence: 'Dane zgłoszeń – własne, anonimowe', staleAfterHours: Infinity },
  'z-dykty': { name: 'z-dykty.pl – MCP dane gmin (BZP/eZamówienia)', frequency: 'codziennie', licence: 'CC BY 4.0 (z-dykty.pl); dane źródłowe: BZP', staleAfterHours: 48 },
  nfz: { name: 'NFZ – Informator o Terminach Leczenia (API ITL)', frequency: 'codziennie', licence: 'Dane publiczne NFZ (api.nfz.gov.pl)', staleAfterHours: 48 },
  psoz: { name: 'psoz.pl – MCP ochrona zdrowia', frequency: 'codziennie', licence: 'Dane publiczne agregowane przez psoz.pl', staleAfterHours: 72 },
};

export async function sourcesStatus(db: Db, version: ActiveVersion | null, mode: DataMode, counts: { edges: number }): Promise<SourcesResponse> {
  const runs = await db.query(
    `select distinct on (source) source, started_at, finished_at, ok, message, record_count from source_runs order by source, started_at desc`,
  );
  const lastOk = await db.query(`select source, max(finished_at) as last_ok from source_runs where ok group by source`);
  const lastOkBySource = new Map<string, string>(lastOk.rows.map((r) => [r.source, r.last_ok]));
  const counters = await db.query(`
    select 'community' as source, count(*)::int as n from barriers where origin_source = 'community' and not is_demo
    union all select 'z-dykty', count(*)::int from tender_signals
    union all select 'nfz', count(*)::int from facilities
    union all select 'psoz', count(*)::int from facilities where psoz_url is not null`);
  const countBySource = new Map<string, number>(counters.rows.map((r) => [r.source, r.n]));
  const now = Date.now();
  const sources: SourceStatus[] = [];
  for (const [key, meta] of Object.entries(SOURCE_META) as [keyof typeof SOURCE_META, (typeof SOURCE_META)[keyof typeof SOURCE_META]][]) {
    const run = runs.rows.find((r) => r.source === key);
    const lastSuccess = key === 'osm' ? version?.createdAt ?? null : lastOkBySource.get(key) ?? null;
    let state: SourceStatus['state'] = 'never';
    let message = 'Źródło nie było jeszcze synchronizowane.';
    if (key === 'community') { state = 'available'; message = 'Zgłoszenia zapisywane są bezpośrednio w bazie.'; }
    else if (lastSuccess) {
      const ageH = (now - Date.parse(lastSuccess)) / 3_600_000;
      if (run && run.ok === false && Date.parse(run.started_at) > Date.parse(lastSuccess)) { state = 'unavailable'; message = `Ostatnia próba nieudana: ${run.message ?? 'błąd'}. Używamy danych z ${new Date(lastSuccess).toLocaleString('pl-PL')}.`; }
      else if (ageH > meta.staleAfterHours) { state = 'stale'; message = `Dane starsze niż ${Math.round(meta.staleAfterHours / 24)} dni.`; }
      else { state = 'available'; message = run?.message ?? 'OK'; }
    } else if (run && run.ok === false) { state = 'unavailable'; message = `Źródło niedostępne: ${run.message ?? 'błąd'}.`; }
    if (mode === 'demo' && key === 'psoz') { state = 'unavailable'; message = 'DEMO: symulowana awaria źródła – aplikacja działa na ostatnich zapisanych danych.'; }
    sources.push({
      source: key, name: meta.name, state, lastAttemptAt: run?.started_at ?? (key === 'osm' ? version?.createdAt ?? null : null), lastSuccessAt: lastSuccess,
      message, recordCount: key === 'osm' ? counts.edges : countBySource.get(key) ?? 0, updateFrequency: meta.frequency, licence: meta.licence,
    });
  }
  if (mode === 'demo') {
    const demo = await db.query(`select count(*)::int as n from barriers where is_demo`);
    sources.push({ source: 'demo', name: 'Zestaw demonstracyjny (oznaczony)', state: 'available', lastAttemptAt: null, lastSuccessAt: null, message: 'Dane demonstracyjne nie zastępują danych rzeczywistych – są wyraźnie oznaczone.', recordCount: demo.rows[0].n, updateFrequency: 'ręcznie (npm run demo:seed)', licence: 'własne' });
  }
  return {
    mode,
    graphVersion: version?.id ?? null,
    graphDataTimestamp: version?.dataTimestamp ?? null,
    coverage: version?.coverage ?? 'brak grafu',
    edgeCount: counts.edges,
    sources,
  };
}

export async function recordRun(db: Db, source: Source, fn: () => Promise<{ count: number; message: string }>): Promise<{ ok: boolean; message: string; count: number }> {
  const started = await db.query(`insert into source_runs (source) values ($1) returning id`, [source]);
  const id = started.rows[0].id;
  try {
    const r = await fn();
    await db.query(`update source_runs set finished_at = now(), ok = true, message = $2, record_count = $3 where id = $1`, [id, r.message, r.count]);
    return { ok: true, ...r };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.query(`update source_runs set finished_at = now(), ok = false, message = $2 where id = $1`, [id, message.slice(0, 500)]);
    return { ok: false, message, count: 0 };
  }
}
