import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/reportController.js';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js';
import { reportLimiter } from '../middleware/rateLimit.js';
import { handleUpload } from '../middleware/upload.js';
import { latitude, longitude, uuid, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const CATEGORIES = [
  'unsafe_area',
  'poor_lighting',
  'harassment',
  'suspicious_activity',
  'crime',
  'road_issue',
  'other',
];

// Multipart bodies arrive as strings, so every field is coerced.
const createSchema = z.object({
  lat: latitude,
  lng: longitude,
  category: z.enum(CATEGORIES),
  description: z.string().max(1000).optional(),
  severity: z.coerce.number().int().min(1).max(5).default(2),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(['unverified', 'corroborated', 'verified']).optional(),
});

const nearbySchema = z.object({
  lat: latitude,
  lng: longitude,
  radius: z.coerce.number().int().min(10).max(50_000).default(1000),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const bboxSchema = z.object({
  minLat: latitude,
  minLng: longitude,
  maxLat: latitude,
  maxLng: longitude,
});

router.post('/', reportLimiter, optionalAuth, handleUpload, validate(createSchema), asyncHandler(controller.createReport));
router.get('/', validate(listSchema, 'query'), asyncHandler(controller.listReports));
router.get('/nearby', validate(nearbySchema, 'query'), asyncHandler(controller.nearbyReports));
router.get('/heatmap', validate(bboxSchema, 'query'), asyncHandler(controller.heatmap));
router.post('/:id/upvote', requireAuth, validate(z.object({ id: uuid }), 'params'), asyncHandler(controller.upvoteReport));
router.patch(
  '/:id/moderate',
  requireAuth,
  requireAdmin,
  validate(z.object({ id: uuid }), 'params'),
  validate(z.object({ status: z.enum(['verified', 'rejected', 'corroborated']) })),
  asyncHandler(controller.moderateReport),
);
router.delete('/:id', requireAuth, validate(z.object({ id: uuid }), 'params'), asyncHandler(controller.deleteReport));

export default router;
