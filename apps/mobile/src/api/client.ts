import type {
  TerrainProfileResult, AssistantRequest, AssistantResponse, Barrier, Coordinate, DataMode, ExploreResponse, Facility, FeedbackRequest, Place, Preferences, ReportRequest, RouteResult, RouteSegment, SourcesResponse, NoRouteDetails,
} from '@pewnyszlak/domain';
import { Platform } from 'react-native';

const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_URL).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
  get isOffline(): boolean { return this.status === 0; }
  get noRoute(): NoRouteDetails | null { return this.code === 'NO_ROUTE' ? (this.details as NoRouteDetails) : null; }
}

type Ctx = { mode: DataMode; installationId: string };
let ctx: Ctx = { mode: 'live', installationId: '' };
export const setApiContext = (c: Ctx) => { ctx = c; };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-data-mode': ctx.mode, 'x-installation-id': ctx.installationId, ...(init.headers ?? {}) },
    });
  } catch (e) {
    throw new ApiError(0, 'OFFLINE', 'Brak połączenia z serwerem PewnySzlak. Sprawdź internet; ostatnia trasa jest zapisana w aplikacji.', e);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? `Błąd serwera (${res.status}).`, err?.details);
  }
  return body as T;
}

const qs = (params: Record<string, string | number | boolean | undefined>) =>
  Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');

export const api = {
  terrain: (points: Coordinate[]) => request<TerrainProfileResult>('/v1/terrain/profile', { method: 'POST', body: JSON.stringify({ points }) }),
  health: () => request<{ ok: boolean; graph: { version: string | null; nodes: number; edges: number } }>('/v1/health'),
  sources: () => request<SourcesResponse>('/v1/sources'),
  explore: (origin: Coordinate, preferences: Preferences, radiusM = 600) => request<ExploreResponse>('/v1/explore', { method: 'POST', body: JSON.stringify({ origin, preferences, radiusM }) }),
  searchPlaces: (q: string, near?: Coordinate | null) => request<{ items: Place[] }>(`/v1/places?${qs({ q, lat: near?.latitude, lon: near?.longitude, limit: 10 })}`),
  reverse: (c: Coordinate) => request<{ place: Place | null }>(`/v1/places/reverse?${qs({ lat: c.latitude, lon: c.longitude })}`),
  place: (id: string) => request<{ place: Place | Facility; barriers: Barrier[] }>(`/v1/places/${encodeURIComponent(id)}`),
  facilities: (params: { benefit?: string; q?: string; near?: Coordinate | null }) => request<{ items: Facility[]; benefits: string[] }>(`/v1/facilities?${qs({ benefit: params.benefit, q: params.q, lat: params.near?.latitude, lon: params.near?.longitude })}`),
  route: (origin: Coordinate, destination: Coordinate, preferences: Preferences, waypoints: Coordinate[] = []) => request<RouteResult>('/v1/routes', { method: 'POST', body: JSON.stringify({ origin, destination, waypoints, preferences }) }),
  edge: (id: string, preferences: Preferences) => request<{
    segment: RouteSegment;
    evaluation: { excluded: boolean; reason: string | null; factor: number | null };
    facts: { id: string; label: string; value: string; tone: 'ok' | 'warn' | 'muted' | 'info' | 'danger'; via: string }[];
    coverage: { known: number; total: number; label: string };
    terrain: { inclinePct: number | null; riseM: number | null; startM: number | null; endM: number | null; source: string; warning: string } | null;
    tags: Record<string, string>;
    osm: { wayId: number; version: number | null; timestamp: string | null };
  }>(`/v1/edges/${encodeURIComponent(id)}?${qs(preferences as unknown as Record<string, string | number | boolean>)}`),
  barriersInBbox: (bbox: [number, number, number, number], includeResolved = false) => request<{ items: Barrier[] }>(`/v1/barriers?${qs({ bbox: bbox.join(','), includeResolved })}`),
  barriersNear: (c: Coordinate, radius = 500) => request<{ items: Barrier[] }>(`/v1/barriers?${qs({ lat: c.latitude, lon: c.longitude, radius })}`),
  barrier: (id: string) => request<{ barrier: Barrier }>(`/v1/barriers/${id}`),
  report: (body: ReportRequest) => request<{ barrier: Barrier }>('/v1/barriers', { method: 'POST', body: JSON.stringify(body) }),
  feedback: (id: string, body: FeedbackRequest) => request<{ barrier: Barrier }>(`/v1/barriers/${id}/feedback`, { method: 'POST', body: JSON.stringify(body) }),
  assistant: (body: AssistantRequest) => request<AssistantResponse>('/v1/assistant', { method: 'POST', body: JSON.stringify(body) }),
};
