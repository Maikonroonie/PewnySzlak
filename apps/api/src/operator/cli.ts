/**
 * Narzędzie operatora – korekty danych bez dostępu do bazy ręcznie.
 *
 *   npm run operator -- barriers [--all]                  lista barier (domyślnie bez rozwiązanych)
 *   npm run operator -- barrier <id>                      szczegóły z dowodami
 *   npm run operator -- verify <id> [--note "..."]        formalna weryfikacja (status verified), stan active + blokada
 *   npm run operator -- set-state <id> <state> [--blocks true|false] [--until 2026-12-31] [--note "..."]
 *   npm run operator -- locate <id> <edgeId,edgeId,...>   przypisanie bariery do odcinków (np. sygnał z przetargu)
 *   npm run operator -- delete <id>
 *   npm run operator -- tenders [--relevant]              sygnały z przetargów
 *   npm run operator -- facility-coords <id> <lat> <lon>  korekta współrzędnych placówki
 *   npm run operator -- graph                             wersje grafu
 *   npm run operator -- graph-activate <versionId>        przełączenie aktywnej wersji grafu (rollback)
 *   npm run operator -- backup                            kopia bazy (pg_dump przez docker compose) do data/backups
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BarrierRepo } from '../barriers/repo.ts';
import { config } from '../config.ts';
import { applySchema, createPool } from '../db.ts';

const actor = process.env.OPERATOR_NAME || process.env.USER || 'operator-cli';

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const db = createPool();
  await applySchema(db);
  const repo = new BarrierRepo(db);
  try {
    switch (cmd) {
      case 'barriers': {
        const all = args.includes('--all');
        const list = (await repo.all()).filter((b) => all || b.state !== 'resolved');
        for (const b of list) console.log(`${b.id}  ${b.state.padEnd(9)} ${b.blocksRouting ? 'BLOKUJE' : '       '} ${b.isDemo ? 'DEMO ' : '     '} ${b.originSource.padEnd(9)} +${b.confirmationCount}/-${b.rejectionCount}  ${b.title}`);
        console.log(`${list.length} barier`);
        break;
      }
      case 'barrier': {
        const b = await repo.byId(args[0]!);
        console.log(JSON.stringify(b, null, 2));
        break;
      }
      case 'verify': {
        const b = await repo.operatorUpdate(args[0]!, actor, { verify: true, state: 'active', blocksRouting: true, note: flag(args, 'note') ?? 'Weryfikacja operatora: lokalizacja i aktualność potwierdzone.' });
        console.log(b ? `OK: ${b.title} → ${b.state}, blokuje: ${b.blocksRouting}` : 'Nie znaleziono');
        break;
      }
      case 'set-state': {
        const state = args[1] as 'potential' | 'active' | 'resolved' | 'disputed';
        const blocks = flag(args, 'blocks');
        const until = flag(args, 'until');
        const b = await repo.operatorUpdate(args[0]!, actor, { state, blocksRouting: blocks === undefined ? undefined : blocks === 'true', validUntil: until ? new Date(until).toISOString() : undefined, note: flag(args, 'note') });
        console.log(b ? `OK: ${b.title} → ${b.state}, blokuje: ${b.blocksRouting}, do: ${b.validUntil ?? '-'}` : 'Nie znaleziono');
        break;
      }
      case 'locate': {
        const edgeIds = (args[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const b = await repo.operatorUpdate(args[0]!, actor, { edgeIds, note: `Operator przypisał barierę do odcinków: ${edgeIds.join(', ')}` });
        console.log(b ? `OK: ${b.title} → ${b.edgeIds.length} odcinków` : 'Nie znaleziono');
        break;
      }
      case 'delete': {
        console.log((await repo.deleteBarrier(args[0]!, actor)) ? 'Usunięto' : 'Nie znaleziono');
        break;
      }
      case 'tenders': {
        const r = await db.query(`select id, relevance, matched_street, published_on, left(title, 110) as title, barrier_id from tender_signals ${args.includes('--relevant') ? "where relevance <> 'none'" : ''} order by published_on desc limit 200`);
        for (const t of r.rows) console.log(`${t.id.padEnd(20)} ${t.published_on ?? ''} ${t.relevance.padEnd(10)} ${(t.matched_street ?? '-').padEnd(28)} ${t.barrier_id ?? ''}  ${t.title}`);
        break;
      }
      case 'facility-coords': {
        const [id, lat, lon] = args;
        await db.query(`update facilities set lat = $2, lon = $3, geom = ST_SetSRID(ST_MakePoint($3, $2), 4326), coords_valid = true, coords_check = $4 where id = $1`, [id!.replace(/^f-/, ''), Number(lat), Number(lon), `korekta operatora ${actor} ${new Date().toISOString().slice(0, 10)}`]);
        await db.query(`insert into operator_log (actor, action, target, payload) values ($1, 'facility.coords', $2, $3)`, [actor, id, JSON.stringify({ lat, lon })]);
        console.log('OK');
        break;
      }
      case 'graph': {
        const r = await db.query(`select id, status, is_active, node_count, edge_count, place_count, osm_data_timestamp, created_at, notes from graph_versions order by created_at desc`);
        for (const v of r.rows) console.log(`${v.id}  ${v.status.padEnd(9)} ${v.is_active ? 'AKTYWNA' : '       '} węzły ${v.node_count ?? '-'} krawędzie ${v.edge_count ?? '-'} miejsca ${v.place_count ?? '-'} dane OSM ${v.osm_data_timestamp ?? '-'} ${v.notes ?? ''}`);
        break;
      }
      case 'graph-activate': {
        await db.query('begin');
        await db.query(`update graph_versions set is_active = false where is_active`);
        const r = await db.query(`update graph_versions set is_active = true, status = 'ready' where id = $1 and status in ('ready', 'archived') returning id`, [args[0]]);
        await db.query('commit');
        await db.query(`insert into operator_log (actor, action, target) values ($1, 'graph.activate', $2)`, [actor, args[0]]);
        console.log(r.rowCount ? `Aktywowano ${args[0]} (API wczyta ją w ciągu 5 minut lub po POST /v1/operator/graph/reload)` : 'Nie znaleziono wersji gotowej do aktywacji');
        break;
      }
      case 'backup': {
        const dir = path.resolve(config.sources.dataDir, 'backups');
        mkdirSync(dir, { recursive: true });
        const file = `pewnyszlak-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
        const r = spawnSync('docker', ['compose', 'exec', '-T', 'db', 'pg_dump', '-U', process.env.POSTGRES_USER || 'pewnyszlak', '-d', process.env.POSTGRES_DB || 'pewnyszlak', '-Fc', '-f', `/backups/${file}`], { stdio: 'inherit', cwd: path.resolve(process.cwd(), '../..') });
        console.log(r.status === 0 ? `Kopia zapisana: data/backups/${file}` : 'Błąd pg_dump (czy baza działa w docker compose?)');
        break;
      }
      default:
        console.log((await import('node:fs')).readFileSync(new URL(import.meta.url)).toString().split('*/')[0]);
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
