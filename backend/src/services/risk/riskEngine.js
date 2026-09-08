import { env } from '../../config/env.js';
import { query } from '../../config/db.js';
import { midpointOf, pathLengthMeters, segmentPath, toPointWkt } from '../../utils/geo.js';
import {
  ACTIVITY_ADEQUATE_COUNT,
  ACTIVITY_RADIUS_METERS,
  CATEGORY_SEVERITY,
  FACTOR_WEIGHTS,
  LAMP_ADEQUATE_COUNT,
  LAMP_RADIUS_METERS,
  RECENT_INCIDENT_DAYS,
  REPORT_TRUST_WEIGHT,
  coverageNote,
  effectiveWeights,
  isolationMix,
  labelForScore,
  recencyWeight,
  timeOfDayFactor,
} from './weights.js';

/** Map a raw count/weight onto 0..1 with diminishing returns. */
function saturate(value, halfPoint) {
  if (value <= 0) return 0;
  return value / (value + halfPoint);
}

/**
 * Which datasets actually have rows.
 *
 * Cheap existence checks (`EXISTS`, not `COUNT`) so this can run per request
 * without scanning tables that may hold millions of rows.
 */
async function availableDatasets() {
  const { rows } = await query(`
    SELECT
      EXISTS (SELECT 1 FROM crime_incidents)     AS "crimeIncidents",
      EXISTS (SELECT 1 FROM emergency_locations) AS "emergencyLocations",
      EXISTS (SELECT 1 FROM osm_features WHERE kind = 'street_lamp') AS "streetLamps",
      EXISTS (SELECT 1 FROM osm_features WHERE kind = 'activity')    AS "activityPois",
      -- Demo rows must never pass for real ones. If any exist, every score
      -- derived from them says so.
      EXISTS (SELECT 1 FROM crime_incidents WHERE source = 'demo')   AS "demoIncidents",
      EXISTS (SELECT 1 FROM community_reports WHERE source = 'demo') AS "demoReports",
      NOT EXISTS (SELECT 1 FROM crime_incidents WHERE source <> 'demo') AS "allIncidentsAreDemo"
  `);
  const row = rows[0];
  return {
    ...row,
    osmFeatures: row.streetLamps || row.activityPois,
    usingDemoData: row.demoIncidents || row.demoReports,
  };
}

/**
 * Pull every piece of spatial context we need for a batch of segment
 * midpoints in one round trip per dataset, rather than N queries per segment.
 */
async function fetchContext(midpoints, radiusMeters) {
  const wkts = midpoints.map(toPointWkt);
  const params = [wkts, radiusMeters];

  const points = `
    WITH pts AS (
      SELECT ordinality - 1 AS idx,
             ST_GeogFromText(wkt) AS geom
      FROM unnest($1::text[]) WITH ORDINALITY AS t(wkt, ordinality)
    )
  `;

  const [incidents, reports, alerts, facilities, osm] = await Promise.all([
    query(
      `${points}
       SELECT p.idx, c.id, c.severity, c.occurred_at
       FROM pts p
       JOIN crime_incidents c ON ST_DWithin(c.geom, p.geom, $2)`,
      params,
    ),
    query(
      `${points}
       SELECT p.idx, r.id, r.category, r.severity, r.status, r.upvotes, r.created_at
       FROM pts p
       JOIN community_reports r ON ST_DWithin(r.geom, p.geom, $2)
       WHERE r.status <> 'rejected'`,
      params,
    ),
    query(
      `${points}
       SELECT p.idx, a.id, a.severity, a.alert_type, a.description
       FROM pts p
       JOIN safety_alerts a
         ON ST_DWithin(a.geom, p.geom, $2 + a.radius_m)
       WHERE a.active_from <= now()
         AND (a.expires_at IS NULL OR a.expires_at > now())`,
      params,
    ),
    query(
      `${points}
       SELECT p.idx,
              MIN(ST_Distance(e.geom, p.geom)) AS nearest_m,
              -- COUNT(e.id), not COUNT(*): the LEFT JOIN keeps a NULL row for
              -- a midpoint with no facility nearby, and COUNT(*) would score
              -- that as "1 facility".
              COUNT(e.id) AS facility_count
       FROM pts p
       LEFT JOIN emergency_locations e ON ST_DWithin(e.geom, p.geom, 3000)
       GROUP BY p.idx`,
      // Fixed 3 km radius — this query binds $1 only.
      [wkts],
    ),
    query(
      `${points}
       SELECT p.idx,
              COUNT(*) FILTER (
                WHERE f.kind = 'street_lamp'
                  AND ST_DWithin(f.geom, p.geom, $2::double precision)
              ) AS lamp_count,
              COUNT(*) FILTER (
                WHERE f.kind = 'activity'
                  AND ST_DWithin(f.geom, p.geom, $3::double precision)
              ) AS activity_count
       FROM pts p
       -- Explicit casts: without them Postgres infers text for the bound
       -- radii and cannot resolve ST_DWithin's signature.
       LEFT JOIN osm_features f
         ON ST_DWithin(f.geom, p.geom, GREATEST($2::double precision, $3::double precision))
       GROUP BY p.idx`,
      [wkts, LAMP_RADIUS_METERS, ACTIVITY_RADIUS_METERS],
    ),
  ]);

  const empty = () => midpoints.map(() => []);
  const grouped = {
    incidents: empty(),
    reports: empty(),
    alerts: empty(),
    facilities: midpoints.map(() => ({ nearestM: null, count: 0 })),
    osm: midpoints.map(() => ({ lamps: 0, activity: 0 })),
  };

  for (const row of incidents.rows) grouped.incidents[row.idx].push(row);
  for (const row of reports.rows) grouped.reports[row.idx].push(row);
  for (const row of alerts.rows) grouped.alerts[row.idx].push(row);
  for (const row of facilities.rows) {
    grouped.facilities[row.idx] = {
      nearestM: row.nearest_m === null ? null : Number(row.nearest_m),
      count: Number(row.facility_count) || 0,
    };
  }
  for (const row of osm.rows) {
    grouped.osm[row.idx] = {
      lamps: Number(row.lamp_count) || 0,
      activity: Number(row.activity_count) || 0,
    };
  }

  return grouped;
}

function scoreSegment({ context, at, weights, active, mix }) {
  const now = at;
  const { incidents, reports, alerts, facilities, osm } = context;
  const has = (factor) => active.includes(factor);

  const factors = {};

  // --- historical crime -------------------------------------------------
  if (has('historicalCrime')) {
    const historicalWeight = incidents.reduce(
      (sum, i) => sum + (i.severity || 1) * 0.5 * recencyWeight(i.occurred_at, now),
      0,
    );
    factors.historicalCrime = saturate(historicalWeight, 6);
  }

  // --- recent incidents -------------------------------------------------
  const recentCutoff = now.getTime() - RECENT_INCIDENT_DAYS * 86_400_000;
  const recent = incidents.filter(
    (i) => i.occurred_at && new Date(i.occurred_at).getTime() >= recentCutoff,
  );
  if (has('recentIncidents')) {
    const alertWeight = alerts.reduce((sum, a) => sum + (a.severity || 3) * 0.6, 0);
    factors.recentIncidents = saturate(
      recent.reduce((sum, i) => sum + (i.severity || 1), 0) + alertWeight,
      5,
    );
  }

  // --- community reports (trust-weighted) -------------------------------
  // Active alerts fold in here when there is no incident dataset to carry
  // them, so a published alert never goes unscored.
  const reportWeight = reports.reduce((sum, r) => {
    const trust = REPORT_TRUST_WEIGHT[r.status] ?? 0.4;
    const category = CATEGORY_SEVERITY[r.category] ?? 0.4;
    const upvoteBoost = Math.min(0.3, (Number(r.upvotes) || 0) * 0.05);
    return (
      sum +
      (r.severity || 2) * 0.4 * category * (trust + upvoteBoost) * recencyWeight(r.created_at, now)
    );
  }, 0);
  const alertFallback = has('recentIncidents')
    ? 0
    : alerts.reduce((sum, a) => sum + (a.severity || 3) * 0.6, 0);
  factors.communityReports = saturate(reportWeight + alertFallback, 4);

  // --- time of day ------------------------------------------------------
  factors.timeOfDay = timeOfDayFactor(now);

  // --- emergency access (inverted: far away = risky) ---------------------
  const nearestM = facilities.nearestM;
  if (has('emergencyAccess')) {
    factors.emergencyAccess =
      nearestM === null ? 1 : Math.min(1, Math.max(0, (nearestM - 300) / 2700));
  }

  // --- isolation (real OSM data) ----------------------------------------
  // Two independent signals: is the stretch lit, and is anyone else likely to
  // be around. Both are inverted — more lamps and more activity mean less
  // isolation.
  if (has('isolation') && mix) {
    const lighting = 1 - Math.min(1, osm.lamps / LAMP_ADEQUATE_COUNT);
    const activity = 1 - Math.min(1, osm.activity / ACTIVITY_ADEQUATE_COUNT);
    factors.isolation = lighting * mix.lighting + activity * mix.activity;
  }

  const weighted = Object.entries(weights).reduce(
    (sum, [factor, weight]) => sum + (factors[factor] ?? 0) * weight,
    0,
  );
  const score = Math.round(Math.min(100, Math.max(0, weighted * 100)));

  return {
    score,
    label: labelForScore(score),
    factors,
    // Ids, so the route-level explanation can count distinct records. Segment
    // midpoints are 500 m apart and the search radius is 500 m, so adjacent
    // segments see overlapping data — summing per-segment counts would inflate
    // "16 incidents nearby" out of far fewer real ones.
    ids: {
      incidents: incidents.map((i) => i.id),
      recentIncidents: recent.map((i) => i.id),
      reports: reports.map((r) => r.id),
      alerts: alerts.map((a) => a.id),
    },
    counts: {
      incidents: incidents.length,
      recentIncidents: recent.length,
      reports: reports.length,
      activeAlerts: alerts.length,
      nearestEmergencyM: nearestM === null ? null : Math.round(nearestM),
      emergencyFacilitiesWithin3km: facilities.count,
      streetLamps: osm.lamps,
      activityPois: osm.activity,
    },
    alerts: alerts.map((a) => ({ type: a.alert_type, description: a.description })),
  };
}

/** Turn the numbers into the plain-language "why" list the UI shows. */
export function explain(segments, at = new Date(), active = Object.keys(FACTOR_WEIGHTS)) {
  const reasons = [];
  const has = (factor) => active.includes(factor);

  /**
   * Distinct records of a kind across the whole route.
   *
   * Not a sum of per-segment counts: adjacent segment midpoints are 500 m
   * apart and each looks 500 m around itself, so the same incident is seen by
   * two or three segments. Summing turned 2 alerts into "9 active alerts".
   */
  const distinct = (key) => {
    const seen = new Set();
    for (const segment of segments) for (const id of segment.ids?.[key] ?? []) seen.add(id);
    return seen.size;
  };

  /** "1 segment passes" / "3 segments pass" — noun and verb both agree. */
  const segs = (n, verb, plural) =>
    `${n} segment${n === 1 ? '' : 's'} ${n === 1 ? verb : plural}`;

  const recent = distinct('recentIncidents');
  if (has('recentIncidents') && recent > 0) {
    reasons.push(
      `${recent} incident${recent === 1 ? '' : 's'} reported near this route in the last 30 days`,
    );
  }

  if (has('historicalCrime')) {
    const historicalHeavy = segments.filter((s) => (s.factors.historicalCrime ?? 0) > 0.5).length;
    if (historicalHeavy > 0) {
      reasons.push(
        `${segs(historicalHeavy, 'passes', 'pass')} through areas with high historical incident density`,
      );
    }
  }

  const reports = distinct('reports');
  if (reports > 0) {
    reasons.push(`${reports} community safety report${reports === 1 ? '' : 's'} along the way`);
  }

  const timeFactor = timeOfDayFactor(at);
  if (timeFactor >= 0.6) {
    reasons.push(
      `Travelling at ${String(at.getHours()).padStart(2, '0')}:00 raises the time-of-day risk factor`,
    );
  }

  const alerts = distinct('alerts');
  if (alerts > 0) reasons.push(`${alerts} active safety alert${alerts === 1 ? '' : 's'} affect this route`);

  if (has('emergencyAccess')) {
    const poorAccess = segments.filter((s) => (s.factors.emergencyAccess ?? 0) > 0.7).length;
    if (poorAccess > 0) {
      reasons.push(`${segs(poorAccess, 'has', 'have')} limited nearby emergency infrastructure`);
    }
  }

  if (has('isolation')) {
    // Only claim a stretch is unlit when lighting is mapped somewhere on the
    // route — otherwise "0 lamps" means unsurveyed, not dark.
    const anyLamps = segments.some((s) => s.counts.streetLamps > 0);
    const unlit = anyLamps ? segments.filter((s) => s.counts.streetLamps === 0).length : 0;
    if (unlit > 0) {
      reasons.push(`${segs(unlit, 'has', 'have')} no mapped street lighting`);
    }
    const deserted = segments.filter((s) => s.counts.activityPois === 0).length;
    if (deserted > 0) {
      reasons.push(
        `${segs(deserted, 'passes', 'pass')} through areas with no shops or businesses nearby`,
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push('No incidents, reports or active alerts found near this route');
  }
  return reasons;
}

/**
 * Score one route: split into ~500 m segments, score each, then combine.
 *
 * The route score is deliberately not a plain mean — a single critical
 * segment must not disappear into an otherwise-quiet average.
 */
export async function scoreRoute(path, { at = new Date(), datasets } = {}) {
  const segmentPaths = segmentPath(path, env.segmentLengthMeters);
  if (segmentPaths.length === 0) {
    throw Object.assign(new Error('Route path needs at least two coordinates'), { status: 400 });
  }

  const midpoints = segmentPaths.map(midpointOf);
  const available = datasets ?? (await availableDatasets());
  const mix = isolationMix({
    hasLamps: available.streetLamps,
    hasActivity: available.activityPois,
  });

  // No lighting and no activity mapped means isolation has nothing behind it,
  // whatever the dataset flags said.
  const { weights, active, dropped } = effectiveWeights({
    ...available,
    osmFeatures: available.osmFeatures && mix !== null,
  });

  const context = await fetchContext(midpoints, env.incidentRadiusMeters);

  const segments = segmentPaths.map((segPath, idx) => {
    const scored = scoreSegment({
      context: {
        incidents: context.incidents[idx],
        reports: context.reports[idx],
        alerts: context.alerts[idx],
        facilities: context.facilities[idx],
        osm: context.osm[idx],
      },
      at,
      weights,
      active,
      mix,
    });
    return {
      seq: idx,
      path: segPath,
      midpoint: midpoints[idx],
      lengthM: Math.round(pathLengthMeters(segPath)),
      ...scored,
    };
  });

  const scores = segments.map((s) => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const worst = Math.max(...scores);
  // 70% average exposure, 30% worst-segment — keeps the spike visible.
  const routeScore = Math.round(Math.min(100, mean * 0.7 + worst * 0.3));
  const worstSegment = segments[scores.indexOf(worst)];

  return {
    score: routeScore,
    label: labelForScore(routeScore),
    scoredForAt: at.toISOString(),
    disclaimer:
      'Contextual route-risk score derived from mapped infrastructure, community reports, active alerts and time context. It is not a probability of crime.',
    reasons: explain(segments, at, active),
    worstSegment: {
      seq: worstSegment.seq,
      score: worstSegment.score,
      label: worstSegment.label,
      midpoint: worstSegment.midpoint,
    },
    // Full transparency about what actually went into the number.
    coverage: {
      factorsUsed: active,
      factorsUnavailable: dropped,
      note: coverageNote(dropped),
      usingDemoData: Boolean(available.usingDemoData),
      demoNote: available.usingDemoData
        ? available.allIncidentsAreDemo
          ? 'This score is calculated from demonstration data. The incidents behind it did not happen and nobody filed the reports. Treat it as a working example of the mechanism, not as information about this place.'
          : 'Some of the data behind this score is demonstration data mixed with real records.'
        : null,
    },
    factorWeights: weights,
    segments,
  };
}

/** Score several route alternatives and rank the safest first. */
export async function compareRoutes(routes, options = {}) {
  // Resolve availability once for the whole comparison, so alternatives are
  // always scored on identical terms.
  const datasets = options.datasets ?? (await availableDatasets());

  const scored = [];
  for (const route of routes) {
    const risk = await scoreRoute(route.path, { ...options, datasets });
    scored.push({ ...route, risk });
  }

  // Prefer lower risk; break near-ties (<=5 points) by travel time so we do
  // not recommend a 40-minute detour to shave 2 risk points.
  const ranked = [...scored].sort((a, b) => {
    const diff = a.risk.score - b.risk.score;
    if (Math.abs(diff) <= 5) return a.durationS - b.durationS;
    return diff;
  });

  const recommendedId = ranked[0]?.id;
  return scored.map((route) => ({ ...route, recommended: route.id === recommendedId }));
}
