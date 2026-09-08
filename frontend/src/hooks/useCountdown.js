import { useEffect, useState } from 'react';

/**
 * Seconds remaining until `targetDate`, ticking once a second.
 * Returns a negative number once the target has passed, so callers can show
 * "12 min overdue" without a second hook.
 */
export function useCountdown(targetDate) {
  const compute = () =>
    targetDate ? Math.round((new Date(targetDate).getTime() - Date.now()) / 1000) : null;

  const [secondsLeft, setSecondsLeft] = useState(compute);

  useEffect(() => {
    if (!targetDate) {
      setSecondsLeft(null);
      return undefined;
    }
    setSecondsLeft(compute());
    const id = setInterval(() => setSecondsLeft(compute()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate]);

  return {
    secondsLeft,
    isOverdue: secondsLeft !== null && secondsLeft < 0,
  };
}
