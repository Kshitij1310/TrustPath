import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 20_000,
};

const messageFor = (err) => {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission was denied. Enable it in your browser settings.';
    case err.POSITION_UNAVAILABLE:
      return 'Your location is currently unavailable.';
    case err.TIMEOUT:
      return 'Timed out while getting your location.';
    default:
      return 'Could not get your location.';
  }
};

/**
 * Browser geolocation as a hook.
 *
 * `watch: true` keeps a live subscription (journey tracking); otherwise the
 * position is fetched once on demand via `refresh()`.
 *
 * Errors are surfaced rather than swallowed — a journey that silently stops
 * receiving positions is worse than one that says it cannot see you.
 */
export function useGeolocation({ watch = false, enabled = true, ...options } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const watchIdRef = useRef(null);

  const onSuccess = useCallback((pos) => {
    setPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      speedMps: pos.coords.speed ?? undefined,
      heading: pos.coords.heading ?? undefined,
      timestamp: pos.timestamp,
    });
    setError(null);
    setIsLoading(false);
  }, []);

  const onError = useCallback((err) => {
    setError({ code: err.code, message: messageFor(err) });
    setIsLoading(false);
  }, []);

  const refresh = useCallback(() => {
    if (!navigator.geolocation) {
      setError({ code: -1, message: 'This browser does not support geolocation.' });
      return;
    }
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(onSuccess, onError, { ...DEFAULT_OPTIONS, ...options });
    // `options` is spread into a new object on every render; depending on it
    // would restart the watch continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSuccess, onError]);

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return undefined;

    if (!watch) {
      refresh();
      return undefined;
    }

    setIsLoading(true);
    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      ...DEFAULT_OPTIONS,
      ...options,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, watch, onSuccess, onError, refresh]);

  return {
    position,
    error,
    isLoading,
    isSupported: typeof navigator !== 'undefined' && 'geolocation' in navigator,
    refresh,
    /** [lat, lng] for Leaflet and the API, which both use that order. */
    coords: position ? [position.lat, position.lng] : null,
  };
}
