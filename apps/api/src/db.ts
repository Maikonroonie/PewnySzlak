import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { config } from './config.ts';

const { Pool, types } = pg;
// bigint → number (identyfikatory OSM mieszczą się w zakresie bezpiecznym), timestamptz → ISO string.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1184, (v) => new Date(v).toISOString());
types.setTypeParser(1114, (v) => new Date(v + 'Z').toISOString());
types.setTypeParser(1082, (v) => v);

export type Db = pg.Pool;

export function createPool(connectionString = config.databaseUrl): Db {
  return new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
}

export async function applySchema(db: Db): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(here, '../../../infra/db/schema.sql');
  const sql = await readFile(schemaPath, 'utf8');
  await db.query(sql);
}

export async function waitForDb(db: Db, attempts = 30): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await db.query('select 1');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}
