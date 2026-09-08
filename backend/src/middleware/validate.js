import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Validate one part of the request against a zod schema and replace it with
 * the parsed value, so handlers only ever see coerced, trusted data.
 */
export const validate = (schema, part = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[part]);
  if (!result.success) {
    return next(
      new ApiError(
        400,
        'Validation failed',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      ),
    );
  }
  req[part] = result.data;
  return next();
};

// ---- shared primitives -------------------------------------------------

export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);

/** A [lat, lng] pair — the wire format used everywhere in this API. */
export const coordinate = z.tuple([latitude, longitude]);

export const pathSchema = z
  .array(coordinate)
  .min(2, 'A path needs at least two coordinates')
  .max(20_000, 'Path is too long');

export const uuid = z.string().uuid();
