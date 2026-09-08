import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

const TIMEOUT_MS = 12_000;

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      // Public OSRM/Nominatim rate-limit us; surface that honestly upstream.
      throw new ApiError(res.status === 429 ? 429 : 502, `Routing provider responded ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') throw new ApiError(504, 'Routing provider timed out');
    throw new ApiError(502, `Routing provider unreachable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export const osrmProvider = {
  name: 'osrm',

  /**
   * Ask OSRM for up to three driving alternatives.
   * OSRM speaks lng,lat and returns GeoJSON coordinates in the same order —
   * we normalise everything to [lat, lng] at this boundary.
   */
  async getAlternatives(origin, destination) {
    const coords = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
    const url =
      `${env.osrmBaseUrl}/route/v1/driving/${coords}` +
      '?alternatives=3&overview=full&geometries=geojson&steps=false';

    const data = await fetchJson(url);
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      throw new ApiError(404, 'No route found between those points');
    }

    return data.routes.map((route, idx) => ({
      id: `alt-${idx}`,
      name: `Route ${String.fromCharCode(65 + idx)}`,
      path: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceM: Math.round(route.distance),
      durationS: Math.round(route.duration),
    }));
  },

  async geocode(text) {
    const url =
      `${env.nominatimBaseUrl}/search?format=jsonv2&limit=5&addressdetails=1` +
      `&q=${encodeURIComponent(text)}`;
    const data = await fetchJson(url, { 'User-Agent': env.geocoderUserAgent });
    return (Array.isArray(data) ? data : []).map((item) => ({
      label: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      state: item.address?.state ?? null,
      district: item.address?.state_district ?? item.address?.county ?? null,
    }));
  },

  async reverseGeocode(lat, lng) {
    const url =
      `${env.nominatimBaseUrl}/reverse?format=jsonv2&addressdetails=1` +
      `&lat=${lat}&lon=${lng}`;
    const data = await fetchJson(url, { 'User-Agent': env.geocoderUserAgent });
    if (!data || data.error) return null;
    return {
      label: data.display_name ?? null,
      state: data.address?.state ?? null,
      district: data.address?.state_district ?? data.address?.county ?? null,
    };
  },
};
