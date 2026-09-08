/**
 * Show what data is loaded and which risk factors it enables.
 *
 *   npm run db:status
 *
 * Exists because "why is my risk score low?" is almost always "that factor
 * has no data behind it". This makes that visible in one command instead of
 * requiring someone to reason about the engine's internals.
 */
import { pool, closePool } from '../config/db.js';
import { FACTOR_WEIGHTS, effectiveWeights } from '../services/risk/weights.js';

const pct = (n) => `${Math.round(n * 100)}%`;

async function main() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM crime_incidents)                                AS incidents,
      (SELECT COUNT(*) FROM crime_incidents WHERE source = 'demo')          AS demo_incidents,
      (SELECT COUNT(*) FROM community_reports WHERE source = 'demo')        AS demo_reports,
      (SELECT COUNT(*) FROM users WHERE source = 'demo')                    AS demo_users,
      (SELECT COUNT(*) FROM emergency_locations)                            AS facilities,
      (SELECT COUNT(*) FROM osm_features WHERE kind = 'street_lamp')        AS lamps,
      (SELECT COUNT(*) FROM osm_features WHERE kind = 'activity')           AS activity,
      (SELECT COUNT(*) FROM community_reports WHERE status <> 'rejected')   AS reports,
      (SELECT COUNT(*) FROM safety_alerts
        WHERE expires_at IS NULL OR expires_at > now())                     AS alerts,
      (SELECT COUNT(*) FROM users)                                          AS users,
      (SELECT COUNT(*) FROM journeys)                                       AS journeys
  `);
  const c = rows[0];

  const demoTotal =
    Number(c.demo_incidents) + Number(c.demo_reports) + Number(c.demo_users);

  // Stated first, before any numbers — if demo rows are present, every figure
  // below is partly about data that does not describe the real world.
  if (demoTotal > 0) {
    // Rule-and-indent rather than a drawn box: box borders drift the moment a
    // count changes width, and a misaligned warning reads as sloppy.
    const rule = '─'.repeat(66);
    console.log(`\n${rule}`);
    console.log('  DEMONSTRATION DATA IS LOADED');
    console.log(
      `  ${c.demo_incidents} incidents, ${c.demo_reports} reports and ${c.demo_users} users are seeded demo rows.`,
    );
    console.log('  The incidents did not happen. Nobody filed the reports. Risk scores');
    console.log('  built on them demonstrate the mechanism; they do not describe these');
    console.log('  places.');
    console.log('');
    console.log('  Remove with:  npm run db:seed:demo -- --purge');
    console.log(rule);
  }

  console.log('\nData loaded');
  console.log(
    '  crime incidents      ',
    c.incidents,
    Number(c.demo_incidents) > 0 ? `(${c.demo_incidents} demo)` : '',
  );
  console.log('  emergency facilities ', c.facilities);
  console.log('  street lamps         ', c.lamps);
  console.log('  activity POIs        ', c.activity);
  console.log(
    '  community reports    ',
    c.reports,
    Number(c.demo_reports) > 0 ? `(${c.demo_reports} demo)` : '',
  );
  console.log('  active alerts        ', c.alerts);
  console.log('  users / journeys     ', `${c.users} / ${c.journeys}`);

  const datasets = {
    crimeIncidents: Number(c.incidents) > 0,
    emergencyLocations: Number(c.facilities) > 0,
    osmFeatures: Number(c.lamps) + Number(c.activity) > 0,
  };
  const { weights, active, dropped } = effectiveWeights(datasets);

  console.log('\nRisk factors in use');
  for (const factor of active) {
    const nominal = FACTOR_WEIGHTS[factor];
    const applied = weights[factor];
    const shift = applied > nominal ? `  (up from ${pct(nominal)})` : '';
    console.log(`  ${factor.padEnd(20)} ${pct(applied).padStart(4)}${shift}`);
  }

  if (dropped.length > 0) {
    console.log('\nDropped — no data behind them');
    for (const factor of dropped) {
      console.log(`  ${factor.padEnd(20)} ${pct(FACTOR_WEIGHTS[factor]).padStart(4)} redistributed`);
    }
    if (dropped.includes('historicalCrime')) {
      console.log('\n  To enable historical crime scoring, import real point-level data:');
      console.log('    npm run db:import:crime -- --file=incidents.csv --source=<where-it-came-from>');
    }
    if (dropped.includes('isolation') || dropped.includes('emergencyAccess')) {
      console.log('\n  To enable infrastructure and isolation scoring:');
      console.log('    npm run db:import:osm');
    }
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error('Status check failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
