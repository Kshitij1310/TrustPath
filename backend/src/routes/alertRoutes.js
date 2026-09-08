import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/alertController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { latitude, longitude, uuid, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const createSchema = z.object({
  lat: latitude,
  lng: longitude,
  radiusM: z.coerce.number().int().min(50).max(20_000).default(500),
  alertType: z.string().min(2).max(60),
  description: z.string().max(1000).optional(),
  severity: z.coerce.number().int().min(1).max(5).default(3),
  expiresAt: z.coerce.date().optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  includeExpired: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const nearbySchema = z.object({
  lat: latitude,
  lng: longitude,
  radius: z.coerce.number().int().min(10).max(50_000).default(2000),
});

// Alerts influence everyone's risk score, so only admins may publish them.
router.post('/', requireAuth, requireAdmin, validate(createSchema), asyncHandler(controller.createAlert));
router.get('/', validate(listSchema, 'query'), asyncHandler(controller.listAlerts));
router.get('/nearby', validate(nearbySchema, 'query'), asyncHandler(controller.nearbyAlerts));
router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(z.object({ id: uuid }), 'params'),
  asyncHandler(controller.deleteAlert),
);

export default router;
