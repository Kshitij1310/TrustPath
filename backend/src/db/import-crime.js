/**
 * Import REAL point-level incident data from a CSV.
 *
 *   npm run db:import:crime -- --file=path/to/incidents.csv --source=police-durg-2024
 *
 * Required columns (header row, any order):
 *   lat, lng            decimal degrees, WGS84
 *   occurred_at         ISO date or datetime. Rows without it are accepted but
 *                       treated as undated background history, at half weight.
 * Optional columns:
 *   crime_type          free text
 *   severity            1–5; defaults to 3 when absent
 *   state, district     free text
 *   source_ref          your own record id, so a row can be traced back
 *
 * `--source` is mandatory and stamped on every row. It is how a bad import
 * gets found and removed later:
 *
 *   DELETE FROM crime_incidents WHERE source = 'the-bad-import';
 *
 * There is deliberately no way to generate incidents. If you have no real
 * data, the risk engine drops the historical-crime factor and says so —
 * which is honest. Inventing rows would produce confident, wrong scores.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { pool, closePool } from '../config/db.js';
import { isValidCoordinate, toPointWkt } from '../utils/geo.js';

function parseArgs(argv) {
  const args = { file: null, source: null, replace: false };
  for (const arg of argv) {
    if (arg.startsWith('--file=')) args.file = arg.slice(7);
    else if (arg.startsWith('--source=')) args.source = arg.slice(9);
    else if (arg === '--replace') args.replace = true;
  }
  if (!args.file) throw new Error('--file=path/to/incidents.csv is required');
  if (!args.source) {
    throw new Error(
      '--source=<name> is required. Every row must be traceable to where it came from.',
    );
  }
  return args;
}

const pick = (row, ...names) => {
  for (const name of names) {
    const key = Object.keys(row).find((k) => k.toLowerCase().trim() === name);
    if (key && row[key] !== '') return row[key];
  }
  return null;
};

async function main() {
  const { file, source, replace } = parseArgs(process.argv.slice(2));

  const text = await readFile(path.resolve(file), 'utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true });
  console.log(`Read ${rows.length} row(s) from ${file}`);

  const client = await pool.connect();
  let inserted = 0;
  const rejected = [];

  try {
    await client.query('BEGIN');

    if (replace) {
      const { rowCount } = await client.query('DELETE FROM crime_incidents WHERE source = $1', [
        source,
      ]);
      console.log(`  --replace: removed ${rowCount} existing row(s) for source '${source}'`);
    }

    for (const [index, row] of rows.entries()) {
      const lat = Number(pick(row, 'lat', 'latitude', 'y'));
      const lng = Number(pick(row, 'lng', 'lon', 'longitude', 'x'));

      if (!isValidCoordinate([lat, lng])) {
        rejected.push(`row ${index + 2}: invalid coordinates (${lat}, ${lng})`);
        continue;
      }

      const rawSeverity = Number(pick(row, 'severity'));
      const severity = Number.isFinite(rawSeverity)
        ? Math.min(5, Math.max(1, Math.round(rawSeverity)))
        : 3;

      const rawDate = pick(row, 'occurred_at', 'date', 'datetime');
      let occurredAt = null;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) {
          rejected.push(`row ${index + 2}: unparseable date '${rawDate}'`);
          continue;
        }
        occurredAt = parsed.toISOString();
      }

      await client.query(
        `INSERT INTO crime_incidents
           (geom, occurred_at, crime_type, severity, state, district, source, source_ref)
         VALUES (ST_GeogFromText($1), $2, $3, $4, $5, $6, $7, $8)`,
        [
          toPointWkt([lat, lng]),
          occurredAt,
          pick(row, 'crime_type', 'type', 'category'),
          severity,
          pick(row, 'state'),
          pick(row, 'district'),
          source,
          pick(row, 'source_ref', 'ref', 'id'),
        ],
      );
      inserted += 1;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`\nImported ${inserted} incident(s) under source '${source}'.`);
  if (rejected.length > 0) {
    console.log(`Rejected ${rejected.length} row(s):`);
    // Show a sample rather than thousands of lines.
    rejected.slice(0, 10).forEach((r) => console.log(`  ${r}`));
    if (rejected.length > 10) console.log(`  … and ${rejected.length - 10} more`);
  }
  if (inserted > 0) {
    console.log('\nThe historical-crime factor is now active in the risk engine.');
  }
}

main()
  .catch((err) => {
    console.error(`\nImport failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
