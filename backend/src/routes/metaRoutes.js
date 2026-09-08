import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

/**
 * GET /api/meta/data-provenance
 *
 * Where the data on screen came from. Public and unauthenticated on purpose:
 * the demo-data notice has to render before anyone signs in, and there is
 * nothing sensitive in a count.
 */
router.get(
  '/data-provenance',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(`
      SELECT
        (SELECT COUNT(*) FROM crime_incidents  WHERE source = 'demo') AS demo_incidents,
        (SELECT COUNT(*) FROM community_reports WHERE source = 'demo') AS demo_reports,
        (SELECT COUNT(*) FROM safety_alerts     WHERE source = 'demo') AS demo_alerts,
        (SELECT COUNT(*) FROM crime_incidents  WHERE source <> 'demo') AS real_incidents,
        (SELECT COUNT(*) FROM emergency_locations WHERE source = 'osm') AS osm_facilities,
        (SELECT COUNT(*) FROM osm_features) AS osm_features
    `);
    const c = rows[0];

    const demo = {
      incidents: Number(c.demo_incidents),
      reports: Number(c.demo_reports),
      alerts: Number(c.demo_alerts),
    };
    const usingDemoData = demo.incidents + demo.reports + demo.alerts > 0;

    res.json({
      usingDemoData,
      counts: demo,
      real: {
        incidents: Number(c.real_incidents),
        osmFacilities: Number(c.osm_facilities),
        osmFeatures: Number(c.osm_features),
      },
      note: usingDemoData
        ? 'Some data in this database is seeded demonstration data, tagged source = demo. It does not describe real events.'
        : null,
      attribution: 'Infrastructure data © OpenStreetMap contributors, ODbL.',
    });
  }),
);

export default router;
