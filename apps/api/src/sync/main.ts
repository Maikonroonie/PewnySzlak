/**
 * Proces synchronizacji danych (oddzielny od API).
 *   npm run sync                       – harmonogram: OSM wg SYNC_OSM_CRON, MCP/NFZ wg SYNC_SOURCES_CRON
 *   npm run sync -- --once             – jednorazowo wszystkie źródła (bez OSM)
 *   npm run sync -- --once --source=zdykty|nfz|psoz|osm
 *   npm run sync -- --once --source=osm --skip-download
 */
import { Cron } from 'croner';
import { config } from '../config.ts';
import { applySchema, createPool, waitForDb } from '../db.ts';
import { recordRun } from '../sources/status.ts';
import { syncNfz, syncPsoz } from './nfz.ts';
import { syncOsm } from './osm.ts';
import { syncZdykty } from './zdykty.ts';

const log = (m: string) => console.log(`[sync ${new Date().toISOString().slice(11, 19)}] ${m}`);

async function runSources(db: ReturnType<typeof createPool>, only?: string, skipDownload = false) {
  const wants = (s: string) => !only || only === s || only === 'all';
  if (wants('zdykty')) { const r = await recordRun(db, 'z-dykty', () => syncZdykty(db, { log })); log(`z-dykty: ${r.ok ? 'OK' : 'BŁĄD'} – ${r.message}`); }
  if (wants('nfz')) { const r = await recordRun(db, 'nfz', () => syncNfz(db, { log })); log(`nfz: ${r.ok ? 'OK' : 'BŁĄD'} – ${r.message}`); }
  if (wants('psoz')) { const r = await recordRun(db, 'psoz', () => syncPsoz(db, { log })); log(`psoz: ${r.ok ? 'OK' : 'BŁĄD'} – ${r.message}`); }
  if (only === 'osm') { const r = await recordRun(db, 'osm', () => syncOsm({ log, skipDownload })); log(`osm: ${r.ok ? 'OK' : 'BŁĄD'} – ${r.message}`); }
}

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const source = args.find((a) => a.startsWith('--source='))?.split('=')[1];
  const skipDownload = args.includes('--skip-download');
  const db = createPool();
  await waitForDb(db);
  await applySchema(db);
  if (once) {
    await runSources(db, source ?? 'all', skipDownload);
    await db.end();
    return;
  }
  log(`harmonogram: OSM „${config.sources.osmCron}”, źródła „${config.sources.sourcesCron}”`);
  let busy = false;
  const guarded = (name: string, fn: () => Promise<void>) => async () => {
    if (busy) { log(`${name}: pomijam – inna synchronizacja trwa`); return; }
    busy = true;
    try { await fn(); } catch (e) { log(`${name}: ${e instanceof Error ? e.message : e}`); } finally { busy = false; }
  };
  new Cron(config.sources.sourcesCron, { timezone: 'Europe/Warsaw' }, guarded('źródła', () => runSources(db)));
  new Cron(config.sources.osmCron, { timezone: 'Europe/Warsaw' }, guarded('osm', () => runSources(db, 'osm')));
  // Pierwsze uruchomienie: jeśli jakieś źródło nigdy nie było pobrane – pobierz od razu.
  const never = await db.query(`select s from unnest(array['z-dykty','nfz','psoz']) s where not exists (select 1 from source_runs r where r.source = s and r.ok)`);
  if (never.rows.length > 0) await guarded('start', () => runSources(db))();
  const graph = await db.query(`select 1 from graph_versions where is_active`);
  if (graph.rows.length === 0) await guarded('osm-start', () => runSources(db, 'osm'))();
}

main().catch((e) => { console.error(e); process.exit(1); });
