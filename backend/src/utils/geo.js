const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two [lat, lng] points. */
export function haversineMeters(a, b) {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Total length in metres of a [lat, lng][] path. */
export function pathLengthMeters(path) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += haversineMeters(path[i - 1], path[i]);
  return total;
}

/** Linear interpolation between two points at fraction t (0..1). */
export function interpolate(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Split a path into consecutive chunks of roughly `targetMeters` each,
 * inserting interpolated points so every chunk starts where the last ended.
 * Returns an array of [lat, lng][] segments; never returns an empty array
 * for a path with at least two points.
 */
export function segmentPath(path, targetMeters = 500) {
  if (!Array.isArray(path) || path.length < 2) return [];

  const segments = [];
  let current = [path[0]];
  let accumulated = 0;

  for (let i = 1; i < path.length; i += 1) {
    let from = current[current.length - 1];
    const to = path[i];
    let remaining = haversineMeters(from, to);

    // The leg may span several segment boundaries — keep cutting.
    while (accumulated + remaining >= targetMeters) {
      const needed = targetMeters - accumulated;
      const legLength = haversineMeters(from, to);
      const t = legLength === 0 ? 1 : needed / legLength;
      const cut = interpolate(from, to, t);

      current.push(cut);
      segments.push(current);

      current = [cut];
      from = cut;
      accumulated = 0;
      remaining = haversineMeters(from, to);
      if (remaining < 1e-6) break;
    }

    accumulated += remaining;
    current.push(to);
  }

  // Fold a very short trailing remainder into the previous segment rather
  // than reporting a 30 m "segment" with its own risk score.
  if (current.length >= 2) {
    if (segments.length > 0 && pathLengthMeters(current) < targetMeters * 0.25) {
      segments[segments.length - 1].push(...current.slice(1));
    } else {
      segments.push(current);
    }
  }

  return segments;
}

/** Point at the halfway distance along a path. */
export function midpointOf(path) {
  const half = pathLengthMeters(path) / 2;
  let travelled = 0;
  for (let i = 1; i < path.length; i += 1) {
    const legLength = haversineMeters(path[i - 1], path[i]);
    if (travelled + legLength >= half) {
      const t = legLength === 0 ? 0 : (half - travelled) / legLength;
      return interpolate(path[i - 1], path[i], t);
    }
    travelled += legLength;
  }
  return path[Math.floor(path.length / 2)];
}

/** Perpendicular distance in metres from point p to the segment a–b. */
export function distanceToSegmentMeters(p, a, b) {
  // Project into a local metre-scale plane; fine for the few-hundred-metre
  // distances the deviation check cares about.
  const latRef = toRad((a[0] + b[0]) / 2);
  const x = (pt) => toRad(pt[1]) * Math.cos(latRef) * EARTH_RADIUS_M;
  const y = (pt) => toRad(pt[0]) * EARTH_RADIUS_M;

  const ax = x(a);
  const ay = y(a);
  const bx = x(b);
  const by = y(b);
  const px = x(p);
  const py = y(p);

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return haversineMeters(p, a);

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Shortest distance in metres from a point to a polyline. */
export function distanceToPathMeters(point, path) {
  if (!Array.isArray(path) || path.length === 0) return Infinity;
  if (path.length === 1) return haversineMeters(point, path[0]);
  let min = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    const d = distanceToSegmentMeters(point, path[i - 1], path[i]);
    if (d < min) min = d;
  }
  return min;
}

/** Reject anything that is not a plausible WGS84 coordinate pair. */
export function isValidCoordinate(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1])) &&
    Math.abs(Number(value[0])) <= 90 &&
    Math.abs(Number(value[1])) <= 180
  );
}

/** [lat, lng][] -> PostGIS WKT LINESTRING (which is lng lat order). */
export function toLineStringWkt(path) {
  const coords = path.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
  return `LINESTRING(${coords})`;
}

/** [lat, lng] -> PostGIS WKT POINT. */
export function toPointWkt([lat, lng]) {
  return `POINT(${lng} ${lat})`;
}
