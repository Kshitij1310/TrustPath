import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { forbidden, unauthorized } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
}

function tokenFromRequest(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Require a valid token; attaches req.user = { id, role }. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = tokenFromRequest(req);
  if (!token) return next(unauthorized());

  const payload = verifyToken(token);
  if (!payload) return next(unauthorized('Invalid or expired token'));

  // Confirm the user still exists — a deleted account must not keep access.
  const { rows } = await query('SELECT id, role FROM users WHERE id = $1', [payload.sub]);
  if (rows.length === 0) return next(unauthorized('Account no longer exists'));

  req.user = rows[0];
  return next();
});

/** Attach req.user when a token is present, but never reject. */
export const optionalAuth = (req, _res, next) => {
  const token = tokenFromRequest(req);
  if (!token) return next();
  const payload = verifyToken(token);
  if (payload) req.user = { id: payload.sub, role: payload.role };
  return next();
};

export const requireAdmin = (req, _res, next) => {
  if (req.user?.role !== 'admin') return next(forbidden('Admin access required'));
  return next();
};
