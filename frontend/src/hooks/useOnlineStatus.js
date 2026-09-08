import { useEffect, useState } from 'react';

/**
 * Connectivity, used to decide whether an SOS goes to the server now or is
 * queued locally. `navigator.onLine` only proves a link exists, not that the
 * API is reachable — treat a `true` here as optimistic.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
