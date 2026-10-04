import { terrainProfile } from './terrain/nmt.ts';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  assistantRequestSchema, dataModeSchema, exploreRequestSchema, feedbackRequestSchema, preferencesSchema, reportRequestSchema, routeRequestSchema,
  type ApiError, type DataMode, type Place, type RouteSegment,
} from '@pewnyszlak/domain';
import { AssistantService } from './assistant/service.ts';
import { config } from './config.ts';
import type { AppContext } from './context.ts';
import { evaluateEdge } from './graph/cost.ts';
import { accessibilityCoverage, edgeFacts } from './graph/edge-facts.ts';
import { exploreAround } from './graph/explore.ts';
import { nearbyHeritage } from './places/msip-heritage.ts';
import { mergeVerifiedPlaces } from './demo/verified-places.ts';
import { haversineM } from './graph/geo.ts';
import { buildRoute, osmWayEvidence } from './graph/route.ts';
import { sourcesStatus } from './sources/status.ts';

function modeOf(req: FastifyRequest): DataMode {
  const header = req.headers['x-data-mode'];
  const q = (req.query as Record<string, string | undefined>)?.mode;
  const parsed = dataModeSchema.safeParse((Array.isArray(header) ? header[0] : header) ?? q ?? 'live');
  return parsed.success ? parsed.data : 'live';
}

function fail(reply: FastifyReply, status: number, code: string, message: string, details?: unknown) {
  const body: ApiError = { error: { code, message, ...(details !== undefined ? { details } : {}) } };
  return reply.status(status).send(body);
}

const bboxSchema = z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
const numStr = z.coerce.number();

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.isTest ? false : { level: 'info' }, bodyLimit: 256 * 1024, trustProxy: true });
  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()), methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['content-type', 'x-data-mode', 'x-installation-id', 'x-operator-token'] });
  await app.register(rateLimit, { global: false });
  const assistant = new AssistantService(ctx);

  app.setErrorHandler((error: unknown, _req, reply) => {
    if (error instanceof z.ZodError) return fail(reply, 400, 'VALIDATION', 'Nieprawidłowe dane wejściowe.', error.issues);
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return fail(reply, 429, 'RATE_LIMIT', 'Zbyt wiele żądań – spróbuj za chwilę.');
    if (status && status < 500) return fail(reply, status, 'BAD_REQUEST', error instanceof Error ? error.message : 'Błędne żądanie.');
    ctx.log.error(error instanceof Error ? error.stack ?? error.message : String(error));
    return fail(reply, 500, 'INTERNAL', 'Błąd serwera.');
  });

  app.get('/v1/health', async () => ({
    ok: true,
    graph: ctx.graph ? { version: ctx.graph.meta.version, nodes: ctx.graph.nodeCount, edges: ctx.graph.edges.length, dataTimestamp: ctx.graph.meta.dataTimestamp } : null,
    barriers: ctx.layer.all.length,
    assistant: assistant.llmEnabled ? 'llm' : 'rules',
    time: new Date().toISOString(),
  }));

  app.get('/v1/sources', async (req) => sourcesStatus(ctx.db, ctx.version, modeOf(req), { edges: ctx.graph?.edges.length ?? 0 }));

  app.get('/v1/coverage', async (_req, reply) => {
    if (!ctx.graph) return fail(reply, 503, 'NO_GRAPH', 'Graf nie został jeszcze zaimportowany.');
    const r = await ctx.db.query(`select ST_AsGeoJSON(ST_Simplify(boundary, 0.0005))::json as geom from graph_versions where id = $1`, [ctx.graph.meta.version]);
    return { version: ctx.graph.meta.version, bounds: ctx.graph.meta.bounds, boundary: r.rows[0]?.geom ?? null };
  });

  // Optional ground elevation profile. Bounded requests, no automatic routing changes.
  app.post('/v1/terrain/profile', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = z.object({ points: z.array(z.object({ latitude: z.number().min(49.9).max(50.22), longitude: z.number().min(19.7).max(20.3) })).min(2).max(100) }).parse(req.body);
    try { return await terrainProfile(body.points); }
    catch { return fail(reply, 503, 'TERRAIN_UNAVAILABLE', 'Profil NMT jest chwilowo niedostępny. Trasa i dane o barierach pozostają dostępne.'); }
  });

  // --- miejsca i placówki ---
  app.get('/v1/places', async (req) => {
    const q = z.object({ q: z.string().min(1).max(120), lat: numStr.optional(), lon: numStr.optional(), limit: numStr.min(1).max(25).default(10) }).parse(req.query);
    const near = q.lat !== undefined && q.lon !== undefined ? { lat: q.lat, lon: q.lon } : null;
    const [places, facilities] = await Promise.all([ctx.places.search(q.q, near, q.limit), ctx.facilities.list({ query: q.q, near: near ?? undefined, limit: 3 })]);
    const items: Place[] = [...places, ...facilities];
    return { items, mode: modeOf(req) };
  });

  app.get('/v1/places/reverse', async (req) => {
    const q = z.object({ lat: numStr, lon: numStr }).parse(req.query);
    const place = await ctx.places.reverse(q.lon, q.lat);
    return { place };
  });

  app.get('/v1/places/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().max(100) }).parse(req.params);
    const place = id.startsWith('f-') ? await ctx.facilities.byId(id) : await ctx.places.byId(id);
    if (!place) return fail(reply, 404, 'NOT_FOUND', 'Nie znaleziono miejsca.');
    const barriers = place.coordinate ? await ctx.barriers.near(place.coordinate.longitude, place.coordinate.latitude, 60, modeOf(req) === 'demo') : [];
    return { place, barriers };
  });

  app.get('/v1/facilities', async (req) => {
    const q = z.object({ benefit: z.string().max(120).optional(), q: z.string().max(120).optional(), lat: numStr.optional(), lon: numStr.optional(), limit: numStr.min(1).max(50).default(20), includeInvalid: z.coerce.boolean().default(false) }).parse(req.query);
    const near = q.lat !== undefined && q.lon !== undefined ? { lat: q.lat, lon: q.lon } : undefined;
    const items = await ctx.facilities.list({ benefit: q.benefit ?? (q.q ? undefined : config.sources.nfzBenefits[0]), query: q.q, near, limit: q.limit, includeInvalid: q.includeInvalid });
    const benefits = await ctx.facilities.benefits();
    return { items, benefits };
  });

  // --- trasy ---
  app.post('/v1/routes', { config: { rateLimit: { max: config.rateLimits.routesPerMinute, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!ctx.graph) return fail(reply, 503, 'NO_GRAPH', 'Graf nie został jeszcze zaimportowany – routing niedostępny.');
    const body = routeRequestSchema.parse(req.body);
    const mode = modeOf(req);
    const result = buildRoute(ctx.graph, ctx.layer.forMode(mode), body.origin, body.destination, body.preferences, mode, body.waypoints);
    if (!result.ok) return fail(reply, 422, 'NO_ROUTE', result.details.details.explanation, result.details.details);
    return result.route;
  });

  // --- odkrywanie okolicy (comfort-first, bez celu) ---
  app.post('/v1/explore', { config: { rateLimit: { max: Math.max(30, Math.floor(config.rateLimits.routesPerMinute / 2)), timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!ctx.graph) return fail(reply, 503, 'NO_GRAPH', 'Graf nie został jeszcze zaimportowany.');
    const body = exploreRequestSchema.parse(req.body);
    const mode = modeOf(req);
    const near = { lon: body.origin.longitude, lat: body.origin.latitude };
    // OSM atrakcje + udogodnienia + zabytki MSIP + overlay sprawdzonych + bariery
    const sightLimit = body.radiusM >= 8_000 ? 40 : body.radiusM >= 3_000 ? 30 : 22;
    const [places, amenities, heritage, barriers] = await Promise.all([
      ctx.places.nearbySights(near.lon, near.lat, body.radiusM, sightLimit),
      ctx.places.nearbyAmenities(near.lon, near.lat, Math.min(body.radiusM, 2_000), 12),
      nearbyHeritage(near.lon, near.lat, Math.min(body.radiusM, 3_000)),
      ctx.barriers.near(near.lon, near.lat, Math.min(body.radiusM, 900), mode === 'demo'),
    ]);
    const merged = mergeVerifiedPlaces(
      [...places, ...amenities, ...heritage].sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0)),
      near,
      body.radiusM,
    ).slice(0, body.radiusM >= 8_000 ? 64 : 48);
    return exploreAround(ctx.graph, ctx.layer.forMode(mode), body, merged, barriers);
  });

  // --- szczegóły odcinka (po identyfikatorze krawędzi OSM way:seg) ---
  app.get('/v1/edges/:id', async (req, reply) => {
    if (!ctx.graph) return fail(reply, 503, 'NO_GRAPH', 'Graf niedostępny.');
    const { id } = z.object({ id: z.string().max(60) }).parse(req.params);
    const prefs = preferencesSchema.parse(Object.fromEntries(Object.entries(req.query as Record<string, string>).filter(([k]) => k in preferencesSchema.shape).map(([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v)])));
    const edge = ctx.graph.edge(id);
    if (!edge) return fail(reply, 404, 'NOT_FOUND', 'Nie znaleziono odcinka.');
    const mode = modeOf(req);
    const layer = ctx.layer.forMode(mode);
    const ev = evaluateEdge(edge, prefs, layer);
    const mid = edge.coords[Math.floor(edge.coords.length / 2)]!;
    const nearBarriers = await ctx.barriers.near(mid[0], mid[1], 45, mode === 'demo');
    const barriers = [...new Map([...ev.barriers, ...nearBarriers].map((b) => [b.id, b])).values()];
    const evidenceBase = [osmWayEvidence(edge, ctx.graph), ...barriers.flatMap((b) => b.evidence)];
    const segment: RouteSegment = {
      id: edge.id, edgeIds: [edge.id], wayIds: [edge.wayId], name: edge.name ?? '', kind: edge.attrs.kind, geometry: { type: 'LineString', coordinates: edge.coords }, lengthM: Math.round(edge.lengthM * 10) / 10,
      accessibility: edge.attrs.access, estimatedFields: edge.attrs.estimated, missingFields: edge.attrs.missing, uncertain: ev.uncertain, evidence: evidenceBase, barriers, warnings: ev.warnings,
    };
    const facts = edgeFacts(edge.tags, edge.attrs);
    const coverage = accessibilityCoverage(edge.attrs.access, edge.attrs.missing);

    let terrain: { inclinePct: number | null; riseM: number | null; startM: number | null; endM: number | null; source: string; warning: string } | null = null;
    if (edge.attrs.access.incline == null && edge.coords.length >= 2) {
      try {
        const a = edge.coords[0]!;
        const b = edge.coords[edge.coords.length - 1]!;
        const profile = await Promise.race([
          terrainProfile([{ longitude: a[0], latitude: a[1] }, { longitude: b[0], latitude: b[1] }]),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
        ]);
        if (profile) {
          const z0 = profile.points[0]?.elevationM ?? null;
          const z1 = profile.points[1]?.elevationM ?? null;
          const run = Math.max(1, edge.lengthM);
          const rise = z0 != null && z1 != null ? z1 - z0 : null;
          const inclinePct = rise != null ? Math.round((Math.abs(rise) / run) * 1000) / 10 : null;
          terrain = {
            inclinePct,
            riseM: rise != null ? Math.round(rise * 10) / 10 : null,
            startM: z0,
            endM: z1,
            source: profile.source,
            warning: 'Szacunek z NMT (powierzchnia gruntu) – nie opisuje chodnika, schodów ani mostów. Nie zastępuje pomiaru w terenie.',
          };
          if (inclinePct != null) {
            facts.push({ id: 'nmt-incline', label: 'Nachylenie terenu (NMT)', value: `ok. ${inclinePct}% (Δ ${rise! >= 0 ? '+' : ''}${terrain.riseM} m na ${Math.round(run)} m)`, tone: inclinePct > 6 ? 'warn' : 'info', via: 'GUGiK NMT' });
          }
        }
      } catch { /* NMT opcjonalne */ }
    }

    const interestingTags = Object.fromEntries(
      Object.entries(edge.tags).filter(([k]) => !['source', 'source:geometry', 'created_by', 'check_date'].includes(k)).slice(0, 40),
    );

    return {
      segment,
      evaluation: { excluded: ev.excluded, reason: ev.reason, factor: Number.isFinite(ev.factor) ? ev.factor : null },
      facts,
      coverage,
      terrain,
      tags: interestingTags,
      osm: { wayId: edge.wayId, version: edge.osmVersion, timestamp: edge.osmTimestamp },
    };
  });

  // --- bariery ---
  app.get('/v1/barriers', async (req) => {
    const q = z.object({ bbox: bboxSchema.optional(), lat: numStr.optional(), lon: numStr.optional(), radius: numStr.min(10).max(5000).default(500), includeResolved: z.coerce.boolean().default(false) }).parse(req.query);
    const mode = modeOf(req);
    if (q.bbox) {
      const [a, b, c, d] = q.bbox.split(',').map(Number) as [number, number, number, number];
      return { items: await ctx.barriers.inBbox(a, b, c, d, mode === 'demo', q.includeResolved), mode };
    }
    if (q.lat !== undefined && q.lon !== undefined) return { items: await ctx.barriers.near(q.lon, q.lat, q.radius, mode === 'demo'), mode };
    return { items: ctx.layer.forMode(mode).all.filter((x) => q.includeResolved || x.state !== 'resolved').slice(0, 500), mode };
  });

  app.get('/v1/barriers/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const barrier = await ctx.barriers.byId(id);
    if (!barrier) return fail(reply, 404, 'NOT_FOUND', 'Nie znaleziono bariery.');
    return { barrier };
  });

  const installationKey = (req: FastifyRequest) => {
    const h = req.headers['x-installation-id'];
    const body = req.body as { installationId?: string } | undefined;
    return (Array.isArray(h) ? h[0] : h) ?? body?.installationId ?? req.ip;
  };

  app.post('/v1/barriers', { config: { rateLimit: { max: config.rateLimits.reportsPerHour, timeWindow: '1 hour', keyGenerator: installationKey } } }, async (req, reply) => {
    const body = reportRequestSchema.parse(req.body);
    const mode = modeOf(req);
    if (ctx.graph) {
      const [minLon, minLat, maxLon, maxLat] = ctx.graph.meta.bounds;
      if (body.coordinate.longitude < minLon || body.coordinate.longitude > maxLon || body.coordinate.latitude < minLat || body.coordinate.latitude > maxLat) return fail(reply, 422, 'OUTSIDE_COVERAGE', 'Zgłoszenie poza obszarem pokrycia.');
    }
    const recent = await ctx.barriers.countRecentReports(body.installationId, 1);
    if (recent >= config.rateLimits.reportsPerHour) return fail(reply, 429, 'RATE_LIMIT', 'Limit zgłoszeń na godzinę został wyczerpany.');
    // Jeżeli nie wskazano odcinków, przypinamy zgłoszenie do najbliższej krawędzi (do 30 m) i węzła.
    let edgeIds = body.edgeIds.filter((e) => ctx.graph?.edge(e));
    let nodeIds: number[] = [];
    if (edgeIds.length === 0 && ctx.graph) {
      const hit = ctx.graph.snap(body.coordinate.longitude, body.coordinate.latitude, () => true, 30);
      if (hit) edgeIds = [hit.edge.id];
    }
    if (ctx.graph && edgeIds.length > 0) {
      // Bariera punktowa (np. winda, krawężnik) blisko końca odcinka dotyczy też węzła – wtedy blokuje wszystkie krawędzie w tym węźle.
      const g = ctx.graph;
      const edge = g.edge(edgeIds[0]!)!;
      nodeIds = [edge.from, edge.to]
        .filter((idx) => haversineM(g.lon[idx]!, g.lat[idx]!, body.coordinate.longitude, body.coordinate.latitude) < 12)
        .map((idx) => g.nodeId(idx));
    }
    const barrier = await ctx.barriers.createReport({ ...body, lon: body.coordinate.longitude, lat: body.coordinate.latitude, edgeIds, nodeIds, isDemo: mode === 'demo' });
    await ctx.refreshLayer();
    return reply.status(201).send({ barrier });
  });

  app.post('/v1/barriers/:id/feedback', { config: { rateLimit: { max: config.rateLimits.reportsPerHour * 3, timeWindow: '1 hour', keyGenerator: installationKey } } }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = feedbackRequestSchema.parse(req.body);
    const barrier = await ctx.barriers.feedback(id, body.installationId, body.action, body.comment);
    if (!barrier) return fail(reply, 404, 'NOT_FOUND', 'Nie znaleziono bariery.');
    await ctx.refreshLayer();
    return { barrier };
  });

  // --- asystent ---
  app.post('/v1/assistant', { config: { rateLimit: { max: config.rateLimits.assistantPerHour, timeWindow: '1 hour', keyGenerator: installationKey } } }, async (req) => {
    const body = assistantRequestSchema.parse(req.body);
    return assistant.answer(body, modeOf(req));
  });

  // --- operator (korekty) – wymaga tokenu ---
  app.register(async (op) => {
    op.addHook('onRequest', async (req, reply) => {
      const token = req.headers['x-operator-token'];
      if (!config.operatorToken || token !== config.operatorToken) return fail(reply, 401, 'UNAUTHORIZED', 'Brak uprawnień operatora.');
    });
    op.patch('/v1/operator/barriers/:id', async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const patch = z.object({ state: z.enum(['potential', 'active', 'resolved', 'disputed']).optional(), blocksRouting: z.boolean().optional(), edgeIds: z.array(z.string()).optional(), nodeIds: z.array(z.number()).optional(), validUntil: z.string().datetime().nullable().optional(), note: z.string().max(500).optional(), verify: z.boolean().optional() }).parse(req.body);
      const barrier = await ctx.barriers.operatorUpdate(id, 'http-operator', patch);
      if (!barrier) return fail(reply, 404, 'NOT_FOUND', 'Nie znaleziono bariery.');
      await ctx.refreshLayer();
      return { barrier };
    });
    op.delete('/v1/operator/barriers/:id', async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const ok = await ctx.barriers.deleteBarrier(id, 'http-operator');
      if (!ok) return fail(reply, 404, 'NOT_FOUND', 'Nie znaleziono bariery.');
      await ctx.refreshLayer();
      return { ok: true };
    });
    op.post('/v1/operator/graph/reload', async () => { await ctx.reloadGraph(); return { version: ctx.graph?.meta.version ?? null }; });
  });

  return app;
}
