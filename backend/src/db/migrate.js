import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../config/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = await readFile(path.join(here, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    const { rows } = await client.query('SELECT PostGIS_Version() AS v');
    console.log(`Schema applied. PostGIS ${rows[0].v}`);
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
