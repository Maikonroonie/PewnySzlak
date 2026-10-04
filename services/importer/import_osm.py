#!/usr/bin/env python3
"""
PewnySzlak – importer OSM (pyosmium).

Wycina Kraków (relacja administracyjna) z buforem z regionalnego pliku PBF, buduje graf pieszy
z topologii OSM (połączenia tylko przez wspólne węzły – wiadukty i tunele nie łączą się na skrzyżowaniach
rysunkowych), zachowuje identyfikatory, tagi i daty OSM, i zapisuje wszystko jako nową, wersjonowaną
partię w PostgreSQL/PostGIS. Poprzednia wersja pozostaje aktywna do chwili pomyślnego zakończenia importu.

Użycie:
  python import_osm.py --pbf data/osm/malopolskie-latest.osm.pbf --database-url postgres://...
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import osmium
import psycopg
import shapely
import shapely.ops
import shapely.wkb
from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.prepared import prep

KRAKOW_RELATION_ID = 449696  # relation admin boundary "Kraków"
# Awaryjny bbox (gdy relacji nie ma w pliku): Kraków z zapasem.
FALLBACK_BBOX = (19.74, 49.95, 20.26, 50.15)

HIGHWAY_EXCLUDED = {
    "motorway", "trunk", "motorway_link", "trunk_link", "raceway", "bus_guideway", "busway",
    "construction", "proposed", "abandoned", "razed", "planned", "services", "rest_area", "escape",
}
HIGHWAY_ALLOWED = {
    "footway", "path", "pedestrian", "steps", "living_street", "residential", "service", "unclassified",
    "tertiary", "tertiary_link", "secondary", "secondary_link", "primary", "primary_link", "track",
    "cycleway", "corridor", "road", "crossing", "elevator", "bridleway", "platform",
}
MAJOR_ROADS = {"primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link"}

# Węzły, przy których dzielimy drogi, aby bariery punktowe stały się wierzchołkami grafu.
SPLIT_NODE_KEYS = ("barrier", "kerb", "kerb:height", "wheelchair")
SPLIT_NODE_HIGHWAY = {"crossing", "elevator", "steps", "traffic_signals"}

POI_KEYS = ("amenity", "shop", "tourism", "leisure", "healthcare", "office", "historic", "public_transport", "railway", "building", "man_made", "craft", "sport", "emergency")
POI_SKIP_VALUES = {
    "amenity": {"parking", "parking_space", "bench", "waste_basket", "bicycle_parking", "vending_machine", "recycling", "parking_entrance", "waste_disposal", "grit_bin", "charging_station", "bus_station"},
    "building": {"yes", "house", "apartments", "residential", "garage", "garages", "shed", "roof", "detached", "terrace", "industrial", "warehouse", "service", "hut", "construction", "semidetached_house", "bungalow"},
    "railway": {"switch", "buffer_stop", "level_crossing", "signal", "crossing", "milestone", "rail", "tram", "subway", "razed", "disused", "abandoned", "tram_stop", "halt", "station", "subway_entrance", "stop"},
    "public_transport": {"stop_position", "platform", "stop_area", "station"},
    "man_made": {"surveillance", "manhole", "utility_pole", "street_cabinet", "flagpole", "pipeline", "pole", "mast", "monitoring_station"},
    "emergency": {"fire_hydrant", "defibrillator"},
    "leisure": {"picnic_table", "slipway"},
}
POI_KEYS_REQUIRE_NAME = set(POI_KEYS)

transformer_to_m = Transformer.from_crs("EPSG:4326", "EPSG:2180", always_xy=True)
transformer_to_deg = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True)


def log(msg: str) -> None:
    print(f"[importer {datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def norm_text(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower().replace("ł", "l"))
    return re.sub(r"\s+", " ", s).strip()


def strip_street_prefix(name: str) -> str:
    return re.sub(r"^(ulica|ul\.|aleja|al\.|plac|pl\.|osiedle|os\.|rondo|bulwar|most|skwer|droga)\s+", "", name.strip(), flags=re.I)


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def ts_or_none(obj) -> datetime | None:
    try:
        ts = obj.timestamp
    except Exception:
        return None
    if ts is None or ts.year < 2000:
        return None
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


def is_pedestrian_way(tags: dict[str, str]) -> bool:
    hw = tags.get("highway")
    if not hw or hw in HIGHWAY_EXCLUDED or hw not in HIGHWAY_ALLOWED:
        return False
    if tags.get("area") == "yes" and hw not in ("pedestrian", "footway"):
        return False
    foot = tags.get("foot")
    access = tags.get("access")
    if foot in ("no", "private", "use_sidepath") and hw != "steps":
        return False
    if foot is None and access in ("no", "private", "customers", "military", "delivery", "agricultural", "forestry") and hw not in ("footway", "pedestrian", "steps", "crossing"):
        return False
    if hw in MAJOR_ROADS and tags.get("sidewalk") in ("separate", "no", "none") and foot not in ("yes", "designated"):
        return False
    if hw in ("cycleway",) and foot in ("no", "use_sidepath"):
        return False
    if tags.get("indoor") == "yes" and hw not in ("corridor", "elevator", "steps", "footway"):
        return False
    return True


def node_is_split_point(tags: dict[str, str] | None) -> bool:
    if not tags:
        return False
    if any(k in tags for k in SPLIT_NODE_KEYS):
        return True
    return tags.get("highway") in SPLIT_NODE_HIGHWAY


def is_poi(tags: dict[str, str]) -> bool:
    if "name" not in tags:
        return False
    for key in POI_KEYS:
        v = tags.get(key)
        if v and v not in POI_SKIP_VALUES.get(key, set()):
            return True
    return False


def poi_category(tags: dict[str, str]) -> str | None:
    for key in POI_KEYS:
        v = tags.get(key)
        if v and v not in POI_SKIP_VALUES.get(key, set()):
            return f"{key}={v}"
    return None


def address_text(tags: dict[str, str]) -> str | None:
    number = tags.get("addr:housenumber")
    street = tags.get("addr:street") or tags.get("addr:place")
    if not number or not street:
        return None
    return f"{street} {number}"


@dataclass
class Way:
    id: int
    tags: dict[str, str]
    refs: list[int]
    coords: list[tuple[float, float]]
    timestamp: datetime | None
    version: int | None


@dataclass
class Stats:
    nodes_seen: int = 0
    ways_seen: int = 0
    ways_kept: int = 0
    pois: int = 0
    addresses: int = 0
    edges: int = 0
    vertices: int = 0
    extras: dict = field(default_factory=dict)


def load_boundary(pbf: str, relation_id: int) -> MultiPolygon | None:
    log(f"Pass 1/2: boundary relation {relation_id}")
    fab = osmium.geom.WKBFactory()
    fp = (
        osmium.FileProcessor(pbf)
        .with_areas(osmium.filter.IdFilter([relation_id]).enable_for(osmium.osm.RELATION))
        .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
    )
    for area in fp:
        if area.from_way() or area.orig_id() != relation_id:
            continue
        geom = shapely.wkb.loads(bytes.fromhex(fab.create_multipolygon(area)))
        if geom.geom_type == "Polygon":
            geom = MultiPolygon([geom])
        return geom
    return None


def buffer_geom(geom, km: float):
    proj = shapely.ops.transform(transformer_to_m.transform, geom)
    buffered = proj.buffer(km * 1000.0)
    return shapely.ops.transform(transformer_to_deg.transform, buffered)


def run(args) -> int:
    t0 = time.time()
    pbf = args.pbf
    if not os.path.exists(pbf):
        log(f"Plik PBF nie istnieje: {pbf}")
        return 2

    boundary = load_boundary(pbf, args.boundary_relation)
    if boundary is None:
        log("Nie znaleziono relacji granicy – używam awaryjnego bbox.")
        boundary = MultiPolygon([box(*FALLBACK_BBOX)])
    buffered = buffer_geom(boundary, args.buffer_km)
    bminx, bminy, bmaxx, bmaxy = buffered.bounds
    prepared = prep(buffered)
    log(f"Granica: bbox bufor = {bminx:.4f},{bminy:.4f},{bmaxx:.4f},{bmaxy:.4f}; pole {buffered.area:.4f} deg²")

    def in_bbox(lon: float, lat: float) -> bool:
        return bminx <= lon <= bmaxx and bminy <= lat <= bmaxy

    stats = Stats()
    node_tags: dict[int, tuple[dict[str, str], datetime | None]] = {}
    ways: list[Way] = []
    pois: dict[str, dict] = {}
    addresses: dict[str, dict] = {}
    osm_data_ts: datetime | None = None

    log("Pass 2/2: nodes + ways")
    fp = osmium.FileProcessor(pbf).with_locations().with_filter(osmium.filter.EntityFilter(osmium.osm.NODE | osmium.osm.WAY))
    header = osmium.io.Reader(pbf).header()
    try:
        osm_ts = header.get("osmosis_replication_timestamp") or header.get("timestamp")
        if osm_ts:
            osm_data_ts = datetime.fromisoformat(osm_ts.replace("Z", "+00:00"))
    except Exception:
        osm_data_ts = None

    for obj in fp:
        if obj.is_node():
            stats.nodes_seen += 1
            if len(obj.tags) == 0:
                continue
            loc = obj.location
            if not loc.valid() or not in_bbox(loc.lon, loc.lat):
                continue
            tags = dict(obj.tags)
            ts = ts_or_none(obj)
            if node_is_split_point(tags) or "entrance" in tags or tags.get("highway") in ("elevator", "steps", "crossing") or is_poi(tags) or "addr:housenumber" in tags:
                node_tags[obj.id] = (tags, ts)
            if is_poi(tags) and prepared.contains(Point(loc.lon, loc.lat)):
                pid = f"n{obj.id}"
                pois[pid] = {"id": pid, "name": tags["name"], "category": poi_category(tags), "address": address_text(tags), "lon": loc.lon, "lat": loc.lat, "tags": tags, "ts": ts}
            addr = address_text(tags)
            if addr and prepared.contains(Point(loc.lon, loc.lat)):
                key = norm_text(addr)
                if key not in addresses:
                    addresses[key] = {"id": f"a-n{obj.id}", "name": addr, "category": "address", "address": addr, "lon": loc.lon, "lat": loc.lat, "tags": tags, "ts": ts}
            continue

        if not obj.is_way():
            continue
        stats.ways_seen += 1
        tags = dict(obj.tags)
        nodes = obj.nodes
        if len(nodes) < 2:
            continue
        coords: list[tuple[float, float]] = []
        refs: list[int] = []
        any_in_bbox = False
        for n in nodes:
            if not n.location.valid():
                coords = []
                break
            lon, lat = n.location.lon, n.location.lat
            coords.append((lon, lat))
            refs.append(n.ref)
            if not any_in_bbox and in_bbox(lon, lat):
                any_in_bbox = True
        if not coords or not any_in_bbox:
            continue

        pedestrian = is_pedestrian_way(tags)
        poi = is_poi(tags) and "highway" not in tags
        addr = address_text(tags) if "highway" not in tags else None
        if not (pedestrian or poi or addr):
            continue

        inside = any(prepared.contains(Point(c)) for c in (coords[0], coords[len(coords) // 2], coords[-1])) or any(prepared.contains(Point(c)) for c in coords)
        if not inside:
            continue
        ts = ts_or_none(obj)

        if pedestrian:
            ways.append(Way(obj.id, tags, refs, coords, ts, getattr(obj, "version", None)))
            stats.ways_kept += 1
        if poi or addr:
            try:
                geom = Polygon(coords) if refs[0] == refs[-1] and len(coords) >= 4 else LineString(coords)
                c = geom.representative_point() if geom.is_valid else geom.centroid
            except Exception:
                c = Point(coords[0])
            if poi:
                pid = f"w{obj.id}"
                pois[pid] = {"id": pid, "name": tags["name"], "category": poi_category(tags), "address": address_text(tags), "lon": c.x, "lat": c.y, "tags": tags, "ts": ts}
            if addr:
                key = norm_text(addr)
                if key not in addresses:
                    addresses[key] = {"id": f"a-w{obj.id}", "name": addr, "category": "address", "address": addr, "lon": c.x, "lat": c.y, "tags": tags, "ts": ts}

    stats.pois = len(pois)
    stats.addresses = len(addresses)
    log(f"Węzły: {stats.nodes_seen:,}; drogi: {stats.ways_seen:,}; zachowane drogi piesze: {stats.ways_kept:,}; POI: {stats.pois:,}; adresy: {stats.addresses:,} ({time.time()-t0:.0f}s)")

    # --- budowa grafu: wierzchołki = węzły wspólne dla ≥2 dróg, końce dróg, bariery punktowe ---
    usage: dict[int, int] = defaultdict(int)
    for w in ways:
        for r in w.refs:
            usage[r] += 1
    vertex_ids: set[int] = set()
    for w in ways:
        vertex_ids.add(w.refs[0])
        vertex_ids.add(w.refs[-1])
        for r in w.refs:
            if usage[r] > 1:
                vertex_ids.add(r)
            else:
                nt = node_tags.get(r)
                if nt and node_is_split_point(nt[0]):
                    vertex_ids.add(r)

    vertex_coords: dict[int, tuple[float, float]] = {}
    edges: list[tuple] = []
    streets: dict[str, dict] = {}
    for w in ways:
        start = 0
        seg = 0
        for i in range(1, len(w.refs)):
            if w.refs[i] in vertex_ids or i == len(w.refs) - 1:
                part_refs = w.refs[start:i + 1]
                part_coords = w.coords[start:i + 1]
                length = sum(haversine_m(*part_coords[k], *part_coords[k + 1]) for k in range(len(part_coords) - 1))
                if length <= 0:
                    start = i
                    continue
                eid = f"{w.id}:{seg}"
                vertex_coords[part_refs[0]] = part_coords[0]
                vertex_coords[part_refs[-1]] = part_coords[-1]
                wkt = "SRID=4326;LINESTRING(" + ",".join(f"{lon:.7f} {lat:.7f}" for lon, lat in part_coords) + ")"
                name = w.tags.get("name")
                edges.append((eid, w.id, part_refs[0], part_refs[-1], name, round(length, 2), json.dumps(w.tags, ensure_ascii=False), w.timestamp, w.version, wkt))
                if name:
                    key = norm_text(strip_street_prefix(name))
                    st = streets.setdefault(key, {"name": name, "edge_ids": [], "length": 0.0, "sx": 0.0, "sy": 0.0, "n": 0})
                    st["edge_ids"].append(eid)
                    st["length"] += length
                    mid = part_coords[len(part_coords) // 2]
                    st["sx"] += mid[0]
                    st["sy"] += mid[1]
                    st["n"] += 1
                start = i
                seg += 1
    stats.edges = len(edges)
    stats.vertices = len(vertex_coords)
    log(f"Graf: {stats.vertices:,} wierzchołków, {stats.edges:,} krawędzi, {len(streets):,} ulic ({time.time()-t0:.0f}s)")

    # --- zapis do bazy ---
    version_id = args.version_id or f"osm-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    bounds = [bminx, bminy, bmaxx, bmaxy]
    schema_sql = Path(args.schema).read_text(encoding="utf-8") if args.schema and os.path.exists(args.schema) else None

    with psycopg.connect(args.database_url) as conn:
        with conn.cursor() as cur:
            if schema_sql:
                cur.execute(schema_sql)
            cur.execute(
                "INSERT INTO graph_versions (id, status, source_file, source_url, osm_data_timestamp, bounds, boundary, notes) VALUES (%s, 'importing', %s, %s, %s, %s, ST_GeomFromText(%s, 4326), %s)",
                (version_id, os.path.basename(pbf), args.source_url, osm_data_ts, json.dumps(bounds), buffered.wkt if buffered.geom_type == "MultiPolygon" else MultiPolygon([buffered]).wkt, f"buffer_km={args.buffer_km}; relation={args.boundary_relation}"),
            )
        conn.commit()
        try:
            with conn.cursor() as cur:
                log("COPY graph_nodes")
                with cur.copy("COPY graph_nodes (version_id, id, lon, lat, tags, osm_timestamp) FROM STDIN") as cp:
                    for nid, (lon, lat) in vertex_coords.items():
                        nt = node_tags.get(nid)
                        cp.write_row((version_id, nid, lon, lat, json.dumps(nt[0], ensure_ascii=False) if nt else None, nt[1] if nt else None))
                log("COPY graph_edges")
                with cur.copy("COPY graph_edges (version_id, id, way_id, from_node, to_node, name, length_m, tags, osm_timestamp, osm_version, geom) FROM STDIN") as cp:
                    for e in edges:
                        cp.write_row((version_id, *e))
                log("COPY places")
                with cur.copy("COPY places (version_id, id, kind, name, category, address, lon, lat, tags, osm_timestamp, search_text, geom) FROM STDIN") as cp:
                    for p in pois.values():
                        search = norm_text(" ".join(filter(None, [p["name"], p.get("address") or "", (p.get("category") or "").split("=")[-1]])))
                        cp.write_row((version_id, p["id"], "place", p["name"], p["category"], p["address"], p["lon"], p["lat"], json.dumps(p["tags"], ensure_ascii=False), p["ts"], search, f"SRID=4326;POINT({p['lon']:.7f} {p['lat']:.7f})"))
                    for a in addresses.values():
                        cp.write_row((version_id, a["id"], "address", a["name"], "address", a["address"], a["lon"], a["lat"], json.dumps(a["tags"], ensure_ascii=False), a["ts"], norm_text(a["name"]), f"SRID=4326;POINT({a['lon']:.7f} {a['lat']:.7f})"))
                log("COPY streets")
                with cur.copy("COPY streets (version_id, name, name_norm, edge_ids, lon, lat, length_m) FROM STDIN") as cp:
                    for key, st in streets.items():
                        cp.write_row((version_id, st["name"], key, st["edge_ids"], st["sx"] / st["n"], st["sy"] / st["n"], round(st["length"], 1)))
                cur.execute(
                    "UPDATE graph_versions SET status = 'ready', node_count = %s, edge_count = %s, place_count = %s, finished_at = now() WHERE id = %s",
                    (stats.vertices, stats.edges, stats.pois + stats.addresses, version_id),
                )
            conn.commit()
            with conn.cursor() as cur:
                cur.execute("UPDATE graph_versions SET is_active = false, status = CASE WHEN status = 'ready' THEN 'archived' ELSE status END WHERE is_active")
                cur.execute("UPDATE graph_versions SET is_active = true WHERE id = %s", (version_id,))
                # zachowaj tylko 2 ostatnie archiwa
                cur.execute("DELETE FROM graph_versions WHERE status = 'archived' AND id NOT IN (SELECT id FROM graph_versions WHERE status = 'archived' ORDER BY created_at DESC LIMIT %s)", (args.keep_versions,))
                cur.execute("DELETE FROM graph_versions WHERE status = 'failed' AND created_at < now() - interval '7 days'")
            conn.commit()
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            with conn.cursor() as cur:
                cur.execute("UPDATE graph_versions SET status = 'failed', notes = %s, finished_at = now() WHERE id = %s", (f"{type(exc).__name__}: {exc}"[:2000], version_id))
            conn.commit()
            log(f"Import nieudany – poprzednia wersja pozostaje aktywna: {exc}")
            return 1

    log(f"Gotowe: wersja {version_id} aktywna ({time.time()-t0:.0f}s)")
    print(json.dumps({"versionId": version_id, "nodes": stats.vertices, "edges": stats.edges, "places": stats.pois + stats.addresses, "streets": len(streets), "seconds": round(time.time() - t0, 1)}))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pbf", required=True)
    p.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    p.add_argument("--schema", default=str(Path(__file__).resolve().parents[2] / "infra" / "db" / "schema.sql"))
    p.add_argument("--version-id")
    p.add_argument("--source-url", default=os.environ.get("OSM_PBF_URL"))
    p.add_argument("--buffer-km", type=float, default=2.0)
    p.add_argument("--boundary-relation", type=int, default=KRAKOW_RELATION_ID)
    p.add_argument("--keep-versions", type=int, default=1)
    args = p.parse_args()
    if not args.database_url:
        p.error("--database-url albo DATABASE_URL jest wymagane")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
