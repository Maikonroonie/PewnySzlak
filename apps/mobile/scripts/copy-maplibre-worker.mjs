// maplibre-gl ≥ 6 ładuje worker jako osobny moduł ES (new URL(..., import.meta.url)),
// czego Metro nie obsługuje. Kopiujemy worker i jego współdzielony chunk do public/,
// a MapView.web ustawia setWorkerUrl('/maplibre/maplibre-gl-worker.mjs').
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.css'));
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre');
mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(join(dist, f), join(out, f));
console.log(`maplibre worker → ${out}`);
