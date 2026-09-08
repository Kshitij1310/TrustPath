import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/journeyController.js';
import { requireAuth } from '../middleware/auth.js';
import { latitude, longitude, uuid, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const createSchema = z.object({
  routeId: uuid.optional(),
  label: z.string().max(120).optional(),
  etaMinutes: z.coerce.number().int().min(1).max(1440),
  // Sharing is explicit per journey, never a default.
  share: z.boolean().default(false),
});

const locationSchema = z.object({
  lat: latitude,
  lng: longitude,
  accuracyM: z.coerce.number().min(0).max(10_000).optional(),
  speedMps: z.coerce.number().min(0).max(200).optional(),
});

const idParam = z.object({ id: uuid });

// A trusted contact's read-only view — declared before the authed routes so
// the token path is not shadowed.
router.get(
  '/shared/:token',
  validate(z.object({ token: z.string().min(20).max(120) }), 'params'),
  asyncHandler(controller.shared),
);

router.post('/', requireAuth, validate(createSchema), asyncHandler(controller.create));
router.get('/', requireAuth, asyncHandler(controller.list));
router.get('/:id', requireAuth, validate(idParam, 'params'), asyncHandler(controller.detail));

router.post(
  '/:id/location',
  requireAuth,
  validate(idParam, 'params'),
  validate(locationSchema),
  asyncHandler(controller.pushLocation),
);

// "I'm Safe" — clears an overdue state, optionally extending the ETA.
router.post(
  '/:id/safe',
  requireAuth,
  validate(idParam, 'params'),
  validate(z.object({ extendMinutes: z.coerce.number().int().min(0).max(720).default(0) })),
  asyncHandler(controller.checkIn),
);

router.post(
  '/:id/end',
  requireAuth,
  validate(idParam, 'params'),
  validate(z.object({ status: z.enum(['completed', 'cancelled']).default('completed') })),
  asyncHandler(controller.end),
);

export default router;
