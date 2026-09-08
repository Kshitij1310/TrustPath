import rateLimit from 'express-rate-limit';

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
};

/** Broad limit on the whole API surface. */
export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 120 });

/** Login/register are brute-force targets. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
});

/** Route scoring hits the public routing provider, which rate-limits us. */
export const routingLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 20 });

/** Reports create rows and accept uploads. */
export const reportLimiter = rateLimit({ ...base, windowMs: 60 * 60_000, limit: 20 });

/**
 * SOS is generous on purpose — a person in trouble may tap it repeatedly, and
 * throttling an emergency is worse than a few duplicate rows.
 */
export const sosLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 30 });
