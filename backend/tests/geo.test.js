import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceToPathMeters,
  haversineMeters,
  isValidCoordinate,
  midpointOf,
  pathLengthMeters,
  segmentPath,
  toLineStringWkt,
  toPointWkt,
} from '../src/utils/geo.js';

const DURG = [21.1982964, 81.4007922];
const BHILAI = [21.2120677, 81.3732849];

test('haversine matches the known Durg–Bhilai distance within 5%', () => {
  const d = haversineMeters(DURG, BHILAI);
  assert.ok(d > 3000 && d < 3600, `expected ~3.3 km, got ${Math.round(d)} m`);
});

test('haversine is zero for identical points', () => {
  assert.equal(haversineMeters(DURG, DURG), 0);
});

test('segmentPath produces segments of about the target length', () => {
  // A straight north-bound line roughly 5.5 km long.
  const path = [];
  for (let i = 0; i <= 50; i += 1) path.push([21.2 + i * 0.001, 81.4]);

  const segments = segmentPath(path, 500);
  assert.ok(segments.length >= 9, `expected ~11 segments, got ${segments.length}`);

  for (const segment of segments) {
    const length = pathLengthMeters(segment);
    assert.ok(length > 100 && length < 800, `segment length out of range: ${Math.round(length)} m`);
  }
});

test('segmentPath preserves the whole route length', () => {
  const path = [[21.2, 81.4], [21.25, 81.45], [21.3, 81.4]];
  const total = pathLengthMeters(path);
  const segments = segmentPath(path, 500);
  const summed = segments.reduce((sum, s) => sum + pathLengthMeters(s), 0);
  assert.ok(Math.abs(total - summed) < total * 0.01, `${summed} vs ${total}`);
});

test('segmentPath refuses a path with fewer than two points', () => {
  assert.deepEqual(segmentPath([[21.2, 81.4]], 500), []);
  assert.deepEqual(segmentPath([], 500), []);
});

test('segments are contiguous — each starts where the previous ended', () => {
  const path = [[21.2, 81.4], [21.24, 81.44]];
  const segments = segmentPath(path, 500);
  for (let i = 1; i < segments.length; i += 1) {
    const prevEnd = segments[i - 1][segments[i - 1].length - 1];
    assert.ok(haversineMeters(prevEnd, segments[i][0]) < 1, `gap at segment ${i}`);
  }
});

test('midpointOf lands halfway along the path', () => {
  const path = [[21.0, 81.0], [21.0, 81.02]];
  const mid = midpointOf(path);
  const toStart = haversineMeters(mid, path[0]);
  const toEnd = haversineMeters(mid, path[1]);
  assert.ok(Math.abs(toStart - toEnd) < 5, `${toStart} vs ${toEnd}`);
});

test('distanceToPathMeters is ~0 on the route and large off it', () => {
  const path = [[21.0, 81.0], [21.0, 81.05]];
  assert.ok(distanceToPathMeters([21.0, 81.02], path) < 5);

  const offRoute = distanceToPathMeters([21.01, 81.02], path);
  assert.ok(offRoute > 900 && offRoute < 1300, `expected ~1.1 km, got ${Math.round(offRoute)}`);
});

test('distanceToPathMeters clamps to the segment ends, not the infinite line', () => {
  const path = [[21.0, 81.0], [21.0, 81.01]];
  // Well past the end of the segment.
  const d = distanceToPathMeters([21.0, 81.05], path);
  const expected = haversineMeters([21.0, 81.05], [21.0, 81.01]);
  assert.ok(Math.abs(d - expected) < 5, `${d} vs ${expected}`);
});

test('coordinate validation rejects malformed and out-of-range input', () => {
  assert.ok(isValidCoordinate([21.2, 81.4]));
  assert.ok(!isValidCoordinate([91, 81.4]));
  assert.ok(!isValidCoordinate([21.2, 181]));
  assert.ok(!isValidCoordinate(['abc', 81.4]));
  assert.ok(!isValidCoordinate([21.2]));
  assert.ok(!isValidCoordinate(null));
});

test('WKT helpers emit lng-lat order for PostGIS', () => {
  assert.equal(toPointWkt([21.2, 81.4]), 'POINT(81.4 21.2)');
  assert.equal(toLineStringWkt([[21.2, 81.4], [21.3, 81.5]]), 'LINESTRING(81.4 21.2, 81.5 21.3)');
});
