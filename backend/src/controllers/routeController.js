import { query, withTransaction } from '../config/db.js';
import { compareRoutes, scoreRoute } from '../services/risk/riskEngine.js';
import { routingProvider } from '../services/routing/index.js';
import { notFound } from '../utils/ApiError.js';
import { toLineStringWkt, toPointWkt } from '../utils/geo.js';

/** Persist a scored route plus its segments so a journey can reference it. */
async function saveRoute(route, userId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO routes
         (user_id, origin, destination, path, distance_m, duration_s,
          risk_score, risk_label, risk_breakdown, scored_for_at)
       VALUES ($1,
               ST_GeogFromText($2), ST_GeogFromText($3), ST_GeogFromText($4),
               $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING id, created_at`,
      [
        userId ?? null,
        toPointWkt(route.path[0]),
        toPointWkt(route.path[route.path.length - 1]),
        toLineStringWkt(route.path),
        route.distanceM,
        route.durationS,
        route.risk.score,
        route.risk.label,
        JSON.stringify({
          reasons: route.risk.reasons,
          factorWeights: route.risk.factorWeights,
          worstSegment: route.risk.worstSegment,
          disclaimer: route.risk.disclaimer,
          // Stored too: a score read back next month must still say which
          // datasets were loaded when it was calculated.
          coverage: route.risk.coverage,
        }),
        route.risk.scoredForAt,
      ],
    );
    const routeId = rows[0].id;

    for (const segment of route.risk.segments) {
      await client.query(
        `INSERT INTO route_segments
           (route_id, seq, geom, midpoint, length_m, risk_score, risk_label, factors)
         VALUES ($1, $2, ST_GeogFromText($3), ST_GeogFromText($4), $5, $6, $7, $8::jsonb)`,
        [
          routeId,
          segment.seq,
          toLineStringWkt(segment.path),
          toPointWkt(segment.midpoint),
          segment.lengthM,
          segment.score,
          segment.label,
          JSON.stringify({ factors: segment.factors, counts: segment.counts, alerts: segment.alerts }),
        ],
      );
    }

    return routeId;
  });
}

/**
 * POST /api/routes — the core flow: fetch alternatives, score each one,
 * rank them and recommend the safest.
 */
export async function planRoutes(req, res) {
  const { origin, destination, departAt, persist } = req.body;

  const alternatives = await routingProvider.getAlternatives(origin, destination);
  const at = departAt ? new Date(departAt) : new Date();

  // District baseline needs a place name; a failed lookup must not break scoring.
  let place = null;
  try {
    place = await routingProvider.reverseGeocode(origin[0], origin[1]);
  } catch {
    place = null;
  }

  const scored = await compareRoutes(alternatives, {
    at,
    state: place?.state,
    district: place?.district,
  });

  if (persist) {
    await Promise.all(
      scored.map(async (route) => {
        route.savedId = await saveRoute(route, req.user?.id ?? null);
      }),
    );
  }

  res.json({
    origin,
    destination,
    departAt: at.toISOString(),
    context: place,
    provider: routingProvider.name,
    routes: scored.map((route) => ({
      id: route.savedId ?? route.id,
      name: route.name,
      distanceM: route.distanceM,
      durationS: route.durationS,
      recommended: route.recommended,
      risk: {
        score: route.risk.score,
        label: route.risk.label,
        reasons: route.risk.reasons,
        worstSegment: route.risk.worstSegment,
        disclaimer: route.risk.disclaimer,
        // What the score could and could not take into account. The UI shows
        // this — a number without its coverage is a claim we cannot support.
        coverage: route.risk.coverage,
        factorWeights: route.risk.factorWeights,
      },
      path: route.path,
      segments: route.risk.segments.map((s) => ({
        seq: s.seq,
        score: s.score,
        label: s.label,
        lengthM: s.lengthM,
        midpoint: s.midpoint,
        counts: s.counts,
        path: s.path,
      })),
    })),
  });
}

/** POST /api/routes/score — score a client-supplied path without routing. */
export async function scoreExistingPath(req, res) {
  const { path, departAt, state, district } = req.body;
  const risk = await scoreRoute(path, {
    at: departAt ? new Date(departAt) : new Date(),
    state,
    district,
  });
  res.json({ risk });
}

export async function getRoute(req, res) {
  const { rows } = await query(
    `SELECT id, distance_m, duration_s, risk_score, risk_label, risk_breakdown,
            scored_for_at, created_at,
            ST_AsGeoJSON(path) AS path_geojson
     FROM routes
     WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
    [req.params.id, req.user?.id ?? null],
  );
  if (rows.length === 0) throw notFound('Route not found');

  const segments = await query(
    `SELECT seq, length_m, risk_score, risk_label, factors,
            ST_AsGeoJSON(geom) AS geom_geojson
     FROM route_segments WHERE route_id = $1 ORDER BY seq`,
    [req.params.id],
  );

  const row = rows[0];
  const asLatLng = (geojson) =>
    JSON.parse(geojson).coordinates.map(([lng, lat]) => [lat, lng]);

  res.json({
    route: {
      id: row.id,
      distanceM: Number(row.distance_m),
      durationS: Number(row.duration_s),
      risk: {
        score: row.risk_score,
        label: row.risk_label,
        ...row.risk_breakdown,
      },
      scoredForAt: row.scored_for_at,
      createdAt: row.created_at,
      path: asLatLng(row.path_geojson),
      segments: segments.rows.map((s) => ({
        seq: s.seq,
        lengthM: Number(s.length_m),
        score: s.risk_score,
        label: s.risk_label,
        ...s.factors,
        path: asLatLng(s.geom_geojson),
      })),
    },
  });
}

/** GET /api/routes/geocode?q= — address lookup for the search boxes. */
export async function geocode(req, res) {
  const results = await routingProvider.geocode(req.query.q);
  res.json({ results });
}
