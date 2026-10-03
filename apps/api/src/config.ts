const env = process.env;

function int(name: string, fallback: number): number {
  const v = env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  databaseUrl: env.DATABASE_URL ?? 'postgres://pewnyszlak:pewnyszlak@localhost:5432/pewnyszlak',
  port: int('PORT', 4000),
  host: env.HOST ?? '0.0.0.0',
  corsOrigin: env.CORS_ORIGIN ?? '*',
  operatorToken: env.OPERATOR_TOKEN || null,
  rateLimits: {
    reportsPerHour: int('RATE_LIMIT_REPORTS_PER_HOUR', 20),
    assistantPerHour: int('RATE_LIMIT_ASSISTANT_PER_HOUR', 60),
    routesPerMinute: int('RATE_LIMIT_ROUTES_PER_MINUTE', 120),
  },
  openai: {
    apiKey: env.OPENAI_API_KEY || null,
    model: env.OPENAI_MODEL || null,
    baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  },
  sources: {
    zdyktyMcpUrl: env.ZDYKTY_MCP_URL || 'https://z-dykty.pl/api/mcp',
    psozMcpUrl: env.PSOZ_MCP_URL || 'https://psoz.pl/api/mcp',
    nfzApiUrl: (env.NFZ_API_URL || 'https://api.nfz.gov.pl/app-itl-api').replace(/\/$/, ''),
    nfzBenefits: (env.NFZ_BENEFITS || 'PORADNIA REHABILITACYJNA').split(';').map((s) => s.trim()).filter(Boolean),
    nfzProvince: env.NFZ_PROVINCE || '06',
    krakowTeryt: env.KRAKOW_TERYT || '1261011',
    osmPbfUrl: env.OSM_PBF_URL || 'https://download.geofabrik.de/europe/poland/malopolskie-latest.osm.pbf',
    dataDir: env.DATA_DIR || './data',
    importerCmd: env.IMPORTER_CMD || '.venv/bin/python services/importer/import_osm.py',
    osmCron: env.SYNC_OSM_CRON || '0 3 * * 1',
    sourcesCron: env.SYNC_SOURCES_CRON || '30 4 * * *',
  },
  /** Po ilu miesiącach bez zmiany traktujemy dane OSM jako potencjalnie nieaktualne. */
  staleAfterMonths: int('STALE_AFTER_MONTHS', 24),
  /** Prędkość marszu/jazdy przyjmowana do szacowania czasu (m/s). */
  speedMps: Number(env.SPEED_MPS || 1.0),
  barrierRefreshSeconds: int('BARRIER_REFRESH_SECONDS', 60),
  isTest: env.NODE_ENV === 'test',
};
export type Config = typeof config;
