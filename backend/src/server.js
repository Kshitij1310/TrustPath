import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { assertDatabaseReady, closePool } from './config/db.js';
import { initWebsocket } from './websocket/index.js';
import { startOverdueSweeper } from './services/journey/overdueSweeper.js';

async function main() {
  try {
    const postgis = await assertDatabaseReady();
    console.log(`[db] connected (PostGIS ${postgis})`);
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    console.error('    Check DATABASE_URL, that PostgreSQL is running, and that');
    console.error('    you have run: npm run db:migrate');
    process.exit(1);
  }

  const app = createApp();
  const server = http.createServer(app);
  initWebsocket(server);
  const stopSweeper = startOverdueSweeper();

  server.listen(env.port, () => {
    console.log(`[api] TrustRoute listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} received, shutting down`);
    stopSweeper();
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    // Do not hang forever on lingering sockets.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
