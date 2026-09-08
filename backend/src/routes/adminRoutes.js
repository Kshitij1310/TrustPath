import { Router } from 'express';
import { query } from '../config/db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth, requireAdmin);

/** GET /api/admin/overview — the dashboard's summary tiles. */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [counts, pending, openSos, activeJourneys] = await Promise.all([
      query(`
        SELECT
          (SELECT COUNT(*) FROM community_reports WHERE created_at::date = current_date) AS reports_today,
          (SELECT COUNT(*) FROM community_reports WHERE status = 'unverified') AS pending_reports,
          (SELECT COUNT(*) FROM community_reports WHERE status = 'verified') AS verified_reports,
          (SELECT COUNT(*) FROM journeys WHERE status IN ('active', 'overdue')) AS active_journeys,
          (SELECT COUNT(*) FROM sos_incidents WHERE status = 'open') AS open_sos,
          (SELECT COUNT(*) FROM safety_alerts
            WHERE expires_at IS NULL OR expires_at > now()) AS active_alerts
      `),
      query(`
        SELECT id, category, severity, created_at,
               ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
        FROM community_reports WHERE status = 'unverified'
        ORDER BY created_at DESC LIMIT 50
      `),
      query(`
        SELECT s.id, s.trigger, s.created_at, u.display_name,
               ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lng
        FROM sos_incidents s JOIN users u ON u.id = s.user_id
        WHERE s.status = 'open'
        ORDER BY s.created_at DESC LIMIT 50
      `),
      query(`
        SELECT id, label, status, started_at, eta_at
        FROM journeys WHERE status IN ('active', 'overdue', 'sos')
        ORDER BY eta_at ASC LIMIT 100
      `),
    ]);

    res.json({
      counts: counts.rows[0],
      pendingReports: pending.rows,
      openSos: openSos.rows,
      activeJourneys: activeJourneys.rows,
    });
  }),
);

/**
 * GET /api/admin/risk-zones — clusters of reports/incidents worth attention.
 * Grid-snaps points to ~1 km cells and returns the busiest ones.
 */
router.get(
  '/risk-zones',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      SELECT ROUND(ST_Y(geom::geometry)::numeric, 2) AS lat,
             ROUND(ST_X(geom::geometry)::numeric, 2) AS lng,
             COUNT(*) AS report_count,
             AVG(severity) AS avg_severity
      FROM community_reports
      WHERE status <> 'rejected' AND created_at > now() - interval '90 days'
      GROUP BY 1, 2
      HAVING COUNT(*) >= 2
      ORDER BY report_count DESC, avg_severity DESC
      LIMIT 100
    `);
    res.json({
      zones: rows.map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lng),
        reportCount: Number(r.report_count),
        avgSeverity: Number(Number(r.avg_severity).toFixed(2)),
      })),
    });
  }),
);

export default router;
