import type { Db } from '../db.ts';
import { Graph, type EdgeRecord, type NodeRecord } from './graph.ts';

export type ActiveVersion = { id: string; createdAt: string; dataTimestamp: string | null; coverage: string; bounds: [number, number, number, number]; nodeCount: number; edgeCount: number };

export async function activeVersion(db: Db): Promise<ActiveVersion | null> {
  const r = await db.query(
    `select id, created_at, osm_data_timestamp, coverage, bounds, node_count, edge_count from graph_versions where is_active and status = 'ready' limit 1`,
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    dataTimestamp: row.osm_data_timestamp,
    coverage: row.coverage,
    bounds: row.bounds,
    nodeCount: row.node_count,
    edgeCount: row.edge_count,
  };
}

export async function loadGraph(db: Db, log: (msg: string) => void = () => {}): Promise<Graph | null> {
  const version = await activeVersion(db);
  if (!version) return null;
  const t0 = Date.now();
  const nodesRes = await db.query(`select id, lon, lat, tags, osm_timestamp from graph_nodes where version_id = $1`, [version.id]);
  const nodes: NodeRecord[] = nodesRes.rows.map((r) => ({ id: r.id, lon: r.lon, lat: r.lat, tags: r.tags, osmTimestamp: r.osm_timestamp }));
  log(`graph: ${nodes.length} nodes in ${Date.now() - t0} ms`);
  const client = await db.connect();
  const edges: EdgeRecord[] = [];
  try {
    // Strumieniowo – 350 tys. wierszy z geometrią; kursor po 50 tys.
    await client.query('begin');
    await client.query(
      `declare edge_cur cursor for select id, way_id, from_node, to_node, name, length_m, tags, osm_timestamp, osm_version, ST_AsGeoJSON(geom)::json->'coordinates' as coords from graph_edges where version_id = $1`,
      [version.id],
    );
    for (;;) {
      const batch = await client.query('fetch 50000 from edge_cur');
      if (batch.rows.length === 0) break;
      for (const r of batch.rows) {
        edges.push({
          id: r.id,
          wayId: r.way_id,
          fromNode: r.from_node,
          toNode: r.to_node,
          name: r.name,
          lengthM: r.length_m,
          tags: r.tags,
          osmTimestamp: r.osm_timestamp,
          osmVersion: r.osm_version,
          coords: r.coords,
        });
      }
    }
    await client.query('close edge_cur');
    await client.query('commit');
  } finally {
    client.release();
  }
  log(`graph: ${edges.length} edges in ${Date.now() - t0} ms`);
  const graph = new Graph(
    { version: version.id, createdAt: version.createdAt, dataTimestamp: version.dataTimestamp, coverage: version.coverage, bounds: version.bounds },
    nodes,
    edges,
  );
  log(`graph: built in ${Date.now() - t0} ms`);
  return graph;
}
