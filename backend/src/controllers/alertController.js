import { query } from '../config/db.js';
import { notFound } from '../utils/ApiError.js';
import { toPointWkt } from '../utils/geo.js';

const shape = (row) => ({
  id: row.id,
  lat: Number(row.lat),
  lng: Number(row.lng),
  radiusM: row.radius_m,
  alertType: row.alert_type,
  description: row.description,
  severity: row.severity,
  activeFrom: row.active_from,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  distanceM: row.distance_m === undefined ? undefined : Math.round(Number(row.distance_m)),
});

const COLUMNS = `
  id, radius_m, alert_type, description, severity, active_from, expires_at, created_at,
  ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
`;

export async function createAlert(req, res) {
  const { lat, lng, radiusM, alertType, description, severity, expiresAt } = req.body;
  const { rows } = await query(
    `INSERT INTO safety_alerts
       (created_by, geom, radius_m, alert_type, description, severity, expires_at)
     VALUES ($1, ST_GeogFromText($2), $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [req.user.id, toPointWkt([lat, lng]), radiusM, alertType, description ?? null, severity, expiresAt ?? null],
  );
  res.status(201).json({ alert: shape(rows[0]) });
}

export async function listAlerts(req, res) {
  const { includeExpired, limit } = req.query;
  const { rows } = await query(
    `SELECT ${COLUMNS}
     FROM safety_alerts
     WHERE $2::boolean OR expires_at IS NULL OR expires_at > now()
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit, includeExpired],
  );
  res.json({ alerts: rows.map(shape) });
}

export async function nearbyAlerts(req, res) {
  const { lat, lng, radius } = req.query;
  const { rows } = await query(
    `SELECT ${COLUMNS}, ST_Distance(geom, ST_GeogFromText($1)) AS distance_m
     FROM safety_alerts
     WHERE (expires_at IS NULL OR expires_at > now())
       AND ST_DWithin(geom, ST_GeogFromText($1), $2 + radius_m)
     ORDER BY distance_m ASC
     LIMIT 100`,
    [toPointWkt([lat, lng]), radius],
  );
  res.json({ alerts: rows.map(shape) });
}

export async function deleteAlert(req, res) {
  const { rowCount } = await query('DELETE FROM safety_alerts WHERE id = $1', [req.params.id]);
  if (rowCount === 0) throw notFound('Alert not found');
  res.json({ message: 'Alert deleted' });
}
