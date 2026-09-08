import { query } from '../config/db.js';
import { forbidden, notFound } from '../utils/ApiError.js';
import { toPointWkt } from '../utils/geo.js';

const shape = (row) => ({
  id: row.id,
  lat: Number(row.lat),
  lng: Number(row.lng),
  category: row.category,
  description: row.description,
  severity: row.severity,
  status: row.status,
  upvotes: row.upvotes,
  imagePath: row.image_path,
  createdAt: row.created_at,
  distanceM: row.distance_m === undefined ? undefined : Math.round(Number(row.distance_m)),
});

const SELECT_COLUMNS = `
  id, category, description, severity, status, upvotes, image_path, created_at,
  ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
`;

export async function createReport(req, res) {
  const { lat, lng, category, description, severity } = req.body;
  const imagePath = req.file ? `${req.file.filename}` : null;

  const { rows } = await query(
    `INSERT INTO community_reports
       (user_id, geom, category, description, severity, image_path)
     VALUES ($1, ST_GeogFromText($2), $3, $4, $5, $6)
     RETURNING ${SELECT_COLUMNS}`,
    [req.user?.id ?? null, toPointWkt([lat, lng]), category, description ?? null, severity, imagePath],
  );

  // New reports start 'unverified' and are weighted down by the risk engine
  // until the trust system corroborates them.
  res.status(201).json({ report: shape(rows[0]) });
}

export async function listReports(req, res) {
  const { limit, category, status } = req.query;
  const { rows } = await query(
    `SELECT ${SELECT_COLUMNS}
     FROM community_reports
     WHERE status <> 'rejected'
       AND ($2::text IS NULL OR category = $2)
       AND ($3::text IS NULL OR status = $3)
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit, category ?? null, status ?? null],
  );
  res.json({ reports: rows.map(shape) });
}

export async function nearbyReports(req, res) {
  const { lat, lng, radius, limit } = req.query;
  const { rows } = await query(
    `SELECT ${SELECT_COLUMNS},
            ST_Distance(geom, ST_GeogFromText($1)) AS distance_m
     FROM community_reports
     WHERE status <> 'rejected'
       AND ST_DWithin(geom, ST_GeogFromText($1), $2)
     ORDER BY distance_m ASC
     LIMIT $3`,
    [toPointWkt([lat, lng]), radius, limit],
  );
  res.json({ reports: rows.map(shape) });
}

export async function upvoteReport(req, res) {
  const { rows } = await query(
    `UPDATE community_reports
     SET upvotes = upvotes + 1,
         -- enough independent agreement promotes it out of 'unverified'
         status = CASE WHEN status = 'unverified' AND upvotes + 1 >= 3
                       THEN 'corroborated' ELSE status END
     WHERE id = $1
     RETURNING ${SELECT_COLUMNS}`,
    [req.params.id],
  );
  if (rows.length === 0) throw notFound('Report not found');
  res.json({ report: shape(rows[0]) });
}

/** Admin moderation: verify or reject a report. */
export async function moderateReport(req, res) {
  const { rows } = await query(
    `UPDATE community_reports SET status = $2 WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
    [req.params.id, req.body.status],
  );
  if (rows.length === 0) throw notFound('Report not found');
  res.json({ report: shape(rows[0]) });
}

/** A user may delete their own report; an admin may delete any. */
export async function deleteReport(req, res) {
  const { rows } = await query('SELECT user_id FROM community_reports WHERE id = $1', [req.params.id]);
  if (rows.length === 0) throw notFound('Report not found');
  if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
    throw forbidden('You can only delete your own reports');
  }
  await query('DELETE FROM community_reports WHERE id = $1', [req.params.id]);
  res.json({ message: 'Report deleted' });
}

/**
 * GET /api/reports/heatmap — aggregated points for the map layers.
 * Returns weighted points rather than raw rows so the client can render a
 * heatmap without downloading every record.
 */
export async function heatmap(req, res) {
  const { minLat, minLng, maxLat, maxLng } = req.query;
  const box = [minLng, minLat, maxLng, maxLat];

  const [reports, incidents, alerts] = await Promise.all([
    query(
      `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, severity, status
       FROM community_reports
       WHERE status <> 'rejected'
         AND geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
       LIMIT 5000`,
      box,
    ),
    query(
      `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, severity
       FROM crime_incidents
       WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
       LIMIT 5000`,
      box,
    ),
    query(
      `SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng,
              severity, radius_m, alert_type
       FROM safety_alerts
       WHERE (expires_at IS NULL OR expires_at > now())
         AND geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
       LIMIT 1000`,
      box,
    ),
  ]);

  res.json({
    layers: {
      communityReports: reports.rows.map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lng),
        weight: (r.severity / 5) * (r.status === 'verified' ? 1 : 0.5),
      })),
      historicalIncidents: incidents.rows.map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lng),
        weight: r.severity / 5,
      })),
      activeAlerts: alerts.rows.map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lng),
        radiusM: r.radius_m,
        type: r.alert_type,
        weight: r.severity / 5,
      })),
    },
  });
}
