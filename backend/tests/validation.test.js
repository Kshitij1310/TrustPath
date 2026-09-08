import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinate, pathSchema } from '../src/middleware/validate.js';

test('coordinate schema accepts a valid [lat, lng] pair and coerces strings', () => {
  assert.deepEqual(coordinate.parse([21.2, 81.4]), [21.2, 81.4]);
  assert.deepEqual(coordinate.parse(['21.2', '81.4']), [21.2, 81.4]);
});

test('coordinate schema rejects out-of-range values', () => {
  assert.ok(!coordinate.safeParse([91, 81.4]).success);
  assert.ok(!coordinate.safeParse([21.2, -181]).success);
  assert.ok(!coordinate.safeParse([21.2]).success);
  assert.ok(!coordinate.safeParse('21.2,81.4').success);
});

test('path schema needs at least two coordinates', () => {
  assert.ok(!pathSchema.safeParse([[21.2, 81.4]]).success);
  assert.ok(pathSchema.safeParse([[21.2, 81.4], [21.3, 81.5]]).success);
});

test('path schema rejects a path containing an invalid point', () => {
  const result = pathSchema.safeParse([[21.2, 81.4], [999, 81.5]]);
  assert.ok(!result.success);
});
