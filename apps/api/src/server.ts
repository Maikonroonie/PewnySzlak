import { buildApp } from './app.ts';
import { config } from './config.ts';
import { AppContext } from './context.ts';
import { applySchema, createPool, waitForDb } from './db.ts';

async function main() {
  const db = createPool();
  await waitForDb(db);
  await applySchema(db);
  const log = { info: (m: string) => console.log(`[api] ${m}`), warn: (m: string) => console.warn(`[api] ${m}`), error: (m: string) => console.error(`[api] ${m}`) };
  const ctx = new AppContext(db, log);
  await ctx.start();
  const app = await buildApp(ctx);
  await app.listen({ port: config.port, host: config.host });
  log.info(`listening on http://${config.host}:${config.port} (assistant: ${config.openai.apiKey && config.openai.model ? 'llm' : 'rules'})`);
  const shutdown = async () => { ctx.stop(); await app.close(); await db.end(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
