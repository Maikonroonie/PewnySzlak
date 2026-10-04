/**
 * Zestaw demonstracyjny – oddzielny, jawnie oznaczony (is_demo = true), widoczny tylko w trybie `x-data-mode: demo`.
 * Pokazuje: remont blokujący ulicę (objazd), konflikt obserwacji, nieaktualne zgłoszenie, sygnał z przetargu bez lokalizacji
 * oraz symulowaną awarię źródła (psoz – patrz sources/status.ts). Nie zastępuje danych rzeczywistych.
 *
 *   npm run demo:seed            – (ponownie) tworzy zestaw
 *   npm run demo:seed -- --clear – usuwa zestaw
 */
import { BarrierRepo } from '../barriers/repo.ts';
import { applySchema, createPool } from '../db.ts';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

async function edgesNear(db: ReturnType<typeof createPool>, name: string, lon: number, lat: number, radiusM: number): Promise<{ ids: string[]; lon: number; lat: number }> {
  const r = await db.query(
    `select e.id, ST_X(ST_Centroid(e.geom)) as lon, ST_Y(ST_Centroid(e.geom)) as lat from graph_edges e join graph_versions v on v.id = e.version_id and v.is_active
      where e.name = $1 and ST_DWithin(e.geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4) order by e.geom <-> ST_SetSRID(ST_MakePoint($2, $3), 4326)`,
    [name, lon, lat, radiusM],
  );
  if (r.rows.length === 0) throw new Error(`Nie znaleziono krawędzi „${name}” w pobliżu ${lat},${lon}`);
  return { ids: r.rows.map((x) => x.id), lon: r.rows[0].lon, lat: r.rows[0].lat };
}

async function nearestNode(db: ReturnType<typeof createPool>, lon: number, lat: number, where: string): Promise<{ id: number; lon: number; lat: number } | null> {
  const r = await db.query(
    `select n.id, n.lon, n.lat from graph_nodes n join graph_versions v on v.id = n.version_id and v.is_active
      where ${where} order by ST_SetSRID(ST_MakePoint(n.lon, n.lat), 4326) <-> ST_SetSRID(ST_MakePoint($1, $2), 4326) limit 1`,
    [lon, lat],
  );
  return r.rows[0] ?? null;
}

export async function seedDemo(db: ReturnType<typeof createPool>, log: (m: string) => void = console.log): Promise<void> {
  const repo = new BarrierRepo(db);
  const removed = await repo.deleteDemo();
  if (removed) log(`Usunięto poprzedni zestaw demo (${removed} barier).`);

  // 1. Remont nawierzchni ul. Grodzkiej – aktywna blokada z potwierdzoną lokalizacją (sygnał z przetargu + weryfikacja operatora).
  const grodzka = await edgesNear(db, 'Grodzka', 19.9379, 50.0583, 70);
  const remontId = await repo.upsertExternal({
    originSource: 'demo', originSourceId: 'demo-remont-grodzka', type: 'construction',
    title: 'DEMO: Remont nawierzchni ul. Grodzkiej (odcinek przy pl. Wszystkich Świętych)',
    description: 'Wymiana nawierzchni z kostki – ciąg pieszy zamknięty, przejście tylko po płytach tymczasowych. Sygnał z Biuletynu Zamówień Publicznych potwierdzony w terenie przez operatora.',
    lon: grodzka.lon, lat: grodzka.lat, edgeIds: grodzka.ids, state: 'active', blocksRouting: true, validFrom: daysAgo(12), validUntil: daysAhead(45), isDemo: true,
    meta: { scenario: 'remont-objazd' },
    evidence: [
      { source: 'z-dykty', sourceId: 'demo/2026/BZP 00000001', sourceUrl: 'https://z-dykty.pl/gmina/krakow-1261011/przetargi', status: 'signal', description: 'Ogłoszenie BZP: „Remont nawierzchni ul. Grodzkiej w Krakowie – etap II” (zamawiający: ZDMK). Przetarg sam w sobie nie oznacza trwających robót.', updatedAt: daysAgo(40), observedAt: null, fetchedAt: daysAgo(1) },
      { source: 'operator', sourceId: 'demo/operator/grodzka', sourceUrl: null, status: 'verified', description: 'Operator potwierdził lokalizację i trwanie robót (wizja lokalna). Blokada obowiązuje do planowanego końca prac.', updatedAt: daysAgo(3), observedAt: daysAgo(3), fetchedAt: daysAgo(3) },
      { source: 'community', sourceId: 'demo/report/grodzka-1', sourceUrl: null, status: 'reported', description: 'Zgłoszenie użytkownika: „Płyty tymczasowe z progiem ok. 5 cm, wózkiem nie przejadę”.', updatedAt: null, observedAt: daysAgo(2), fetchedAt: daysAgo(2) },
    ],
  });
  await db.query(`insert into barrier_feedback (barrier_id, installation_hash, action) values ($1, 'demo-hash-a', 'confirm'), ($1, 'demo-hash-b', 'confirm') on conflict do nothing`, [remontId]);
  log(`1/5 remont Grodzka: ${grodzka.ids.length} krawędzi, blokada aktywna`);

  // 2. Konflikt obserwacji – krawężnik na przejściu przy ul. Franciszkańskiej: OSM „obniżony”, użytkownicy się nie zgadzają.
  const kerbNode = await nearestNode(db, 19.9365, 50.0585, `n.tags->>'kerb' = 'lowered'`);
  if (kerbNode) {
    const kerbId = await repo.upsertExternal({
      originSource: 'demo', originSourceId: 'demo-konflikt-krawęznik', type: 'kerb',
      title: 'DEMO: Krawężnik na przejściu – sprzeczne informacje',
      description: 'OpenStreetMap: kerb=lowered (szacunek ok. 2 cm). Jedno zgłoszenie mówi o progu ok. 6 cm, inne temu zaprzecza. Aplikacja zachowuje obie obserwacje i nie rozstrzyga – odcinek jest oznaczony jako niepewny.',
      lon: kerbNode.lon, lat: kerbNode.lat, edgeIds: [], nodeIds: [kerbNode.id], state: 'active', blocksRouting: false, isDemo: true, meta: { scenario: 'konflikt' },
      evidence: [
        { source: 'osm', sourceId: `node/${kerbNode.id}`, sourceUrl: `https://www.openstreetmap.org/node/${kerbNode.id}`, status: 'estimated', description: 'OSM: kerb=lowered → szacunek 2 cm (brak kerb:height).', updatedAt: daysAgo(500), observedAt: null, fetchedAt: daysAgo(1) },
        { source: 'community', sourceId: 'demo/report/kerb-1', sourceUrl: null, status: 'reported', description: 'Zgłoszenie: „Krawężnik ma ok. 6 cm, obniżenie tylko od strony jezdni”.', updatedAt: null, observedAt: daysAgo(9), fetchedAt: daysAgo(9) },
        { source: 'community', sourceId: 'demo/report/kerb-2', sourceUrl: null, status: 'reported', description: 'Zakwestionowanie: „Przejechałem bez problemu, krawężnik jest obniżony”.', updatedAt: null, observedAt: daysAgo(4), fetchedAt: daysAgo(4) },
      ],
    });
    await db.query(`insert into barrier_feedback (barrier_id, installation_hash, action) values ($1, 'demo-hash-c', 'confirm'), ($1, 'demo-hash-d', 'reject') on conflict do nothing`, [kerbId]);
    log(`2/5 konflikt krawężnik: węzeł ${kerbNode.id}`);
  }

  // 3. Nieaktualne zgłoszenie – winda przy Dworcu Głównym zgłoszona jako nieczynna 9 miesięcy temu, bez nowszych potwierdzeń.
  const elevator = await nearestNode(db, 19.9449, 50.0677, `n.tags->>'highway' = 'elevator'`);
  if (elevator) {
    await repo.upsertExternal({
      originSource: 'demo', originSourceId: 'demo-winda-stara', type: 'elevator',
      title: 'DEMO: Winda zgłoszona jako nieczynna (zgłoszenie sprzed 9 miesięcy)',
      description: 'Jedyne zgłoszenie pochodzi sprzed 9 miesięcy i nie zostało odświeżone. Aplikacja oznacza je jako możliwe nieaktualne; nadal wpływa na koszt trasy, ale nie blokuje.',
      lon: elevator.lon, lat: elevator.lat, edgeIds: [], nodeIds: [elevator.id], state: 'active', blocksRouting: false, isDemo: true, meta: { scenario: 'nieaktualne' },
      evidence: [{ source: 'community', sourceId: 'demo/report/winda', sourceUrl: null, status: 'reported', description: 'Zgłoszenie: „Winda nie działa, kartka na drzwiach”.', updatedAt: null, observedAt: daysAgo(270), fetchedAt: daysAgo(270) }],
    });
    log(`3/5 nieaktualna winda: węzeł ${elevator.id}`);
  }

  // 4. Sygnał z przetargu bez potwierdzonej lokalizacji – pozostaje „możliwym utrudnieniem”, nie blokuje.
  const flor = await edgesNear(db, 'Floriańska', 19.9405, 50.0632, 120);
  await repo.upsertExternal({
    originSource: 'demo', originSourceId: 'demo-przetarg-florianska', type: 'construction',
    title: 'DEMO: Możliwe roboty – „Przebudowa nawierzchni ul. Floriańskiej” (przetarg)',
    description: 'Ogłoszenie o wyniku postępowania sprzed 3 tygodni; brak informacji o terminie rozpoczęcia robót. Dopasowanie po nazwie ulicy – lokalizacja i aktualność niepotwierdzone, dlatego odcinek dostaje tylko ostrzeżenie i wyższy koszt.',
    lon: flor.lon, lat: flor.lat, edgeIds: flor.ids, state: 'potential', blocksRouting: false, validFrom: daysAgo(21), validUntil: daysAhead(300), isDemo: true, meta: { scenario: 'sygnał' },
    evidence: [{ source: 'z-dykty', sourceId: 'demo/2026/BZP 00000002', sourceUrl: 'https://z-dykty.pl/gmina/krakow-1261011/przetargi', status: 'signal', description: 'Ogłoszenie o wyniku BZP: „Przebudowa nawierzchni ul. Floriańskiej” – wykonawca wybrany.', updatedAt: daysAgo(21), observedAt: null, fetchedAt: daysAgo(1) }],
  });
  log(`4/5 sygnał Floriańska: ${flor.ids.length} krawędzi`);

  // 5. Schody z zgłoszoną pochylnią „rozwiązane” – pokazuje cykl życia: zgłoszenie usunięcia przeszkody.
  const steps = await nearestNode(db, 19.9354, 50.0541, `n.tags->>'barrier' = 'kerb' or n.tags ? 'kerb'`);
  if (steps) {
    await repo.upsertExternal({
      originSource: 'demo', originSourceId: 'demo-rozwiazane', type: 'obstacle',
      title: 'DEMO: Przeszkoda usunięta (zgłoszenie zakończone)',
      description: 'Kontener budowlany blokował chodnik; dwóch użytkowników zgłosiło usunięcie – bariera ma stan „rozwiązana” i nie wpływa na trasy, ale historia pozostaje widoczna.',
      lon: steps.lon, lat: steps.lat, edgeIds: [], nodeIds: [], state: 'resolved', blocksRouting: false, isDemo: true, meta: { scenario: 'cykl' },
      evidence: [
        { source: 'community', sourceId: 'demo/report/kontener', sourceUrl: null, status: 'reported', description: 'Zgłoszenie: „Kontener na chodniku, przejście 60 cm”.', updatedAt: null, observedAt: daysAgo(30), fetchedAt: daysAgo(30) },
        { source: 'community', sourceId: 'demo/report/kontener-resolved', sourceUrl: null, status: 'reported', description: 'Dwa zgłoszenia „przeszkoda zniknęła”.', updatedAt: null, observedAt: daysAgo(6), fetchedAt: daysAgo(6) },
      ],
    });
    log('5/5 przeszkoda rozwiązana');
  }
  log('Zestaw demo gotowy. Użyj nagłówka x-data-mode: demo (w aplikacji: przełącznik „Tryb demo”).');
  const { VERIFIED_PLACE_SEEDS } = await import('./verified-places.ts');
  log(`Overlay miejsc sprawdzonych w terenie: ${VERIFIED_PLACE_SEEDS.length} (Rynek) – ładowany przy /v1/explore.`);
}

async function main() {
  const db = createPool();
  await applySchema(db);
  if (process.argv.includes('--clear')) {
    const n = await new BarrierRepo(db).deleteDemo();
    console.log(`Usunięto ${n} barier demo.`);
  } else {
    await seedDemo(db);
  }
  await db.end();
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
