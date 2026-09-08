/**
 * Import real OpenStreetMap data for a bounding box.
 *
 *   npm run db:import:osm                      # default Durg–Bhilai region
 *   npm run db:import:osm -- --bbox=21.0,81.1,21.4,81.5
 *   npm run db:import:osm -- --only=lamps
 *
 * Populates:
 *   emergency_locations  police, hospitals, fire stations, pharmacies,
 *                        fuel stations, railway stations
 *   osm_features         street lamps (lighting) and activity POIs
 *                        (shops, food, banks, schools) — the two inputs to
 *                        the isolation factor
 *
 * Everything written here is real, attributable OSM data. Nothing is
 * synthesised. Re-running is safe: rows are upserted on their OSM id.
 *
 * OSM data is © OpenStreetMap contributors, available under the ODbL.
 */
import { pool, closePool } from '../config/db.js';
import { toPointWkt } from '../utils/geo.js';
import {
  activityQuery,
  coordsOf,
  emergencyQuery,
  facilityKind,
  lampQuery,
  overpassQuery,
} from './importers/overpass.js';

// south, west, north, east — Overpass's order.
const DEFAULT_BBOX = [21.05, 81.15, 21.35, 81.50];

const log = (msg) => console.log(msg);

function parseArgs(argv) {
  const args = { bbox: DEFAULT_BBOX, only: null };

  for (const arg of argv) {
    if (arg.startsWith('--bbox=')) {
      const parts = arg
        .slice(7)
        .split(',')
        .map((n) => Number(n.trim()));
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        throw new Error('--bbox needs four numbers: south,west,north,east');
      }
      const [south, west, north, east] = parts;
      if (south >= north || west >= east) {
        throw new Error('--bbox must be south,west,north,east with south < north and west < east');
      }
      args.bbox = parts;
    } else if (arg.startsWith('--only=')) {
      args.only = arg.slice(7);
    }
  }
  return args;
}

async function importFacilities(client, bbox) {
  log('\nEmergency infrastructure…');
  const data = await overpassQuery(emergencyQuery(bbox), log);

  let written = 0;
  let skipped = 0;

  for (const element of data.elements ?? []) {
    const coords = coordsOf(element);
    if (!coords) {
      skipped += 1;
      continue;
    }
    const tags = element.tags ?? {};
    // An unnamed police station is still useful; fall back to its kind.
    const kind = facilityKind(tags);
    const name = tags.name || tags['name:en'] || kind.replace('_', ' ');

    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
      .filter(Boolean)
      .join(', ') || null;

    await client.query(
      `INSERT INTO emergency_locations (geom, name, kind, phone, address, source, osm_id)
       VALUES (ST_GeogFromText($1), $2, $3, $4, $5, 'osm', $6)
       ON CONFLICT (source, osm_id) DO UPDATE
         SET geom = EXCLUDED.geom,
             name = EXCLUDED.name,
             kind = EXCLUDED.kind,
             phone = EXCLUDED.phone,
             address = EXCLUDED.address`,
      [
        toPointWkt([coords.lat, coords.lng]),
        name,
        kind,
        tags.phone || tags['contact:phone'] || null,
        address,
        element.id,
      ],
    );
    written += 1;
  }

  log(`  emergency_locations: ${written} upserted${skipped ? `, ${skipped} without coordinates` : ''}`);
  return written;
}

async function importOsmFeatures(client, bbox, kind, ql) {
  log(`\n${kind === 'street_lamp' ? 'Street lamps' : 'Activity POIs'}…`);
  const data = await overpassQuery(ql, log);

  let written = 0;
  let skipped = 0;

  for (const element of data.elements ?? []) {
    const coords = coordsOf(element);
    if (!coords) {
      skipped += 1;
      continue;
    }
    const tags = element.tags ?? {};

    await client.query(
      `INSERT INTO osm_features (osm_id, osm_type, kind, geom, name, tags)
       VALUES ($1, $2, $3, ST_GeogFromText($4), $5, $6::jsonb)
       ON CONFLICT (osm_type, osm_id, kind) DO UPDATE
         SET geom = EXCLUDED.geom,
             name = EXCLUDED.name,
             tags = EXCLUDED.tags,
             imported_at = now()`,
      [
        element.id,
        element.type ?? 'node',
        kind,
        toPointWkt([coords.lat, coords.lng]),
        tags.name || null,
        JSON.stringify(tags),
      ],
    );
    written += 1;
  }

  log(`  osm_features (${kind}): ${written} upserted${skipped ? `, ${skipped} without coordinates` : ''}`);
  return written;
}

async function main() {
  const { bbox, only } = parseArgs(process.argv.slice(2));

  log(`Importing OpenStreetMap data for bbox ${bbox.join(', ')}`);
  log('(south, west, north, east — data © OpenStreetMap contributors, ODbL)');

  const client = await pool.connect();
  try {
    if (!only || only === 'facilities') await importFacilities(client, bbox);
    if (!only || only === 'lamps') {
      await importOsmFeatures(client, bbox, 'street_lamp', lampQuery(bbox));
    }
    if (!only || only === 'activity') {
      await importOsmFeatures(client, bbox, 'activity', activityQuery(bbox));
    }

    const { rows } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM emergency_locations) AS facilities,
        (SELECT COUNT(*) FROM osm_features WHERE kind = 'street_lamp') AS lamps,
        (SELECT COUNT(*) FROM osm_features WHERE kind = 'activity') AS activity
    `);
    const t = rows[0];
    log(
      `\nDone. Database now holds ${t.facilities} facilities, ${t.lamps} street lamps, ${t.activity} activity POIs.`,
    );

    if (Number(t.lamps) === 0) {
      log(
        '\nNote: no street lamps were found. OSM lighting coverage in India is patchy —\n' +
          'the isolation factor will lean entirely on activity POIs for this area.',
      );
    }
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(`\nImport failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
