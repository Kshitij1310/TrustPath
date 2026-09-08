import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACTOR_WEIGHTS,
  coverageNote,
  effectiveWeights,
  isolationMix,
  labelForScore,
  recencyWeight,
  timeOfDayFactor,
} from '../src/services/risk/weights.js';
import { explain } from '../src/services/risk/riskEngine.js';

const ALL_DATA = { crimeIncidents: true, emergencyLocations: true, osmFeatures: true };

test('nominal factor weights sum to 1', () => {
  const total = Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
});

test('risk bands map scores to the documented labels', () => {
  assert.equal(labelForScore(0), 'low');
  assert.equal(labelForScore(30), 'low');
  assert.equal(labelForScore(31), 'moderate');
  assert.equal(labelForScore(55), 'moderate');
  assert.equal(labelForScore(56), 'high');
  assert.equal(labelForScore(75), 'high');
  assert.equal(labelForScore(76), 'critical');
  assert.equal(labelForScore(100), 'critical');
});

// --- availability-aware weighting ----------------------------------------

test('with every dataset loaded, effective weights equal the nominal ones', () => {
  const { weights, dropped } = effectiveWeights(ALL_DATA);
  assert.deepEqual(dropped, []);
  for (const [factor, nominal] of Object.entries(FACTOR_WEIGHTS)) {
    assert.ok(Math.abs(weights[factor] - nominal) < 1e-9, `${factor}: ${weights[factor]}`);
  }
});

test('effective weights always sum to 1, whatever is missing', () => {
  const combinations = [
    { crimeIncidents: false, emergencyLocations: true, osmFeatures: true },
    { crimeIncidents: true, emergencyLocations: false, osmFeatures: true },
    { crimeIncidents: false, emergencyLocations: false, osmFeatures: false },
    { crimeIncidents: true, emergencyLocations: true, osmFeatures: false },
  ];
  for (const datasets of combinations) {
    const { weights } = effectiveWeights(datasets);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${JSON.stringify(datasets)} -> ${total}`);
  }
});

test('a factor with no data is dropped, not scored as zero', () => {
  const { weights, active, dropped } = effectiveWeights({ ...ALL_DATA, crimeIncidents: false });

  assert.ok(dropped.includes('historicalCrime'));
  assert.ok(dropped.includes('recentIncidents'));
  assert.ok(!active.includes('historicalCrime'));
  assert.equal(weights.historicalCrime, undefined);

  // The freed 50% is redistributed, so surviving factors weigh more.
  assert.ok(
    weights.timeOfDay > FACTOR_WEIGHTS.timeOfDay,
    `timeOfDay should rise above ${FACTOR_WEIGHTS.timeOfDay}, got ${weights.timeOfDay}`,
  );
});

test('with nothing loaded, scoring falls back to the always-available factors', () => {
  const { weights, active } = effectiveWeights({
    crimeIncidents: false,
    emergencyLocations: false,
    osmFeatures: false,
  });
  assert.ok(active.includes('timeOfDay'));
  assert.ok(active.includes('communityReports'));
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('coverage note names what was excluded, and is null when nothing was', () => {
  assert.equal(coverageNote([]), null);
  const note = coverageNote(['historicalCrime', 'isolation']);
  assert.match(note, /historical crime data/);
  assert.match(note, /rather than counted as zero/);
});

// --- isolation sub-signals ------------------------------------------------

test('isolation mix uses both sub-signals when both are mapped', () => {
  const mix = isolationMix({ hasLamps: true, hasActivity: true });
  assert.ok(Math.abs(mix.lighting + mix.activity - 1) < 1e-9);
  assert.ok(mix.lighting > mix.activity, 'lighting should outweigh activity');
});

test('an unmapped sub-signal hands its weight to the other one', () => {
  // OSM has no street lamps mapped across most of India — those areas must
  // not be scored as pitch dark.
  assert.deepEqual(isolationMix({ hasLamps: false, hasActivity: true }), {
    lighting: 0,
    activity: 1,
  });
  assert.deepEqual(isolationMix({ hasLamps: true, hasActivity: false }), {
    lighting: 1,
    activity: 0,
  });
});

test('isolation is dropped entirely when neither sub-signal is mapped', () => {
  assert.equal(isolationMix({ hasLamps: false, hasActivity: false }), null);
});

// --- time and recency -----------------------------------------------------

test('time-of-day factor is higher at 11 PM than at 2 PM', () => {
  const afternoon = timeOfDayFactor(new Date(2026, 0, 7, 14, 0));
  const lateNight = timeOfDayFactor(new Date(2026, 0, 7, 23, 0));
  assert.ok(lateNight > afternoon, `${lateNight} should exceed ${afternoon}`);
});

test('time-of-day factor stays within 0..1 across every hour', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const f = timeOfDayFactor(new Date(2026, 0, 7, hour, 0));
    assert.ok(f >= 0 && f <= 1, `hour ${hour} produced ${f}`);
  }
});

test('recency weight decays with age and handles undated records', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const fresh = recencyWeight('2025-12-31T00:00:00Z', now);
  const old = recencyWeight('2024-01-01T00:00:00Z', now);
  assert.ok(fresh > old);
  assert.ok(fresh <= 1 && old > 0);
  assert.equal(recencyWeight(null, now), 0.5);
});

// --- explanation building -------------------------------------------------

const ALL_FACTORS = Object.keys(FACTOR_WEIGHTS);

/** Distinct synthetic ids, prefixed so two segments can share or not share. */
const idsFor = (kind, n, offset = 0) =>
  Array.from({ length: n }, (_, i) => `${kind}-${offset + i}`);

const segment = (overrides = {}, idOffset = 0) => ({
  // `explain` counts distinct records via `ids`, not by summing per-segment
  // counts — adjacent segments genuinely see the same incident twice.
  ids: {
    incidents: idsFor('inc', overrides.counts?.incidents ?? 0, idOffset),
    recentIncidents: idsFor('rec', overrides.counts?.recentIncidents ?? 0, idOffset),
    reports: idsFor('rep', overrides.counts?.reports ?? 0, idOffset),
    alerts: idsFor('alr', overrides.counts?.activeAlerts ?? 0, idOffset),
  },
  factors: {
    historicalCrime: 0,
    recentIncidents: 0,
    communityReports: 0,
    timeOfDay: 0.2,
    emergencyAccess: 0.2,
    isolation: 0.2,
    ...overrides.factors,
  },
  counts: {
    incidents: 0,
    recentIncidents: 0,
    reports: 0,
    activeAlerts: 0,
    nearestEmergencyM: 200,
    emergencyFacilitiesWithin3km: 3,
    streetLamps: 4,
    activityPois: 5,
    ...overrides.counts,
  },
});

test('explain reports recent incidents and community reports', () => {
  const reasons = explain(
    [segment({ counts: { recentIncidents: 3, reports: 2 } })],
    new Date(2026, 0, 7, 23, 0),
    ALL_FACTORS,
  );
  assert.ok(reasons.some((r) => r.includes('3 incidents')), reasons.join(' | '));
  assert.ok(reasons.some((r) => r.includes('2 community safety reports')), reasons.join(' | '));
  assert.ok(reasons.some((r) => r.includes('time-of-day')), reasons.join(' | '));
});

test('explain counts a record once even when several segments see it', () => {
  // Segment midpoints are 500 m apart and each looks 500 m around itself, so
  // one alert routinely appears in three segments' context. Summing per-segment
  // counts reported "9 active safety alerts" when the database held 2.
  const shared = { ids: { incidents: [], recentIncidents: [], reports: [], alerts: ['alr-1', 'alr-2'] } };
  const seg = () => ({ ...segment(), ...shared });

  const reasons = explain([seg(), seg(), seg()], new Date(2026, 0, 7, 14, 0), ALL_FACTORS);

  assert.ok(
    reasons.some((r) => r.includes('2 active safety alerts')),
    `expected 2 distinct alerts, got: ${reasons.join(' | ')}`,
  );
  assert.ok(!reasons.some((r) => r.includes('6 active')), 'must not sum across segments');
});

test('explain still counts distinct records across different segments', () => {
  const reasons = explain(
    [segment({ counts: { reports: 2 } }, 0), segment({ counts: { reports: 3 } }, 100)],
    new Date(2026, 0, 7, 14, 0),
    ALL_FACTORS,
  );
  assert.ok(reasons.some((r) => r.includes('5 community safety reports')), reasons.join(' | '));
});

test('explain stays silent about factors that were not scored', () => {
  // historicalCrime and recentIncidents inactive: no incident data loaded.
  const active = ALL_FACTORS.filter((f) => f !== 'historicalCrime' && f !== 'recentIncidents');
  const reasons = explain(
    [segment({ counts: { recentIncidents: 3 }, factors: { historicalCrime: 0.9 } })],
    new Date(2026, 0, 7, 14, 0),
    active,
  );
  // The "nothing found" fallback legitimately contains the word "incidents",
  // so match the specific claims instead of the bare substring.
  assert.ok(!reasons.some((r) => /\d+ incidents? reported/.test(r)), reasons.join(' | '));
  assert.ok(!reasons.some((r) => r.includes('historical incident density')), reasons.join(' | '));
});

test('explain does not call a stretch unlit when no lighting is mapped anywhere', () => {
  const reasons = explain(
    [segment({ counts: { streetLamps: 0 } }), segment({ counts: { streetLamps: 0 } })],
    new Date(2026, 0, 7, 14, 0),
    ALL_FACTORS,
  );
  assert.ok(
    !reasons.some((r) => r.includes('street lighting')),
    `unsurveyed lighting must not read as darkness: ${reasons.join(' | ')}`,
  );
});

test('explain does flag unlit stretches when lighting is mapped elsewhere', () => {
  const reasons = explain(
    [segment({ counts: { streetLamps: 0 } }), segment({ counts: { streetLamps: 9 } })],
    new Date(2026, 0, 7, 14, 0),
    ALL_FACTORS,
  );
  assert.ok(
    reasons.some((r) => r.includes('1 segment has no mapped street lighting')),
    reasons.join(' | '),
  );
});

test('explain flags deserted stretches with no nearby businesses', () => {
  const reasons = explain(
    [segment({ counts: { activityPois: 0 } })],
    new Date(2026, 0, 7, 14, 0),
    ALL_FACTORS,
  );
  assert.ok(reasons.some((r) => r.includes('no shops or businesses')), reasons.join(' | '));
});

test('explain flags segments with limited emergency access', () => {
  const reasons = explain(
    [segment({ factors: { emergencyAccess: 0.9 } })],
    new Date(2026, 0, 7, 14, 0),
    ALL_FACTORS,
  );
  assert.ok(
    reasons.some((r) => r.includes('limited nearby emergency infrastructure')),
    reasons.join(' | '),
  );
});

test('explain says so plainly when nothing was found', () => {
  const reasons = explain([segment()], new Date(2026, 0, 7, 14, 0), ALL_FACTORS);
  assert.deepEqual(reasons, ['No incidents, reports or active alerts found near this route']);
});

test('explain uses singular wording for a single item', () => {
  const reasons = explain(
    [segment({ counts: { recentIncidents: 1 } })],
    new Date(2026, 0, 7, 14, 0),
    ALL_FACTORS,
  );
  assert.ok(reasons.some((r) => r.includes('1 incident reported')), reasons.join(' | '));
});
