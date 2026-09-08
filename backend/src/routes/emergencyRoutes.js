import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/emergencyController.js';
import { requireAuth } from '../middleware/auth.js';
import { sosLimiter } from '../middleware/rateLimit.js';
import { latitude, longitude, uuid, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().regex(/^\+?[\d\s-]{6,20}$/, 'Enter a valid phone number'),
  relation: z.string().max(50).optional(),
  priority: z.coerce.number().int().min(1).max(10).default(1),
});

const sosSchema = z.object({
  lat: latitude.optional(),
  lng: longitude.optional(),
  journeyId: uuid.optional(),
  trigger: z.enum(['manual', 'overdue', 'deviation', 'voice', 'offline_sync']).default('manual'),
  notes: z.string().max(500).optional(),
  // Idempotency key so an offline queue can replay safely.
  clientRef: z.string().min(8).max(100).optional(),
});

const confirmSchema = z.object({
  attempts: z
    .array(
      z.object({
        channel: z.enum(['sms', 'call', 'whatsapp', 'share']),
        target: z.string().max(120),
        result: z.enum(['sent', 'failed', 'cancelled', 'unknown']),
        at: z.coerce.date().optional(),
      }),
    )
    .min(1),
});

const nearbySchema = z.object({
  lat: latitude,
  lng: longitude,
  radius: z.coerce.number().int().min(100).max(50_000).default(5000),
  kind: z
    .enum(['police', 'hospital', 'railway_station', 'petrol_pump', 'fire_station', 'public_place', 'other'])
    .optional(),
});

const idParam = z.object({ id: uuid });

router.get('/contacts', requireAuth, asyncHandler(controller.listContacts));
router.post('/contacts', requireAuth, validate(contactSchema), asyncHandler(controller.addContact));
router.delete('/contacts/:id', requireAuth, validate(idParam, 'params'), asyncHandler(controller.deleteContact));

router.post('/sos', sosLimiter, requireAuth, validate(sosSchema), asyncHandler(controller.triggerSos));
router.get('/sos', requireAuth, asyncHandler(controller.listSos));
router.get('/sos/:id', requireAuth, validate(idParam, 'params'), asyncHandler(controller.sosDetail));
router.post(
  '/sos/:id/confirm',
  requireAuth,
  validate(idParam, 'params'),
  validate(confirmSchema),
  asyncHandler(controller.confirmSos),
);
router.post(
  '/sos/:id/resolve',
  requireAuth,
  validate(idParam, 'params'),
  validate(z.object({ status: z.enum(['resolved', 'false_alarm']) })),
  asyncHandler(controller.resolveSos),
);

router.get('/facilities/nearby', validate(nearbySchema, 'query'), asyncHandler(controller.nearbyFacilities));

export default router;
