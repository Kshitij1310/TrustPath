import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/routeController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { routingLimiter } from '../middleware/rateLimit.js';
import { coordinate, pathSchema, uuid, validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const planSchema = z.object({
  origin: coordinate,
  destination: coordinate,
  departAt: z.coerce.date().optional(),
  persist: z.boolean().default(false),
});

const scoreSchema = z.object({
  path: pathSchema,
  departAt: z.coerce.date().optional(),
  state: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
});

router.post('/', routingLimiter, optionalAuth, validate(planSchema), asyncHandler(controller.planRoutes));
router.post('/score', routingLimiter, optionalAuth, validate(scoreSchema), asyncHandler(controller.scoreExistingPath));
router.get(
  '/geocode',
  routingLimiter,
  validate(z.object({ q: z.string().min(2).max(200) }), 'query'),
  asyncHandler(controller.geocode),
);
router.get('/:id', requireAuth, validate(z.object({ id: uuid }), 'params'), asyncHandler(controller.getRoute));

export default router;
