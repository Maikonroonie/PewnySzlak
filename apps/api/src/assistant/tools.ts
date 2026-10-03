import { z } from 'zod';
import type { Barrier, Coordinate, Evidence, Facility, Place, Preferences } from '@pewnyszlak/domain';
import { sourceLabels, statusLabels } from '@pewnyszlak/domain';
import type { AppContext } from '../context.ts';
import { sourcesStatus } from '../sources/status.ts';
import { buildRoute } from '../graph/route.ts';

/** Narzędzia asystenta – jedyna droga modelu do danych. Argumenty są walidowane Zod, wyniki są faktami z bazy. */
export const toolSchemas = {
  search_places: z.object({ query: z.string().min(2).max(120), limit: z.number().int().min(1).max(10).default(5) }),
  find_facilities: z.object({ benefit: z.string().max(120).optional(), query: z.string().max(120).optional(), limit: z.number().int().min(1).max(10).default(5) }),
  barriers_near: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), radiusM: z.number().min(50).max(3000).default(500) }),
  check_route: z.object({ destinationLatitude: z.number().min(-90).max(90), destinationLongitude: z.number().min(-180).max(180), destinationName: z.string().max(200) }),
  source_status: z.object({}),
};
export type ToolName = keyof typeof toolSchemas;

export const toolDefinitions = [
  { type: 'function', name: 'search_places', description: 'Szuka miejsc i adresów w Krakowie w lokalnym indeksie OpenStreetMap. Zwraca współrzędne i to, co OSM mówi o dostępności (często nic).', parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['query'], additionalProperties: false } },
  { type: 'function', name: 'find_facilities', description: 'Placówki NFZ (np. poradnie rehabilitacyjne) z udogodnieniami DEKLAROWANYMI przez świadczeniodawcę, posortowane od najbliższych do użytkownika. Deklaracja nie jest potwierdzeniem.', parameters: { type: 'object', properties: { benefit: { type: 'string', description: 'Nazwa świadczenia NFZ, np. "PORADNIA REHABILITACYJNA"' }, query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: [], additionalProperties: false } },
  { type: 'function', name: 'barriers_near', description: 'Znane bariery i sygnały (remonty z przetargów, zgłoszenia) w promieniu od punktu, ze źródłem, datą i statusem wiarygodności.', parameters: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, radiusM: { type: 'number' } }, required: ['latitude', 'longitude'], additionalProperties: false } },
  { type: 'function', name: 'check_route', description: 'Wyznacza trasę z pozycji użytkownika do celu zgodnie z jego preferencjami (robi to backend, nie model). Zwraca dystans, czas, bariery, braki danych albo powód braku trasy. Użyj, gdy użytkownik chce dotrzeć do konkretnego miejsca.', parameters: { type: 'object', properties: { destinationLatitude: { type: 'number' }, destinationLongitude: { type: 'number' }, destinationName: { type: 'string' } }, required: ['destinationLatitude', 'destinationLongitude', 'destinationName'], additionalProperties: false } },
  { type: 'function', name: 'source_status', description: 'Stan źródeł danych: kiedy ostatnio pobrane, czy dostępne, licencje.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
] as const;

export type ToolContext = { ctx: AppContext; coordinate: Coordinate | null; preferences: Preferences; mode: 'live' | 'demo' };

export type ToolOutcome = { result: unknown; citations: Evidence[]; places: Place[]; destination: { coordinate: Coordinate; name: string } | null };

export function describeEvidence(e: Evidence): string {
  const when = e.observedAt ? `sprawdzono ${e.observedAt.slice(0, 10)}` : e.updatedAt ? `zmiana w źródle ${e.updatedAt.slice(0, 10)}` : `pobrano ${e.fetchedAt.slice(0, 10)}`;
  return `${sourceLabels[e.source]} – ${statusLabels[e.status]} (${when}${e.isStale ? ', możliwe nieaktualne' : ''})`;
}

function placeSummary(p: Place): Record<string, unknown> {
  return {
    id: p.id, name: p.name, kind: p.kind, category: p.category, address: p.address, coordinate: p.coordinate, distanceM: p.distanceM,
    osmWheelchair: p.accessibility.wheelchair ?? 'brak danych',
    evidence: p.evidence.map(describeEvidence),
  };
}

function facilitySummary(f: Facility): Record<string, unknown> {
  const amen = (v: boolean | null) => (v === null ? 'brak danych' : v ? 'deklarowane: tak' : 'deklarowane: nie');
  return {
    id: f.id, name: f.name, benefit: f.benefit, address: f.address, phone: f.phone, coordinate: f.coordinate, distanceM: f.distanceM,
    coordsValid: f.coordsValid, amenities: { ramp: amen(f.amenities.ramp), toilet: amen(f.amenities.toilet), elevator: amen(f.amenities.elevator), carPark: amen(f.amenities.carPark) },
    dataMonth: f.dataMonth, psozUrl: f.psozUrl, evidence: f.evidence.map(describeEvidence),
    note: 'Udogodnienia to deklaracja świadczeniodawcy – nie zostały sprawdzone w terenie.',
  };
}

function barrierSummary(b: Barrier): Record<string, unknown> {
  return {
    id: b.id, type: b.type, title: b.title, state: b.state, blocksRouting: b.blocksRouting, coordinate: b.coordinate, isDemo: b.isDemo,
    confirmations: b.confirmationCount, rejections: b.rejectionCount, validUntil: b.validUntil, evidence: b.evidence.map(describeEvidence),
  };
}

export async function runTool(name: ToolName, rawArgs: unknown, t: ToolContext): Promise<ToolOutcome> {
  const schema = toolSchemas[name];
  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { result: { error: 'invalid_arguments', issues: parsed.error.issues }, citations: [], places: [], destination: null };
  const args = parsed.data as never;
  const near = t.coordinate ? { lon: t.coordinate.longitude, lat: t.coordinate.latitude } : null;
  switch (name) {
    case 'search_places': {
      const a = args as z.infer<typeof toolSchemas.search_places>;
      const places = await t.ctx.places.search(a.query, near, a.limit);
      const facilities = await t.ctx.facilities.list({ query: a.query, near: near ?? undefined, limit: 3 });
      const all: Place[] = [...places, ...facilities];
      return { result: { places: places.map(placeSummary), facilities: facilities.map(facilitySummary) }, citations: all.flatMap((p) => p.evidence), places: all, destination: null };
    }
    case 'find_facilities': {
      const a = args as z.infer<typeof toolSchemas.find_facilities>;
      const facilities = await t.ctx.facilities.list({ benefit: a.benefit, query: a.query, near: near ?? undefined, limit: a.limit });
      return { result: { facilities: facilities.map(facilitySummary), userLocationKnown: near !== null }, citations: facilities.flatMap((f) => f.evidence), places: facilities, destination: null };
    }
    case 'barriers_near': {
      const a = args as z.infer<typeof toolSchemas.barriers_near>;
      const barriers = await t.ctx.barriers.near(a.longitude, a.latitude, a.radiusM, t.mode === 'demo');
      return { result: { barriers: barriers.map(barrierSummary) }, citations: barriers.flatMap((b) => b.evidence), places: [], destination: null };
    }
    case 'check_route': {
      const a = args as z.infer<typeof toolSchemas.check_route>;
      const destination = { latitude: a.destinationLatitude, longitude: a.destinationLongitude };
      if (!t.coordinate) return { result: { error: 'user_location_unknown', hint: 'Użytkownik nie udostępnił pozycji – zaproponuj cel, aplikacja sama wyznaczy trasę po wyborze startu.' }, citations: [], places: [], destination: { coordinate: destination, name: a.destinationName } };
      if (!t.ctx.graph) return { result: { error: 'graph_unavailable' }, citations: [], places: [], destination: { coordinate: destination, name: a.destinationName } };
      const r = buildRoute(t.ctx.graph, t.ctx.layer.forMode(t.mode), t.coordinate, destination, t.preferences, t.mode);
      if (!r.ok) return { result: { noRoute: r.details.details }, citations: [], places: [], destination: { coordinate: destination, name: a.destinationName } };
      const route = r.route;
      return {
        result: {
          distanceM: route.distanceM, durationSeconds: route.durationSeconds, unknownSurfaceM: route.unknownDistanceM, uncertainM: route.uncertainDistanceM,
          warnings: route.warnings, barriers: route.barriers.map(barrierSummary), destinationSnap: route.destinationSnap,
          segmentsWithoutSurfaceData: route.segments.filter((s) => s.missingFields.includes('surface')).length, segments: route.segments.length,
        },
        citations: route.barriers.flatMap((b) => b.evidence), places: [], destination: { coordinate: destination, name: a.destinationName },
      };
    }
    case 'source_status': {
      const s = await sourcesStatus(t.ctx.db, t.ctx.version, t.mode, { edges: t.ctx.graph?.edges.length ?? 0 });
      return { result: s, citations: [], places: [], destination: null };
    }
  }
}
