import { osrmProvider } from './osrmProvider.js';

/**
 * Routing/geocoding is deliberately behind this interface so the provider can
 * be swapped (self-hosted OSRM, Valhalla, a paid SDK) without touching the
 * risk engine or the controllers.
 *
 * A provider must expose:
 *   getAlternatives(origin, destination) -> { id, path, distanceM, durationS }[]
 *   geocode(text)                        -> { label, lat, lng }[]
 *   reverseGeocode(lat, lng)             -> { label, state, district } | null
 */
export const routingProvider = osrmProvider;
