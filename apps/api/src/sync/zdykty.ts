import { createHash } from 'node:crypto';
import { BarrierRepo } from '../barriers/repo.ts';
import { config } from '../config.ts';
import type { Db } from '../db.ts';
import { normalizeText } from '../places/repo.ts';
import { McpClient } from './mcp.ts';

export type Tender = {
  id: string; tytul: string; zamawiajacy: string | null; typ: 'ogloszenie' | 'wynik' | string; rodzaj_zamowienia: string | null;
  data_publikacji: string | null; termin_skladania_ofert: string | null; zrodlo_url: string | null; wykonawca: string | null; kwota: number | null;
};
type TenderPage = { dane: Tender[]; kursor: string | null; zrodla: { url: string; nazwa: string }[]; uwagi?: string[] };

const PEDESTRIAN = [/chodnik/i, /ci[aą]g(?:u|i|ów|ow)? piesz/i, /przej[śs]ci[ae] dla pieszych/i, /krawę[żz]nik/i, /pochyln/i, /podjazd/i, /wind[aęy]/i, /schod/i, /peron/i, /przystan/i, /strefa piesza/i, /deptak/i, /plac(?:u)? \w+/i, /nawierzchni/i];
const STREETWORKS = [/przebudow[aęy]? (?:ul|ulic|al|alei|drog)/i, /remont (?:ul|ulic|al|alei|drog|nawierzchni)/i, /rozbudow[aęy]? (?:ul|ulic|al|alei|drog)/i, /budow[aęy]? (?:ul|ulic|drog|ścieżki|sciezki)/i, /torowisk/i, /kanalizacj/i, /wodoci[aą]g/i, /ciepłociąg|cieplociag/i, /sieci (?:gazowej|cieplnej|wodociągowej|kanalizacyjnej)/i, /drog(?:i|owe|owych)/i, /utwardzen/i, /infrastruktury drogowej/i];
const EXCLUDE = [/lokal(?:i|u|e) mieszkaln/i, /budynk/i, /elewacj/i, /dach/i, /pracowni/i, /ppo[żz]/i, /okien/i, /klatki schodowej/i, /pomieszcze/i, /sal(?:i|ę) gimnastyczn/i, /instalacji elektrycznej/i, /kotłowni/i, /centralnego ogrzewania/i, /przedszkol/i, /szko[łl]/i, /boisk/i, /ogrodzeni/i];

export function classifyTender(title: string): 'pedestrian' | 'possible' | 'none' {
  if (EXCLUDE.some((r) => r.test(title)) && !PEDESTRIAN.slice(0, 7).some((r) => r.test(title))) return 'none';
  if (PEDESTRIAN.some((r) => r.test(title))) return 'pedestrian';
  if (STREETWORKS.some((r) => r.test(title))) return 'possible';
  return 'none';
}

/** Wyciąga kandydatów na nazwy ulic z tytułu ogłoszenia. */
export function extractStreetCandidates(title: string): string[] {
  const out = new Set<string>();
  const re = /\b(?:ul\.|ulic[aiyą]|ulicach|al\.|alej[aiąę]|alei|os\.|osiedl[aeu]|pl\.|plac[uae]?|rond[oa]|bulwar(?:u|ze)?)\s+((?:\d{1,2}\s+)?[A-ZŁŚŻŹĆŃÓĘĄ][\p{L}.\-]*(?:\s+(?:[A-ZŁŚŻŹĆŃÓĘĄ][\p{L}.\-]*|i|im\.|gen\.|św\.|ks\.|dr\.|kard\.|bp\.|mjr\.|płk\.|por\.|prof\.|al\.|rtm\.|kpt\.|marsz\.|abp\.|sw\.)){0,4})/gu;
  for (const m of title.matchAll(re)) {
    const name = m[1]!.replace(/[,;:)]+$/, '').trim();
    if (name.length >= 3) out.add(name);
  }
  return [...out];
}

/** Dopasowanie nazwy (często w odmianie) do indeksu ulic OSM: trigramy + wspólny prefiks. */
export async function matchStreet(db: Db, candidate: string): Promise<{ name: string; edgeIds: string[]; lon: number; lat: number; score: number } | null> {
  const norm = normalizeText(candidate.replace(/^(im\.|gen\.|św\.|ks\.|dr\.|kard\.|bp\.|mjr\.|płk\.|prof\.)\s+/i, ''));
  if (norm.length < 3) return null;
  const r = await db.query(
    `select s.name, s.name_norm, s.edge_ids, s.lon, s.lat, similarity(s.name_norm, $1) as sim
       from streets s join graph_versions v on v.id = s.version_id and v.is_active
      where s.name_norm % $1 or s.name_norm like $2
      order by sim desc limit 5`,
    [norm, `${norm.slice(0, Math.max(4, Math.floor(norm.length * 0.6)))}%`],
  );
  for (const row of r.rows) {
    const a = norm.split(' ');
    const b = (row.name_norm ?? normalizeText(row.name)).split(' ');
    const lastA = a[a.length - 1]!, lastB = b[b.length - 1]!;
    const stem = Math.min(lastA.length, lastB.length) - 2;
    const prefixOk = stem >= 3 && lastA.slice(0, stem) === lastB.slice(0, stem);
    if (row.sim >= 0.45 || prefixOk) return { name: row.name, edgeIds: row.edge_ids, lon: row.lon, lat: row.lat, score: row.sim };
  }
  return null;
}

export async function syncZdykty(db: Db, opts: { maxPages?: number; sinceDays?: number; client?: McpClient; log?: (m: string) => void } = {}): Promise<{ count: number; message: string }> {
  const log = opts.log ?? (() => {});
  const client = opts.client ?? new McpClient(config.sources.zdyktyMcpUrl);
  const repo = new BarrierRepo(db);
  const since = new Date(Date.now() - (opts.sinceDays ?? 180) * 86_400_000).toISOString().slice(0, 10);
  let kursor: string | null = null;
  let page = 0;
  let fetched = 0, relevant = 0, located = 0;
  const seen = new Set<string>();
  do {
    const args: Record<string, unknown> = { gmina: config.sources.krakowTeryt, rodzaj: 'Roboty budowlane', limit: 50, od: since };
    if (kursor) args.kursor = kursor;
    const res = await client.callTool<TenderPage>('przetargi', args);
    if (res.isError || !res.structured) throw new Error(`z-dykty przetargi: ${res.text.slice(0, 200) || 'brak danych'}`);
    const data = res.structured;
    for (const t of data.dane) {
      if (seen.has(t.id)) continue; // deduplikacja w obrębie stron
      seen.add(t.id);
      fetched++;
      const relevance = classifyTender(t.tytul);
      let matchedStreet: string | null = null;
      let matchedEdges: string[] = [];
      let barrierId: string | null = null;
      if (relevance !== 'none') {
        relevant++;
        let match: Awaited<ReturnType<typeof matchStreet>> = null;
        for (const cand of extractStreetCandidates(t.tytul)) {
          match = await matchStreet(db, cand);
          if (match) break;
        }
        const titleKey = createHash('sha1').update(normalizeText(t.tytul).replace(/\b(ogloszenie|wynik|postepowania|o zamowieniu)\b/g, '')).digest('hex').slice(0, 20);
        const published = t.data_publikacji ? `${t.data_publikacji}T00:00:00Z` : null;
        const validUntil = t.data_publikacji ? new Date(Date.parse(t.data_publikacji) + 365 * 86_400_000).toISOString() : null;
        if (match) { matchedStreet = match.name; matchedEdges = match.edgeIds; located++; }
        barrierId = await repo.upsertExternal({
          originSource: 'z-dykty', originSourceId: `tender:${titleKey}`, type: 'construction',
          title: `${relevance === 'pedestrian' ? 'Możliwe roboty w ciągu pieszym' : 'Możliwe roboty drogowe'}${match ? `: ${match.name}` : ''}`,
          description: `${t.tytul}\nZamawiający: ${t.zamawiajacy ?? '?'}; ${t.typ === 'wynik' ? `wynik postępowania (wykonawca: ${t.wykonawca ?? '?'})` : 'ogłoszenie o zamówieniu'}; publikacja ${t.data_publikacji ?? '?'}.\nSygnał z przetargu nie oznacza trwających robót – lokalizacja i termin wymagają potwierdzenia (zgłoszenie lub weryfikacja operatora).`,
          lon: match?.lon ?? null, lat: match?.lat ?? null, edgeIds: matchedEdges, state: 'potential', blocksRouting: false, validFrom: published, validUntil,
          meta: { relevance, tenderIds: [t.id], street: matchedStreet, locationMethod: match ? 'street-name-match' : 'unlocated' },
          evidence: [{
            source: 'z-dykty', sourceId: t.id, sourceUrl: t.zrodlo_url, status: 'signal',
            description: `${t.typ === 'wynik' ? 'Ogłoszenie o wyniku' : 'Ogłoszenie o zamówieniu'} BZP: ${t.tytul.slice(0, 200)}${match ? ` · dopasowano do ulicy „${match.name}” po nazwie (bez potwierdzenia w terenie)` : ' · nie udało się zlokalizować'}`,
            updatedAt: published, observedAt: null,
          }],
        });
      }
      await db.query(
        `insert into tender_signals (id, title, buyer, kind, notice_type, published_on, deadline, source_url, matched_street, matched_edge_ids, relevance, barrier_id, fetched_at, raw)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
         on conflict (id) do update set matched_street = excluded.matched_street, matched_edge_ids = excluded.matched_edge_ids, relevance = excluded.relevance, barrier_id = coalesce(excluded.barrier_id, tender_signals.barrier_id), fetched_at = now(), raw = excluded.raw`,
        [t.id, t.tytul, t.zamawiajacy, t.rodzaj_zamowienia, t.typ, t.data_publikacji, t.termin_skladania_ofert, t.zrodlo_url, matchedStreet, matchedEdges, relevance, barrierId, JSON.stringify(t)],
      );
    }
    kursor = data.kursor;
    page++;
    log(`z-dykty: strona ${page}, rekordów ${data.dane.length}, kursor ${kursor ? 'tak' : 'nie'}`);
  } while (kursor && page < (opts.maxPages ?? 12));
  return { count: fetched, message: `Pobrano ${fetched} ogłoszeń (od ${since}); istotnych dla pieszych ${relevant}, zlokalizowanych po nazwie ulicy ${located}.` };
}
