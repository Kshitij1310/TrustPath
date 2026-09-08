import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // An idle client blew up; the pool replaces it. Log rather than crash.
  console.error('[db] idle client error:', err.message);
});

/** Run a single parameterised query. */
export function query(text, params) {
  return pool.query(text, params);
}

/** Run `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function assertDatabaseReady() {
  const { rows } = await query('SELECT PostGIS_Version() AS postgis');
  return rows[0].postgis;
}

export async function closePool() {
  await pool.end();
}
