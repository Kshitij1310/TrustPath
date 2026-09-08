import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  displayName: z.string().min(1).max(100),
  phone: z.string().min(6).max(20).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const settingsSchema = z
  .object({
    shareLiveLocation: z.boolean(),
    notifyContactsOnOverdue: z.boolean(),
    voiceSafetyEnabled: z.boolean(),
    journeyHistoryRetentionDays: z.number().int().min(1).max(365),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No settings provided');

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(controller.register));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(controller.login));
router.post('/logout', asyncHandler(controller.logout));
router.get('/me', requireAuth, asyncHandler(controller.me));
router.patch('/settings', requireAuth, validate(settingsSchema), asyncHandler(controller.updateSettings));
router.delete('/me', requireAuth, asyncHandler(controller.deleteAccount));

export default router;
