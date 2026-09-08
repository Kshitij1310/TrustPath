import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
};

// eslint-disable-next-line no-unused-vars -- Express identifies this by arity
export const errorHandler = (err, req, res, next) => {
  const status = err instanceof ApiError ? err.status : err.status || 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  }

  const body = {
    error: status >= 500 && env.isProduction ? 'Internal server error' : err.message,
  };
  if (err.details) body.details = err.details;
  if (!env.isProduction && status >= 500) body.stack = err.stack;

  res.status(status).json(body);
};
