import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { query } from '../../config/db.js';
import { distanceToPathMeters, toPointWkt } from '../../utils/geo.js';
import { forbidden, notFound } from '../../utils/ApiError.js';

export const journeyShape = (row) => ({
  id: row.id,
  routeId: row.route_id,
  label: row.label,
  status: row.status,
  startedAt: row.started_at,
  etaAt: row.eta_at,
  endedAt: row.ended_at,
  lastCheckInAt: row.last_check_in_at,
  shareExpiresAt: row.share_expires_at,
});

export const JOURNEY_COLUMNS = `
  id, route_id, label, status, started_at, eta_at, ended_at,
  last_check_in_at, share_expires_at
`;

async function loadOwnedJourney(journeyId, userId) {
  const { rows } = await query(`SELECT ${JOURNEY_COLUMNS}, user_id FROM journeys WHERE id = $1`, [journeyId]);
  if (rows.length === 0) throw notFound('Journey not found');
  if (rows[0].user_id !== userId) throw forbidden('That journey belongs to another user');
  return rows[0];
}

export async function recordEvent(journeyId, kind, payload = null) {
  const { rows } = await query(
    `INSERT INTO journey_events (journey_id, kind, payload)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, kind, payload, created_at`,
    [journeyId, kind, payload ? JSON.stringify(payload) : null],
  );
  return rows[0];
}

export async function startJourney({ userId, routeId, label, etaMinutes, share }) {
  const { rows } = await query(
    `INSERT INTO journeys
       (user_id, route_id, label, eta_at, share_token, share_expires_at)
     VALUES ($1, $2, $3,
             now() + make_interval(mins => $4::int),
             $5,
             CASE WHEN $5::text IS NULL THEN NULL
                  ELSE now() + make_interval(mins => $4::int + 120) END)
     RETURNING ${JOURNEY_COLUMNS}, share_token`,
    [
      userId,
      routeId ?? null,
      label ?? null,
      etaMinutes,
      // A high-entropy, unguessable token — the share link is the only
      // credential a trusted contact has.
      share ? crypto.randomBytes(24).toString('base64url') : null,
    ],
  );

  await recordEvent(rows[0].id, 'started', { etaMinutes, routeId: routeId ?? null });
  return { ...journeyShape(rows[0]), shareToken: rows[0].share_token };
}

/** Planned path for a journey as [lat, lng][], or null when it had no route. */
async function plannedPath(journeyId) {
  const { rows } = await query(
    `SELECT ST_AsGeoJSON(r.path) AS path
     FROM journeys j JOIN routes r ON r.id = j.route_id
     WHERE j.id = $1`,
    [journeyId],
  );
  if (rows.length === 0 || !rows[0].path) return null;
  return JSON.parse(rows[0].path).coordinates.map(([lng, lat]) => [lat, lng]);
}

/**
 * Ingest a GPS ping. Returns the stored position plus any state change
 * (deviation, back-on-route, overdue) the caller should broadcast.
 */
export async function pushLocation({ userId, journeyId, lat, lng, accuracyM, speedMps }) {
  const journey = await loadOwnedJourney(journeyId, userId);
  if (journey.status !== 'active' && journey.status !== 'overdue') {
    throw forbidden(`Journey is ${journey.status} and no longer accepts locations`);
  }

  const path = await plannedPath(journeyId);
  const deviationM = path ? distanceToPathMeters([lat, lng], path) : null;

  await query(
    `INSERT INTO journey_locations (journey_id, geom, accuracy_m, speed_mps, deviation_m)
     VALUES ($1, ST_GeogFromText($2), $3, $4, $5)`,
    [journeyId, toPointWkt([lat, lng]), accuracyM ?? null, speedMps ?? null, deviationM],
  );

  const events = [];
  const isDeviating = deviationM !== null && deviationM > env.deviationThresholdMeters;

  if (isDeviating) {
    // Only raise a deviation once per excursion, not on every ping.
    const { rows: recent } = await query(
      `SELECT kind FROM journey_events
       WHERE journey_id = $1 AND kind IN ('deviation', 'back_on_route')
       ORDER BY created_at DESC LIMIT 1`,
      [journeyId],
    );
    if (recent[0]?.kind !== 'deviation') {
      events.push(
        await recordEvent(journeyId, 'deviation', {
          deviationM: Math.round(deviationM),
          thresholdM: env.deviationThresholdMeters,
        }),
      );
    }
  } else if (deviationM !== null) {
    const { rows: recent } = await query(
      `SELECT kind FROM journey_events
       WHERE journey_id = $1 AND kind IN ('deviation', 'back_on_route')
       ORDER BY created_at DESC LIMIT 1`,
      [journeyId],
    );
    if (recent[0]?.kind === 'deviation') {
      events.push(await recordEvent(journeyId, 'back_on_route', { deviationM: Math.round(deviationM) }));
    }
  }

  return {
    journeyId,
    position: { lat, lng },
    deviationM: deviationM === null ? null : Math.round(deviationM),
    deviating: isDeviating,
    events,
  };
}

/** "I'm safe" — clears an overdue state and extends the ETA if asked. */
export async function checkIn({ userId, journeyId, extendMinutes }) {
  await loadOwnedJourney(journeyId, userId);
  const { rows } = await query(
    `UPDATE journeys
     SET last_check_in_at = now(),
         status = CASE WHEN status = 'overdue' THEN 'active' ELSE status END,
         eta_at = CASE WHEN $2::int > 0
                       THEN GREATEST(eta_at, now()) + make_interval(mins => $2::int)
                       ELSE eta_at END
     WHERE id = $1
     RETURNING ${JOURNEY_COLUMNS}`,
    [journeyId, extendMinutes ?? 0],
  );
  await recordEvent(journeyId, 'checked_in', { extendMinutes: extendMinutes ?? 0 });
  return journeyShape(rows[0]);
}

export async function endJourney({ userId, journeyId, status = 'completed' }) {
  await loadOwnedJourney(journeyId, userId);
  const { rows } = await query(
    `UPDATE journeys
     SET status = $2, ended_at = now(), share_token = NULL, share_expires_at = NULL
     WHERE id = $1
     RETURNING ${JOURNEY_COLUMNS}`,
    [journeyId, status],
  );
  await recordEvent(journeyId, status === 'cancelled' ? 'cancelled' : 'ended');
  return journeyShape(rows[0]);
}

export async function getJourneyDetail({ userId, journeyId }) {
  const journey = await loadOwnedJourney(journeyId, userId);
  const [locations, events] = await Promise.all([
    query(
      `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng,
              accuracy_m, deviation_m, recorded_at
       FROM journey_locations WHERE journey_id = $1
       ORDER BY recorded_at DESC LIMIT 200`,
      [journeyId],
    ),
    query(
      `SELECT kind, payload, created_at FROM journey_events
       WHERE journey_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [journeyId],
    ),
  ]);

  return {
    ...journeyShape(journey),
    locations: locations.rows.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lng),
      accuracyM: r.accuracy_m === null ? null : Number(r.accuracy_m),
      deviationM: r.deviation_m === null ? null : Math.round(Number(r.deviation_m)),
      recordedAt: r.recorded_at,
    })),
    events: events.rows,
  };
}

export async function listJourneys(userId) {
  const { rows } = await query(
    `SELECT ${JOURNEY_COLUMNS} FROM journeys
     WHERE user_id = $1 ORDER BY started_at DESC LIMIT 50`,
    [userId],
  );
  return rows.map(journeyShape);
}

/**
 * Read-only view for a trusted contact holding a share link.
 * Exposes the minimum needed: latest position, ETA and status — no history,
 * no user identity beyond a display name.
 */
export async function getSharedJourney(token) {
  const { rows } = await query(
    `SELECT j.id, j.label, j.status, j.eta_at, j.started_at, u.display_name
     FROM journeys j JOIN users u ON u.id = j.user_id
     WHERE j.share_token = $1
       AND (j.share_expires_at IS NULL OR j.share_expires_at > now())`,
    [token],
  );
  if (rows.length === 0) throw notFound('This share link is invalid or has expired');
  const journey = rows[0];

  const { rows: last } = await query(
    `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, recorded_at
     FROM journey_locations WHERE journey_id = $1
     ORDER BY recorded_at DESC LIMIT 1`,
    [journey.id],
  );

  return {
    travellerName: journey.display_name,
    label: journey.label,
    status: journey.status,
    startedAt: journey.started_at,
    etaAt: journey.eta_at,
    lastKnownPosition: last[0]
      ? { lat: Number(last[0].lat), lng: Number(last[0].lng), recordedAt: last[0].recorded_at }
      : null,
  };
}

/**
 * The dead-man switch. Flips past-ETA journeys to 'overdue' and returns them
 * so the caller can notify. Run by the scheduled sweeper.
 */
export async function markOverdueJourneys() {
  const { rows } = await query(
    `UPDATE journeys
     SET status = 'overdue'
     WHERE status = 'active'
       AND eta_at + make_interval(mins => $1::int) < now()
     RETURNING id, user_id, label, eta_at`,
    [env.overdueGraceMinutes],
  );
  for (const row of rows) {
    await recordEvent(row.id, 'overdue', { etaAt: row.eta_at, graceMinutes: env.overdueGraceMinutes });
  }
  return rows;
}
