import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.ts';

/** Pobiera PBF (atomowo: do pliku tymczasowego) i uruchamia importer. Nieudany import nie zmienia aktywnej wersji – gwarantuje to sam importer. */
export async function syncOsm(opts: { log?: (m: string) => void; skipDownload?: boolean; fetchImpl?: typeof fetch } = {}): Promise<{ count: number; message: string }> {
  const log = opts.log ?? (() => {});
  const dir = path.resolve(config.sources.dataDir, 'osm');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, 'malopolskie-latest.osm.pbf');
  if (!opts.skipDownload) {
    const tmp = `${target}.part`;
    log(`osm: pobieranie ${config.sources.osmPbfUrl}`);
    const res = await (opts.fetchImpl ?? fetch)(config.sources.osmPbfUrl, { signal: AbortSignal.timeout(30 * 60_000) });
    if (!res.ok || !res.body) throw new Error(`Geofabrik HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
    const size = (await stat(tmp)).size;
    if (size < 10_000_000) throw new Error(`Pobrany plik jest podejrzanie mały (${size} B)`);
    await rename(tmp, target);
    log(`osm: pobrano ${(size / 1e6).toFixed(0)} MB`);
  }
  const [cmd, ...args] = config.sources.importerCmd.split(' ').filter(Boolean) as [string, ...string[]];
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, [...args, '--pbf', target, '--database-url', config.databaseUrl, '--source-url', config.sources.osmPbfUrl], { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });
    let out = '';
    child.stdout.on('data', (d) => { out += d; log(String(d).trim()); });
    child.stderr.on('data', (d) => { out += d; log(String(d).trim()); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`importer zakończył się kodem ${code}: ${out.slice(-400)}`))));
  });
  const summaryLine = output.trim().split('\n').reverse().find((l) => l.startsWith('{'));
  const summary = summaryLine ? (JSON.parse(summaryLine) as { versionId: string; edges: number }) : null;
  return { count: summary?.edges ?? 0, message: summary ? `Nowa wersja grafu ${summary.versionId} (${summary.edges} krawędzi).` : 'Import zakończony.' };
}
