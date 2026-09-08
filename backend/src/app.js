import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { uploadRoot } from './middleware/upload.js';
import authRoutes from './routes/authRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import journeyRoutes from './routes/journeyRoutes.js';
import emergencyRoutes from './routes/emergencyRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import metaRoutes from './routes/metaRoutes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, cb) =>
        // Same-origin/curl requests have no Origin header; browsers always do.
        // In development, allow any origin — Vite hops ports when one is busy.
        !origin || !env.isProduction || env.corsOrigins.includes(origin)
          ? cb(null, true)
          : cb(new Error(`Origin ${origin} is not allowed`)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  if (!env.isProduction) app.use(morgan('dev'));

  app.get('/health', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT PostGIS_Version() AS postgis');
      res.json({ status: 'ok', database: 'connected', postgis: rows[0].postgis });
    } catch (err) {
      res.status(503).json({ status: 'degraded', database: 'unreachable', error: err.message });
    }
  });

  // Report photos. Served read-only; filenames are random UUIDs.
  app.use('/uploads', express.static(uploadRoot, { index: false, dotfiles: 'deny' }));

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/routes', routeRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/journeys', journeyRoutes);
  app.use('/api/emergency', emergencyRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/meta', metaRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
