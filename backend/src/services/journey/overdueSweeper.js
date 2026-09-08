import { markOverdueJourneys } from './journeyService.js';
import { emitJourneyUpdate } from '../../websocket/index.js';

const INTERVAL_MS = 60_000;

/**
 * The dead-man switch runs here rather than in a queue: a single interval is
 * enough at MVP scale, and it keeps Redis/BullMQ out of the dependency list.
 *
 * Journeys are only flagged 'overdue' — the notification decision belongs to
 * the user's settings and happens when they respond (or don't).
 */
export function startOverdueSweeper() {
  const tick = async () => {
    try {
      const overdue = await markOverdueJourneys();
      for (const journey of overdue) {
        emitJourneyUpdate(journey.id, 'journey:overdue', {
          journeyId: journey.id,
          etaAt: journey.eta_at,
          prompt: 'Journey is overdue. Are you safe?',
          actions: ['im_safe', 'need_help', 'sos'],
        });
      }
      if (overdue.length > 0) console.log(`[sweeper] ${overdue.length} journey(s) marked overdue`);
    } catch (err) {
      console.error('[sweeper] failed:', err.message);
    }
  };

  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref?.();
  tick();
  return () => clearInterval(timer);
}
