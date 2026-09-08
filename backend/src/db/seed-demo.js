/**
 * Seed a complete, clearly-labelled DEMO dataset.
 *
 *   npm run db:seed:demo            # create it
 *   npm run db:seed:demo -- --purge # remove every trace of it
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * This is development and demonstration data. It exists so every screen has
 * content, so the risk engine has spatial variation to score against, and so
 * the product can be shown working end to end.
 *
 * It is NOT a measurement of anything. The incidents did not happen. Nobody
 * filed the reports.
 *
 * The one rule that makes this legitimate rather than fabrication is that it
 * never claims to be real:
 *   - every row carries source = 'demo'
 *   - the risk engine reports `coverage.usingDemoData` on every score
 *   - the UI shows a standing banner while any demo row exists
 *   - `npm run db:status` says so, loudly
 *   - `--purge` removes all of it in one command
 *
 * Real OSM data (emergency_locations, osm_features) is never touched.
 * ---------------------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import { pool, closePool } from '../config/db.js';
import { toLineStringWkt, toPointWkt } from '../utils/geo.js';

const DEMO_PASSWORD = 'demo1234';

/**
 * Deterministic PRNG. A demo that reshuffles itself on every seed is
 * impossible to debug against or to screenshot twice.
 */
function makeRng(seed = 20260809) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rng = makeRng();
const pickOne = (list) => list[Math.floor(rng() * list.length)];
const between = (min, max) => min + rng() * (max - min);

/**
 * Incident density zones across the Durg–Bhilai corridor.
 *
 * Deliberately uneven. A uniform scatter would give every segment the same
 * score and defeat the point — the engine is meant to distinguish places, and
 * this data has to let it. Hot zones sit on the older, denser parts of the
 * corridor; the quiet zone is the newer sector housing to the south.
 */
const ZONES = [
  { name: 'Durg station area', lat: 21.1913, lng: 81.2801, radiusKm: 1.6, count: 46, severityBias: 0.65 },
  { name: 'Supela crossing', lat: 21.2003, lng: 81.3453, radiusKm: 1.3, count: 38, severityBias: 0.6 },
  { name: 'Power House / Bhilai Nagar', lat: 21.2085, lng: 81.3805, radiusKm: 1.5, count: 30, severityBias: 0.5 },
  { name: 'Kumhari bypass stretch', lat: 21.2470, lng: 81.4390, radiusKm: 2.0, count: 22, severityBias: 0.75 },
  { name: 'Sector 9 / hospital area', lat: 21.1936, lng: 81.3509, radiusKm: 1.2, count: 12, severityBias: 0.35 },
  { name: 'Sector 6 residential', lat: 21.1820, lng: 81.3230, radiusKm: 1.4, count: 7, severityBias: 0.3 },
];

const CRIME_TYPES = [
  'theft',
  'snatching',
  'harassment',
  'assault',
  'vehicle theft',
  'public nuisance',
  'stalking',
];

/** Offset a point by a distance/bearing, in degrees. */
function scatter(lat, lng, radiusKm) {
  // sqrt keeps the distribution area-uniform instead of clumping at the centre.
  const distance = Math.sqrt(rng()) * radiusKm;
  const bearing = rng() * 2 * Math.PI;
  const dLat = (distance / 111.32) * Math.cos(bearing);
  const dLng = (distance / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(bearing);
  return [lat + dLat, lng + dLng];
}

/**
 * Incident timestamps over the last 18 months, weighted towards evenings and
 * towards the recent past — so the recency decay and the recent-incident
 * window both have something realistic to act on.
 */
function incidentTimestamp(now) {
  // Squaring biases towards small values, i.e. recent.
  const daysAgo = Math.floor(rng() ** 2 * 540);
  const date = new Date(now.getTime() - daysAgo * 86_400_000);

  // Evening and late-night hours dominate.
  const hourBuckets = [
    [19, 24, 0.42],
    [0, 3, 0.18],
    [15, 19, 0.16],
    [3, 8, 0.08],
    [8, 15, 0.16],
  ];
  const roll = rng();
  let cumulative = 0;
  let hour = 21;
  for (const [from, to, weight] of hourBuckets) {
    cumulative += weight;
    if (roll <= cumulative) {
      hour = Math.floor(between(from, to));
      break;
    }
  }
  date.setHours(hour, Math.floor(rng() * 60), 0, 0);
  return date;
}

async function seedIncidents(client, now) {
  let inserted = 0;

  for (const zone of ZONES) {
    for (let i = 0; i < zone.count; i += 1) {
      const [lat, lng] = scatter(zone.lat, zone.lng, zone.radiusKm);
      // severityBias shifts the distribution without pinning it.
      const severity = Math.max(1, Math.min(5, Math.round(1 + zone.severityBias * 4 * rng() + rng())));

      await client.query(
        `INSERT INTO crime_incidents
           (geom, occurred_at, crime_type, severity, state, district, source, source_ref)
         VALUES (ST_GeogFromText($1), $2, $3, $4, 'Chhattisgarh', 'Durg', 'demo', $5)`,
        [
          toPointWkt([lat, lng]),
          incidentTimestamp(now).toISOString(),
          pickOne(CRIME_TYPES),
          severity,
          `demo:${zone.name}:${i}`,
        ],
      );
      inserted += 1;
    }
  }

  console.log(`  crime_incidents      ${inserted} across ${ZONES.length} zones`);
  return inserted;
}

const REPORT_TEMPLATES = [
  ['poor_lighting', 'Street lights have been out for over a week along this stretch.', 3],
  ['poor_lighting', 'No lighting at all after the turning. Very dark by 8pm.', 3],
  ['unsafe_area', 'Group of men loitering here most evenings.', 3],
  ['unsafe_area', 'Stray dogs in a pack near the underpass at night.', 2],
  ['harassment', 'Was followed from the bus stop to the corner. Reported to police.', 4],
  ['harassment', 'Catcalling from a parked vehicle, happens regularly around 9pm.', 3],
  ['suspicious_activity', 'Same vehicle parked with people sitting inside for hours.', 2],
  ['suspicious_activity', 'Someone taking photos of women waiting for autos.', 4],
  ['road_issue', 'Open drain with no cover, right on the footpath.', 2],
  ['road_issue', 'Road dug up, no barricade or warning light at night.', 3],
  ['crime', 'Phone snatched from a two-wheeler here last month.', 4],
  ['other', 'Auto drivers refuse to come here after dark.', 2],
];

async function seedReports(client, userIds, now) {
  const statuses = [
    ['unverified', 0],
    ['unverified', 1],
    ['corroborated', 4],
    ['corroborated', 3],
    ['verified', 7],
    ['verified', 5],
  ];

  let inserted = 0;

  // Reports cluster where people are, so anchor them to the busier zones.
  for (const [index, [category, description, severity]] of REPORT_TEMPLATES.entries()) {
    const zone = ZONES[index % 4]; // the four busier zones
    const [lat, lng] = scatter(zone.lat, zone.lng, zone.radiusKm * 0.8);
    const [status, upvotes] = statuses[index % statuses.length];
    const daysAgo = Math.floor(rng() ** 2 * 60);

    await client.query(
      `INSERT INTO community_reports
         (user_id, geom, category, description, severity, status, upvotes, source, created_at)
       VALUES ($1, ST_GeogFromText($2), $3, $4, $5, $6, $7, 'demo', $8)`,
      [
        pickOne(userIds),
        toPointWkt([lat, lng]),
        category,
        description,
        severity,
        status,
        upvotes,
        new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
      ],
    );
    inserted += 1;
  }

  console.log(`  community_reports    ${inserted} (mixed unverified / corroborated / verified)`);
  return inserted;
}

async function seedAlerts(client, adminId, now) {
  const alerts = [
    {
      lat: 21.2003,
      lng: 81.3453,
      radiusM: 700,
      type: 'Road dug up — no lighting',
      description: 'Drainage work near Supela crossing. Diversion is unlit after dark.',
      severity: 3,
      expiresInHours: 96,
    },
    {
      lat: 21.2470,
      lng: 81.4390,
      radiusM: 1500,
      type: 'Highway stretch advisory',
      description: 'Several snatching reports on the bypass between 10pm and 2am.',
      severity: 4,
      expiresInHours: 240,
    },
  ];

  for (const alert of alerts) {
    await client.query(
      `INSERT INTO safety_alerts
         (created_by, geom, radius_m, alert_type, description, severity, expires_at, source)
       VALUES ($1, ST_GeogFromText($2), $3, $4, $5, $6, $7, 'demo')`,
      [
        adminId,
        toPointWkt([alert.lat, alert.lng]),
        alert.radiusM,
        alert.type,
        alert.description,
        alert.severity,
        new Date(now.getTime() + alert.expiresInHours * 3600_000).toISOString(),
      ],
    );
  }

  console.log(`  safety_alerts        ${alerts.length} active`);
  return alerts.length;
}

async function seedUsers(client) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const people = [
    { email: 'demo@trustroute.local', name: 'Demo User', role: 'user', phone: '+91 90000 00001' },
    { email: 'admin@trustroute.local', name: 'Demo Admin', role: 'admin', phone: '+91 90000 00002' },
    { email: 'asha@trustroute.local', name: 'Asha (demo)', role: 'user', phone: '+91 90000 00003' },
    { email: 'ravi@trustroute.local', name: 'Ravi (demo)', role: 'user', phone: '+91 90000 00004' },
  ];

  const ids = {};
  for (const person of people) {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, display_name, phone, role, source)
       VALUES ($1, $2, $3, $4, $5, 'demo')
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             display_name = EXCLUDED.display_name,
             role = EXCLUDED.role,
             source = 'demo'
       RETURNING id`,
      [person.email, passwordHash, person.name, person.phone, person.role],
    );
    ids[person.email] = rows[0].id;
  }

  console.log(`  users                ${people.length} (1 admin, 3 regular)`);
  return ids;
}

async function seedContacts(client, userId) {
  const contacts = [
    ['Mummy', '+91 90000 11111', 'Mother', 1],
    ['Didi', '+91 90000 22222', 'Sister', 2],
    ['Rohit', '+91 90000 33333', 'Friend', 3],
  ];

  for (const [name, phone, relation, priority] of contacts) {
    await client.query(
      `INSERT INTO emergency_contacts (user_id, name, phone, relation, priority)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, name, phone, relation, priority],
    );
  }

  console.log(`  emergency_contacts   ${contacts.length} for demo@trustroute.local`);
}

/**
 * A finished journey with a GPS trail and an event timeline — including a
 * deviation and a check-in, so the journey screen shows the guardian workflow
 * rather than an empty state.
 */
async function seedJourney(client, userId, now) {
  const path = [];
  for (let i = 0; i <= 30; i += 1) {
    path.push([21.1913 + i * 0.00072, 81.2801 + i * 0.00335]);
  }

  const { rows: routeRows } = await client.query(
    `INSERT INTO routes
       (user_id, origin, destination, path, distance_m, duration_s,
        risk_score, risk_label, risk_breakdown, scored_for_at)
     VALUES ($1, ST_GeogFromText($2), ST_GeogFromText($3), ST_GeogFromText($4),
             10400, 1260, 44, 'moderate', $5::jsonb, $6)
     RETURNING id`,
    [
      userId,
      toPointWkt(path[0]),
      toPointWkt(path[path.length - 1]),
      toLineStringWkt(path),
      JSON.stringify({
        reasons: ['Demo route retained so the journey history screen has content'],
        demo: true,
      }),
      new Date(now.getTime() - 3 * 86_400_000).toISOString(),
    ],
  );
  const routeId = routeRows[0].id;

  const startedAt = new Date(now.getTime() - 3 * 86_400_000 - 40 * 60_000);
  const { rows: journeyRows } = await client.query(
    `INSERT INTO journeys (user_id, route_id, label, status, started_at, eta_at, ended_at)
     VALUES ($1, $2, 'Home from college', 'completed', $3, $4, $5)
     RETURNING id`,
    [
      userId,
      routeId,
      startedAt.toISOString(),
      new Date(startedAt.getTime() + 30 * 60_000).toISOString(),
      new Date(startedAt.getTime() + 34 * 60_000).toISOString(),
    ],
  );
  const journeyId = journeyRows[0].id;

  // GPS trail, with a genuine excursion off the planned line partway through.
  for (const [i, point] of path.entries()) {
    const deviating = i >= 14 && i <= 18;
    const lat = deviating ? point[0] + 0.0035 : point[0];
    const deviationM = deviating ? Math.round(between(280, 420)) : Math.round(between(4, 40));

    await client.query(
      `INSERT INTO journey_locations (journey_id, geom, accuracy_m, deviation_m, recorded_at)
       VALUES ($1, ST_GeogFromText($2), $3, $4, $5)`,
      [
        journeyId,
        toPointWkt([lat, point[1]]),
        Math.round(between(6, 22)),
        deviationM,
        new Date(startedAt.getTime() + i * 68_000).toISOString(),
      ],
    );
  }

  const events = [
    ['started', 0, { etaMinutes: 30 }],
    ['deviation', 16, { deviationM: 340, thresholdM: 250 }],
    ['checked_in', 18, { extendMinutes: 0 }],
    ['back_on_route', 21, { deviationM: 38 }],
    ['ended', 34, null],
  ];

  for (const [kind, minute, payload] of events) {
    await client.query(
      `INSERT INTO journey_events (journey_id, kind, payload, created_at)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [
        journeyId,
        kind,
        payload ? JSON.stringify(payload) : null,
        new Date(startedAt.getTime() + minute * 60_000).toISOString(),
      ],
    );
  }

  // A resolved SOS, so the emergency history screen is not empty either.
  await client.query(
    `INSERT INTO sos_incidents
       (user_id, journey_id, geom, trigger, status, notes, notified, client_ref, created_at, resolved_at)
     VALUES ($1, $2, ST_GeogFromText($3), 'deviation', 'resolved',
             'Demo SOS — raised after the route deviation, then stood down.',
             $4::jsonb, $5, $6, $7)`,
    [
      userId,
      journeyId,
      toPointWkt([path[16][0] + 0.0035, path[16][1]]),
      JSON.stringify([{ channel: 'sms', target: '+91 90000 11111', result: 'sent' }]),
      `demo-sos-${startedAt.getTime()}`,
      new Date(startedAt.getTime() + 17 * 60_000).toISOString(),
      new Date(startedAt.getTime() + 19 * 60_000).toISOString(),
    ],
  );

  console.log('  journey              1 completed, 31 GPS points, 5 events, 1 resolved SOS');
}

// ---------------------------------------------------------------- purge

async function purge(client) {
  console.log('Removing all demo data…\n');

  const steps = [
    // Journeys, locations, events, SOS and contacts all cascade from users.
    ["DELETE FROM users WHERE source = 'demo'", 'demo users (cascades journeys, contacts, SOS)'],
    ["DELETE FROM crime_incidents WHERE source = 'demo'", 'demo incidents'],
    ["DELETE FROM community_reports WHERE source = 'demo'", 'demo reports'],
    ["DELETE FROM safety_alerts WHERE source = 'demo'", 'demo alerts'],
  ];

  for (const [sql, label] of steps) {
    const { rowCount } = await client.query(sql);
    console.log(`  ${String(rowCount).padStart(4)}  ${label}`);
  }

  console.log('\nReal OpenStreetMap data was left untouched.');
}

// ---------------------------------------------------------------- main

async function main() {
  const isPurge = process.argv.includes('--purge');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (isPurge) {
      await purge(client);
      await client.query('COMMIT');
      return;
    }

    // Re-seeding replaces the previous demo set rather than duplicating it.
    await purge(client);
    console.log('');

    const now = new Date();
    console.log('Seeding demo data…\n');

    const userIds = await seedUsers(client);
    await seedIncidents(client, now);
    await seedReports(client, Object.values(userIds), now);
    await seedAlerts(client, userIds['admin@trustroute.local'], now);
    await seedContacts(client, userIds['demo@trustroute.local']);
    await seedJourney(client, userIds['demo@trustroute.local'], now);

    await client.query('COMMIT');

    console.log('\nSign in with:');
    console.log(`  demo@trustroute.local   / ${DEMO_PASSWORD}   (regular user)`);
    console.log(`  admin@trustroute.local  / ${DEMO_PASSWORD}   (admin dashboard)`);
    console.log('\nEvery row above is tagged source = \'demo\'. The app will show a');
    console.log('banner while any of it exists. Remove it with:');
    console.log('  npm run db:seed:demo -- --purge');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(`\nFailed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
