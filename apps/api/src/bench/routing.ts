/**
 * Benchmark routingu na pełnym grafie Krakowa: trasy między dzielnicami, czasy, pamięć.
 * Uruchomienie: npm run bench --workspace=@pewnyszlak/api [-- --verbose]
 */
import { DEFAULT_PREFERENCES, type Preferences } from '@pewnyszlak/domain';
import { BarrierLayer } from '../barriers/layer.ts';
import { createPool } from '../db.ts';
import { loadGraph } from '../graph/load.ts';
import { buildRoute } from '../graph/route.ts';

export const DISTRICT_PAIRS: { name: string; origin: [number, number]; destination: [number, number] }[] = [
  { name: 'Rynek Główny → Wawel', origin: [50.0617, 19.9373], destination: [50.0541, 19.9354] },
  { name: 'Dworzec Główny → Kazimierz (pl. Nowy)', origin: [50.0677, 19.9449], destination: [50.0515, 19.9455] },
  { name: 'Nowa Huta (pl. Centralny) → Rynek Główny', origin: [50.072, 20.0372], destination: [50.0617, 19.9373] },
  { name: 'Bronowice → Podgórze (Rynek Podgórski)', origin: [50.082, 19.888], destination: [50.045, 19.95] },
  { name: 'Ruczaj (Kampus UJ) → Krowodrza (Nowy Kleparz)', origin: [50.0275, 19.9045], destination: [50.0725, 19.9385] },
  { name: 'Prądnik Czerwony → Dębniki', origin: [50.0865, 19.9615], destination: [50.0455, 19.9245] },
  { name: 'Bieżanów → Zabłocie (MOCAK)', origin: [50.0185, 20.0325], destination: [50.0475, 19.9615] },
  { name: 'Mistrzejowice → Czyżyny (Muzeum Lotnictwa)', origin: [50.0975, 20.0045], destination: [50.0775, 19.9925] },
];

async function main() {
  const verbose = process.argv.includes('--verbose');
  const db = createPool();
  const t0 = performance.now();
  const graph = await loadGraph(db, (m) => console.log(m));
  if (!graph) throw new Error('Brak aktywnego grafu – uruchom importer.');
  const loadMs = performance.now() - t0;
  const mem = process.memoryUsage();
  console.log(`Graf ${graph.meta.version}: ${graph.nodeCount} węzłów, ${graph.edges.length} krawędzi; wczytanie ${loadMs.toFixed(0)} ms; RSS ${(mem.rss / 1e6).toFixed(0)} MB, heap ${(mem.heapUsed / 1e6).toFixed(0)} MB`);
  const layer = BarrierLayer.empty();
  const variants: [string, Preferences][] = [
    ['domyślne', DEFAULT_PREFERENCES],
    ['brak danych = wyklucz', { ...DEFAULT_PREFERENCES, unknownPolicy: 'exclude' }],
    ['luźne (schody ok, krawężnik 6 cm)', { ...DEFAULT_PREFERENCES, avoidSteps: false, avoidRoughSurface: false, maxKerbHeightCm: 6 }],
  ];
  const rows: string[] = [];
  for (const [label, prefs] of variants) {
    console.log(`\n== Preferencje: ${label}`);
    let total = 0;
    for (const p of DISTRICT_PAIRS) {
      const t = performance.now();
      const r = buildRoute(graph, layer, { latitude: p.origin[0], longitude: p.origin[1] }, { latitude: p.destination[0], longitude: p.destination[1] }, prefs, 'live');
      const ms = performance.now() - t;
      total += ms;
      if (r.ok) {
        const line = `${p.name}: ${ms.toFixed(0)} ms, ${r.route.distanceM} m, ${r.route.segments.length} odcinków, ${r.route.steps.length} instrukcji, bez danych o nawierzchni ${r.route.unknownDistanceM} m, niepewne ${r.route.uncertainDistanceM} m`;
        console.log(line);
        rows.push(`| ${label} | ${line.replace(':', ' |').replace(/, /g, ' | ')} |`);
        if (verbose) for (const s of r.route.steps) console.log(`   ${s.type.padEnd(16)} ${String(Math.round(s.distanceM)).padStart(5)} m  ${s.text}`);
      } else {
        console.log(`${p.name}: ${ms.toFixed(0)} ms, BRAK TRASY (${r.details.details.reason}) – ${r.details.details.explanation}`);
      }
    }
    console.log(`Łącznie ${total.toFixed(0)} ms, średnio ${(total / DISTRICT_PAIRS.length).toFixed(0)} ms/trasa`);
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
