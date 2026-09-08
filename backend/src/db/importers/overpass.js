/**
 * Overpass API client.
 *
 * Overpass is free and needs no key, but the public instances are frequently
 * saturated — a 504 "server too busy" is routine, not exceptional. This client
 * therefore rotates through mirrors and backs off, rather than treating the
 * first failure as fatal.
 */

/**
 * Global-coverage mirrors only.
 *
 * Some public Overpass instances carry a regional extract rather than the
 * planet — overpass.osm.ch, for example, holds Switzerland only. Those are
 * worse than useless here: they answer an Indian query with a perfectly valid
 * `{"elements": []}`, which reads as "nothing there" instead of "wrong
 * server", and silently imports an empty dataset. Only add a mirror to this
 * list after checking it against a bounding box outside Europe.
 */
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const REQUEST_TIMEOUT_MS = 180_000;
const MAX_ROUNDS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Overpass reports errors as an HTML page with a 200 or 504 — detect both. */
function parseOrThrow(text, mirror) {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) {
    const match = trimmed.match(/<strong[^>]*>Error<\/strong>:\s*([^<]+)/i);
    throw new Error(`${mirror}: ${match ? match[1].trim() : 'non-JSON response'}`);
  }
  return JSON.parse(text);
}

/**
 * Run an Overpass QL query, trying each mirror in turn and retrying the whole
 * set with increasing delay.
 *
 * @param {string} ql        Overpass QL, without the [out:json] header
 * @param {(msg: string) => void} [log]
 */
export async function overpassQuery(ql, log = () => {}) {
  const body = `[out:json][timeout:180];\n${ql}`;
  const failures = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    for (const mirror of MIRRORS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        log(`  querying ${new URL(mirror).host}…`);
        const response = await fetch(mirror, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Overpass asks for an identifying User-Agent, same as Nominatim.
            'User-Agent': process.env.GEOCODER_USER_AGENT || 'TrustRoute/0.1',
          },
          body: new URLSearchParams({ data: body }),
          signal: controller.signal,
        });

        const text = await response.text();
        if (!response.ok && !text.trimStart().startsWith('{')) {
          throw new Error(`${new URL(mirror).host}: HTTP ${response.status}`);
        }

        const json = parseOrThrow(text, new URL(mirror).host);
        log(`  ok — ${json.elements?.length ?? 0} element(s)`);
        return json;
      } catch (err) {
        failures.push(err.message);
        log(`  failed: ${err.message}`);
      } finally {
        clearTimeout(timer);
      }
    }

    if (round < MAX_ROUNDS - 1) {
      const delay = 15_000 * (round + 1);
      log(`  all mirrors busy — waiting ${delay / 1000}s before retrying`);
      await sleep(delay);
    }
  }

  throw new Error(
    `Every Overpass mirror failed after ${MAX_ROUNDS} rounds. Last errors:\n  ${failures
      .slice(-MIRRORS.length)
      .join('\n  ')}\n` +
      'This is usually temporary load on the public instances — try again in a few minutes.',
  );
}

/**
 * Emergency infrastructure. `nwr` catches nodes, ways and relations, since a
 * hospital is often mapped as a building outline rather than a single point;
 * `out center` collapses those to a representative coordinate.
 */
export function emergencyQuery(bbox) {
  const b = bbox.join(',');
  return `
(
  nwr["amenity"="police"](${b});
  nwr["amenity"="hospital"](${b});
  nwr["amenity"="clinic"](${b});
  nwr["amenity"="fire_station"](${b});
  nwr["amenity"="pharmacy"](${b});
  nwr["amenity"="fuel"](${b});
  nwr["railway"="station"](${b});
);
out center tags;`;
}

/** Street lamps — the lighting signal. Always nodes in practice. */
export function lampQuery(bbox) {
  return `
(
  node["highway"="street_lamp"](${bbox.join(',')});
);
out body;`;
}

/**
 * Places that imply other people are around: shops, food, banks, schools.
 * Deliberately not every POI in OSM — a postbox does not mean a street is
 * overlooked.
 */
export function activityQuery(bbox) {
  const b = bbox.join(',');
  return `
(
  nwr["shop"](${b});
  nwr["amenity"~"^(restaurant|cafe|fast_food|bar|bank|atm|marketplace|school|college|university|place_of_worship|cinema|library)$"](${b});
  nwr["office"](${b});
);
out center tags;`;
}

/** OSM element -> { lat, lng } | null. `center` is present on ways/relations. */
export function coordsOf(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.center) return { lat: element.center.lat, lng: element.center.lon };
  return null;
}

/** Map OSM tags onto our `emergency_locations.kind` enum. */
export function facilityKind(tags = {}) {
  if (tags.amenity === 'police') return 'police';
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'hospital';
  if (tags.amenity === 'fire_station') return 'fire_station';
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.amenity === 'fuel') return 'petrol_pump';
  if (tags.railway === 'station') return 'railway_station';
  return 'other';
}
