/**
 * Risk model constants.
 *
 * These are *product rules*, not statistical claims. The output is a
 * "contextual route-risk score", never a probability of crime. Every number
 * here is meant to be tuned against real data and the reasoning documented.
 */

/**
 * Nominal weights — what the model uses when every input has real data behind
 * it. See `effectiveWeights` for what actually gets applied.
 */
export const FACTOR_WEIGHTS = {
  historicalCrime: 0.30,
  recentIncidents: 0.20,
  communityReports: 0.15,
  timeOfDay: 0.15,
  emergencyAccess: 0.10,
  isolation: 0.10,
};

/**
 * Which datasets each factor depends on. A factor with no data behind it is
 * *dropped*, not scored as zero.
 *
 * Scoring an unsourced factor as 0 would silently drag every route's score
 * down by that factor's weight — a route would look safer than the evidence
 * supports, which in a safety product is the dangerous direction to be wrong
 * in. Dropping it and renormalising keeps the score honest about what it
 * actually knows.
 */
export const FACTOR_REQUIREMENTS = {
  historicalCrime: 'crimeIncidents',
  recentIncidents: 'crimeIncidents',
  communityReports: null, // always available; an empty result is a real signal
  timeOfDay: null, // computed, never missing
  emergencyAccess: 'emergencyLocations',
  // Either sub-signal is enough; `isolationMix` decides which ones apply.
  isolation: 'osmFeatures',
};

/**
 * Redistribute the weight of unavailable factors across the ones we can
 * actually evidence, keeping the total at 1.
 *
 * @param {Record<string, boolean>} datasets which datasets have rows
 * @returns {{ weights: Record<string, number>, active: string[], dropped: string[] }}
 */
export function effectiveWeights(datasets) {
  const active = [];
  const dropped = [];

  for (const [factor, requirement] of Object.entries(FACTOR_REQUIREMENTS)) {
    if (requirement === null || datasets[requirement]) active.push(factor);
    else dropped.push(factor);
  }

  // Nothing to score against at all — fall back to the always-available
  // factors so the engine still returns something meaningful.
  if (active.length === 0) {
    return { weights: { timeOfDay: 1 }, active: ['timeOfDay'], dropped };
  }

  const total = active.reduce((sum, factor) => sum + FACTOR_WEIGHTS[factor], 0);
  const weights = Object.fromEntries(
    active.map((factor) => [factor, FACTOR_WEIGHTS[factor] / total]),
  );

  return { weights, active, dropped };
}

/** Human-readable note explaining what the score could not take into account. */
export function coverageNote(dropped) {
  if (dropped.length === 0) return null;
  const names = {
    historicalCrime: 'historical crime data',
    recentIncidents: 'recent incident data',
    communityReports: 'community reports',
    emergencyAccess: 'emergency infrastructure data',
    isolation: 'street lighting and activity data',
  };
  const listed = dropped.map((d) => names[d] ?? d);
  const list =
    listed.length === 1
      ? listed[0]
      : `${listed.slice(0, -1).join(', ')} or ${listed[listed.length - 1]}`;
  const verb = listed.length === 1 ? 'it was' : 'they were';
  return `No ${list} is loaded for this area, so ${verb} excluded from the score rather than counted as zero. The remaining factors were reweighted to compensate.`;
}

export const RISK_BANDS = [
  { max: 30, label: 'low' },
  { max: 55, label: 'moderate' },
  { max: 75, label: 'high' },
  { max: 100, label: 'critical' },
];

export function labelForScore(score) {
  return RISK_BANDS.find((band) => score <= band.max)?.label ?? 'critical';
}

/** How much a report counts, based on how far the trust system has vetted it. */
export const REPORT_TRUST_WEIGHT = {
  unverified: 0.4,
  corroborated: 0.7,
  verified: 1.0,
  rejected: 0,
};

/** Severity multiplier applied to community report categories. */
export const CATEGORY_SEVERITY = {
  crime: 1.0,
  harassment: 0.9,
  suspicious_activity: 0.7,
  unsafe_area: 0.6,
  poor_lighting: 0.5,
  road_issue: 0.3,
  other: 0.4,
};

/**
 * Time-of-day factor in 0..1 by local hour. Late night scores highest.
 * Deliberately a lookup table so it is easy to inspect and tune.
 */
const HOUR_FACTOR = [
  0.95, 1.00, 1.00, 0.95, 0.80, 0.55, 0.35, 0.25, 0.20, 0.20, 0.20, 0.20,
  0.20, 0.20, 0.20, 0.22, 0.28, 0.38, 0.50, 0.60, 0.70, 0.80, 0.88, 0.92,
];

export function timeOfDayFactor(date = new Date()) {
  const hour = date.getHours();
  const factor = HOUR_FACTOR[hour] ?? 0.5;
  // Weekend late nights carry a modest bump.
  const day = date.getDay();
  const isWeekendNight = (day === 5 || day === 6) && (hour >= 22 || hour <= 3);
  return Math.min(1, factor * (isWeekendNight ? 1.1 : 1));
}

/** Recency decay: an incident's weight halves roughly every 45 days. */
export function recencyWeight(occurredAt, now = new Date()) {
  if (!occurredAt) return 0.5; // undated import — treat as background history
  const days = Math.max(0, (now - new Date(occurredAt)) / 86_400_000);
  return 1 / (1 + days / 45);
}

/** Anything within this window counts towards the "recent incidents" factor. */
export const RECENT_INCIDENT_DAYS = 30;

// --- isolation / lighting -------------------------------------------------

/** Street lamps are counted within this radius of a segment midpoint. */
export const LAMP_RADIUS_METERS = 150;

/** Shops, cafes, offices — counted within this radius. */
export const ACTIVITY_RADIUS_METERS = 300;

/**
 * Counts at which lighting and activity are considered "adequate". Reaching
 * these makes the corresponding contribution to isolation zero.
 *
 * Both are judgement calls tuned against Indian urban density, not measured
 * thresholds — they are the most obvious thing to revisit with real feedback.
 */
export const LAMP_ADEQUATE_COUNT = 8;
export const ACTIVITY_ADEQUATE_COUNT = 12;

/** Lighting matters more than passing shops after dark; weights reflect that. */
export const ISOLATION_MIX = { lighting: 0.6, activity: 0.4 };

/**
 * Build the isolation mix from the sub-signals that are actually mapped.
 *
 * OSM street-lighting coverage is very uneven — large Indian cities have no
 * `highway=street_lamp` nodes at all. Scoring those areas as pitch dark would
 * confuse "not mapped" with "not lit", mark every segment equally unlit, and
 * add a constant that discriminates nothing while inflating every score.
 *
 * So an unmapped sub-signal is dropped and the remaining one takes its
 * weight, exactly as `effectiveWeights` does one level up.
 */
export function isolationMix({ hasLamps, hasActivity }) {
  if (hasLamps && hasActivity) return ISOLATION_MIX;
  if (hasLamps) return { lighting: 1, activity: 0 };
  if (hasActivity) return { lighting: 0, activity: 1 };
  return null; // nothing mapped — the caller drops the isolation factor
}
