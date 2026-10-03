import { config } from '../config.ts';
import type { Db } from '../db.ts';
import { normalizeText } from '../places/repo.ts';
import { McpClient } from './mcp.ts';

type NfzQueue = {
  id: string;
  attributes: {
    benefit: string; provider: string; 'provider-code': string | null; place: string | null; address: string | null; locality: string | null; phone: string | null;
    toilet: 'Y' | 'N' | null; ramp: 'Y' | 'N' | null; 'car-park': 'Y' | 'N' | null; elevator: 'Y' | 'N' | null; latitude: number | null; longitude: number | null;
    statistics?: { 'provider-data'?: { update?: string } } | null; 'teryt-place'?: string | null;
  };
};
type NfzPage = { meta: { count: number; page: number; limit: number; 'date-modified'?: string }; links: { next: string | null }; data: NfzQueue[] };

const yn = (v: 'Y' | 'N' | null | undefined): boolean | null => (v === 'Y' ? true : v === 'N' ? false : null);

const STREET_PREFIXES = new Set(['ul', 'al', 'os', 'pl', 'ulica', 'aleja', 'osiedle', 'plac', 'gen', 'ks', 'dr', 'prof', 'im', 'sw', 'kard', 'bp', 'mjr', 'plk', 'por', 'kpt', 'marsz', 'abp', 'rtm', 'f', 'j', 'k', 'm', 'w', 'a']);

/** Kluczowe słowo adresu NFZ (np. „siemaszki” z „UL. KS. KAZIMIERZA SIEMASZKI 17E”) i numer domu. */
export function addressKey(address: string): { token: string | null; number: string | null; street: string } {
  const noNumber = address.replace(/\s+\d.*$/, '');
  const tokens = normalizeText(noNumber).split(' ').filter((t) => t.length >= 3 && !STREET_PREFIXES.has(t));
  const number = address.match(/\d+[a-zA-Z]?/)?.[0]?.toLowerCase() ?? null;
  return { token: tokens[tokens.length - 1] ?? null, number, street: tokens.join(' ') };
}

/** Geokodowanie adresu NFZ w lokalnym indeksie adresów OSM. */
export async function geocodeAddress(db: Db, address: string): Promise<{ lon: number; lat: number; name: string } | null> {
  const key = addressKey(address);
  if (!key.token || !key.number) return null;
  const r = await db.query(
    `select name, lon, lat from places p join graph_versions v on v.id = p.version_id and v.is_active
      where p.kind = 'address' and p.search_text like '%' || $1 || ' ' || $2 and (p.search_text = $3 || ' ' || $2 or p.search_text like '% ' || $1 || ' ' || $2 or p.search_text like $1 || ' ' || $2)
      order by (p.search_text = $3 || ' ' || $2) desc limit 1`,
    [key.token, key.number, key.street],
  );
  return r.rows[0] ?? null;
}

/** Kontrola współrzędnych: granice pokrycia, miejscowość oraz zgodność z adresem (adres OSM z tą samą nazwą ulicy w promieniu 400 m). */
export async function validateCoordinates(db: Db, lon: number | null, lat: number | null, address: string | null, locality: string | null): Promise<{ valid: boolean; check: string; lon: number | null; lat: number | null }> {
  if (locality && !/krak/i.test(locality)) return { valid: false, check: `miejscowość „${locality}” nie jest Krakowem`, lon, lat };
  if (lon === null || lat === null || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    const geo = address ? await geocodeAddress(db, address) : null;
    if (geo) return { valid: true, check: `brak współrzędnych w NFZ – geokodowano z adresu OSM „${geo.name}”`, lon: geo.lon, lat: geo.lat };
    return { valid: false, check: 'brak współrzędnych w NFZ i adresu w indeksie OSM', lon: null, lat: null };
  }
  const v = await db.query(`select ST_Contains(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326)) as inside from graph_versions where is_active limit 1`, [lon, lat]);
  const row = v.rows[0];
  if (!row) return { valid: false, check: 'brak aktywnego grafu', lon, lat };
  if (!row.inside) return { valid: false, check: 'punkt poza granicami Krakowa (z buforem)', lon, lat };
  if (address) {
    const key = addressKey(address);
    if (key.token) {
      const a = await db.query(
        `select name, ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) as d
           from places p join graph_versions v on v.id = p.version_id and v.is_active
          where p.kind = 'address' and ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 400) and p.search_text like '%' || $3 || '%'
          order by (${key.number ? `p.search_text like '%' || $3 || ' ' || $4` : 'false'}) desc, d asc limit 1`,
        key.number ? [lon, lat, key.token, key.number] : [lon, lat, key.token],
      );
      const hit = a.rows[0];
      if (!hit) {
        const geo = await geocodeAddress(db, address);
        if (geo) return { valid: true, check: `współrzędne NFZ niezgodne z adresem – użyto adresu OSM „${geo.name}”`, lon: geo.lon, lat: geo.lat };
        return { valid: true, check: `UWAGA: w promieniu 400 m nie ma adresu OSM z „${key.token}” – lokalizacja niepotwierdzona`, lon, lat };
      }
      return { valid: true, check: `adres OSM „${hit.name}” ${Math.round(hit.d)} m od punktu`, lon, lat };
    }
  }
  return { valid: true, check: 'w granicach Krakowa; adresu nie sprawdzono', lon, lat };
}

export async function syncNfz(db: Db, opts: { benefits?: string[]; fetchImpl?: typeof fetch; log?: (m: string) => void } = {}): Promise<{ count: number; message: string }> {
  const log = opts.log ?? (() => {});
  const fetchImpl = opts.fetchImpl ?? fetch;
  const benefits = opts.benefits ?? config.sources.nfzBenefits;
  let total = 0, valid = 0;
  for (const benefit of benefits) {
    let url: string | null = `${config.sources.nfzApiUrl}/queues?page=1&limit=25&format=json&case=1&province=${config.sources.nfzProvince}&benefit=${encodeURIComponent(benefit)}&locality=${encodeURIComponent('KRAKÓW')}`;
    let pages = 0;
    while (url && pages < 40) {
      const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (!res.ok) throw new Error(`NFZ API HTTP ${res.status}`);
      const page = (await res.json()) as NfzPage;
      for (const q of page.data) {
        const a = q.attributes;
        const check = await validateCoordinates(db, a.longitude, a.latitude, a.address, a.locality);
        const lon = check.lon, lat = check.lat;
        const dataMonth = a.statistics?.['provider-data']?.update ?? null;
        const nfzUpdated = page.meta['date-modified'] ?? null;
        await db.query(
          `insert into facilities (id, benefit, provider, provider_code, place_name, address, locality, phone, lon, lat, geom, coords_valid, coords_check, toilet, ramp, elevator, car_park, data_month, nfz_updated_at, fetched_at, raw)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $9::float8 is null or $10::float8 is null then null else ST_SetSRID(ST_MakePoint($9, $10), 4326) end, $11, $12, $13, $14, $15, $16, $17, $18, now(), $19)
           on conflict (id) do update set benefit = excluded.benefit, provider = excluded.provider, provider_code = excluded.provider_code, place_name = excluded.place_name, address = excluded.address, locality = excluded.locality, phone = excluded.phone,
             lon = excluded.lon, lat = excluded.lat, geom = excluded.geom, coords_valid = excluded.coords_valid, coords_check = excluded.coords_check, toilet = excluded.toilet, ramp = excluded.ramp, elevator = excluded.elevator, car_park = excluded.car_park,
             data_month = excluded.data_month, nfz_updated_at = excluded.nfz_updated_at, fetched_at = now(), raw = excluded.raw`,
          [q.id, a.benefit, a.provider, a['provider-code'], a.place, a.address, a.locality, a.phone, lon, lat, check.valid, check.check, yn(a.toilet), yn(a.ramp), yn(a.elevator), yn(a['car-park']), dataMonth, nfzUpdated, JSON.stringify(q)],
        );
        total++;
        if (check.valid) valid++;
      }
      pages++;
      url = page.links.next ? `${config.sources.nfzApiUrl.replace(/\/app-itl-api$/, '')}${page.links.next}` : null;
      log(`nfz: ${benefit} strona ${pages}, rekordów ${page.data.length}`);
      await new Promise((r) => setTimeout(r, 300)); // limit API NFZ
    }
  }
  return { count: total, message: `Pobrano ${total} placówek (${benefits.join(', ')}); współrzędne poprawne: ${valid}, odrzucone: ${total - valid}.` };
}

type PsozSearch = { wyniki: { rodzina: string; slug: string; nazwa: string; pageUrl: string; sekcja?: string }[] };

/** Dopasowanie placówek NFZ do rekordów psoz.pl (po nazwie świadczeniodawcy). Dostarcza link i metadane; nie zawiera informacji o barierach. */
export async function syncPsoz(db: Db, opts: { client?: McpClient; limit?: number; log?: (m: string) => void } = {}): Promise<{ count: number; message: string }> {
  const log = opts.log ?? (() => {});
  const client = opts.client ?? new McpClient(config.sources.psozMcpUrl);
  const rows = await db.query(`select id, provider, place_name from facilities where coords_valid and (psoz_fetched_at is null or psoz_fetched_at < now() - interval '7 days') order by fetched_at desc limit $1`, [opts.limit ?? 60]);
  let matched = 0;
  const cache = new Map<string, PsozSearch['wyniki'][number] | null>();
  for (const f of rows.rows) {
    const key = normalizeText(f.provider).split(' ').slice(0, 5).join(' ');
    let hit = cache.get(key);
    if (hit === undefined) {
      const phrase = f.provider.replace(/SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ|SP\. Z O\.O\.|SPÓŁKA AKCYJNA|S\.A\./gi, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      try {
        const res = await client.callTool<PsozSearch>('szukaj', { fraza: phrase, limit: 5 });
        const list = res.structured?.wyniki ?? [];
        const wanted = normalizeText(phrase).split(' ').filter((w) => w.length > 3);
        hit = list.find((w) => {
          const n = normalizeText(w.nazwa.replace('…', ''));
          return wanted.filter((x) => n.includes(x)).length >= Math.min(2, wanted.length) && /krak/i.test(w.slug + w.nazwa);
        }) ?? null;
      } catch (e) {
        log(`psoz: błąd dla „${phrase}”: ${e instanceof Error ? e.message : e}`);
        hit = null;
        if (cache.size === 0) throw e; // pierwszy błąd → źródło niedostępne
      }
      cache.set(key, hit);
      await new Promise((r) => setTimeout(r, 200));
    }
    await db.query(`update facilities set psoz_slug = $2, psoz_family = $3, psoz_url = $4, psoz_fetched_at = now(), psoz_meta = $5 where id = $1`, [f.id, hit?.slug ?? null, hit?.rodzina ?? null, hit?.pageUrl ?? null, hit ? JSON.stringify(hit) : null]);
    if (hit) matched++;
  }
  return { count: matched, message: `Sprawdzono ${rows.rows.length} placówek, dopasowano w psoz.pl: ${matched}.` };
}
