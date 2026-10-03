-- PewnySzlak – schemat bazy (idempotentny; uruchamiany przez API i importer).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Wersjonowane importy grafu OSM. Tylko jedna wersja ma status 'ready' i is_active = true.
CREATE TABLE IF NOT EXISTS graph_versions (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('importing', 'ready', 'failed', 'archived')),
  is_active boolean NOT NULL DEFAULT false,
  source_file text,
  source_url text,
  osm_data_timestamp timestamptz,
  coverage text NOT NULL DEFAULT 'Kraków + bufor 2 km',
  bounds jsonb,
  boundary geometry(MultiPolygon, 4326),
  node_count integer,
  edge_count integer,
  place_count integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS graph_versions_one_active ON graph_versions (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS graph_nodes (
  version_id text NOT NULL REFERENCES graph_versions (id) ON DELETE CASCADE,
  id bigint NOT NULL,
  lon double precision NOT NULL,
  lat double precision NOT NULL,
  tags jsonb,
  osm_timestamp timestamptz,
  PRIMARY KEY (version_id, id)
);

CREATE TABLE IF NOT EXISTS graph_edges (
  version_id text NOT NULL REFERENCES graph_versions (id) ON DELETE CASCADE,
  id text NOT NULL,
  way_id bigint NOT NULL,
  from_node bigint NOT NULL,
  to_node bigint NOT NULL,
  name text,
  length_m real NOT NULL,
  tags jsonb NOT NULL,
  osm_timestamp timestamptz,
  osm_version integer,
  geom geometry(LineString, 4326) NOT NULL,
  PRIMARY KEY (version_id, id)
);
CREATE INDEX IF NOT EXISTS graph_edges_geom_idx ON graph_edges USING gist (geom);
CREATE INDEX IF NOT EXISTS graph_edges_way_idx ON graph_edges (version_id, way_id);

-- Miejsca i adresy do lokalnego wyszukiwania.
CREATE TABLE IF NOT EXISTS places (
  version_id text NOT NULL REFERENCES graph_versions (id) ON DELETE CASCADE,
  id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('place', 'address')),
  name text NOT NULL,
  category text,
  address text,
  lon double precision NOT NULL,
  lat double precision NOT NULL,
  tags jsonb NOT NULL,
  osm_timestamp timestamptz,
  search_text text NOT NULL,
  geom geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (version_id, id)
);
CREATE INDEX IF NOT EXISTS places_search_trgm ON places USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS places_geom_idx ON places USING gist (geom);

-- Indeks nazw ulic do dopasowywania sygnałów z przetargów.
CREATE TABLE IF NOT EXISTS streets (
  version_id text NOT NULL REFERENCES graph_versions (id) ON DELETE CASCADE,
  name text NOT NULL,
  name_norm text NOT NULL,
  edge_ids text[] NOT NULL,
  lon double precision NOT NULL,
  lat double precision NOT NULL,
  length_m real NOT NULL,
  PRIMARY KEY (version_id, name_norm)
);
CREATE INDEX IF NOT EXISTS streets_norm_trgm ON streets USING gin (name_norm gin_trgm_ops);

-- Bariery: warstwa niezależna od wersji grafu (odnosi się do identyfikatorów OSM, które są stabilne).
CREATE TABLE IF NOT EXISTS barriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  lon double precision,
  lat double precision,
  geom geometry(Point, 4326),
  edge_ids text[] NOT NULL DEFAULT '{}',
  node_ids bigint[] NOT NULL DEFAULT '{}',
  state text NOT NULL CHECK (state IN ('potential', 'active', 'resolved', 'disputed')),
  blocks_routing boolean NOT NULL DEFAULT false,
  valid_from timestamptz,
  valid_until timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  origin_source text NOT NULL,
  origin_source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS barriers_geom_idx ON barriers USING gist (geom);
CREATE INDEX IF NOT EXISTS barriers_state_idx ON barriers (state, is_demo);
CREATE UNIQUE INDEX IF NOT EXISTS barriers_origin_idx ON barriers (origin_source, origin_source_id) WHERE origin_source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS barrier_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barrier_id uuid NOT NULL REFERENCES barriers (id) ON DELETE CASCADE,
  source text NOT NULL,
  source_id text NOT NULL,
  source_url text,
  status text NOT NULL,
  description text,
  updated_at timestamptz,
  observed_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  installation_hash text
);
CREATE INDEX IF NOT EXISTS barrier_evidence_barrier_idx ON barrier_evidence (barrier_id);

CREATE TABLE IF NOT EXISTS barrier_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barrier_id uuid NOT NULL REFERENCES barriers (id) ON DELETE CASCADE,
  installation_hash text NOT NULL,
  action text NOT NULL CHECK (action IN ('confirm', 'reject', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barrier_id, installation_hash, action)
);

-- Sygnały z przetargów (z-dykty / BZP) – przechowujemy dowody, nawet gdy nie da się ich zlokalizować.
CREATE TABLE IF NOT EXISTS tender_signals (
  id text PRIMARY KEY,
  title text NOT NULL,
  buyer text,
  kind text,
  notice_type text,
  published_on date,
  deadline date,
  source_url text,
  matched_street text,
  matched_edge_ids text[] NOT NULL DEFAULT '{}',
  relevance text NOT NULL CHECK (relevance IN ('pedestrian', 'possible', 'none')),
  barrier_id uuid REFERENCES barriers (id) ON DELETE SET NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL
);

-- Placówki NFZ (ITL) wraz z dopasowaniem do PSOZ.
CREATE TABLE IF NOT EXISTS facilities (
  id text PRIMARY KEY,
  benefit text NOT NULL,
  provider text NOT NULL,
  provider_code text,
  place_name text,
  address text,
  locality text,
  phone text,
  lon double precision,
  lat double precision,
  geom geometry(Point, 4326),
  coords_valid boolean NOT NULL DEFAULT false,
  coords_check text,
  toilet boolean,
  ramp boolean,
  elevator boolean,
  car_park boolean,
  data_month text,
  nfz_updated_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  psoz_slug text,
  psoz_family text,
  psoz_url text,
  psoz_fetched_at timestamptz,
  psoz_meta jsonb,
  raw jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS facilities_geom_idx ON facilities USING gist (geom);
CREATE INDEX IF NOT EXISTS facilities_benefit_idx ON facilities (benefit);

-- Historia uruchomień źródeł.
CREATE TABLE IF NOT EXISTS source_runs (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean,
  message text,
  record_count integer
);
CREATE INDEX IF NOT EXISTS source_runs_source_idx ON source_runs (source, started_at DESC);

-- Rejestr działań operatora.
CREATE TABLE IF NOT EXISTS operator_log (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

