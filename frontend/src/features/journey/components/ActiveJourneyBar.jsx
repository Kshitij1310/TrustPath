import { Link } from 'react-router-dom';
import { ChevronRight, MapPin, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useJourneyStore } from '@/stores/journeyStore';
import { useCountdown } from '@/hooks/useCountdown';
import { formatClock, formatDistance } from '@/lib/format';
import { paths } from '@/app/routes';
import { cn } from '@/lib/utils';
import { useCheckIn, useJourney } from '../queries';
import { JourneyPrompts } from './JourneyPrompts';

/**
 * Persistent status strip shown on every page while a journey is running.
 *
 * Colour tracks state: normal, deviating, overdue. The check-in button is
 * always one tap away, wherever the user happens to be in the app.
 */
export function ActiveJourneyBar() {
  const journeyId = useJourneyStore((s) => s.activeJourneyId);
  const isDeviating = useJourneyStore((s) => s.isDeviating);
  const deviationM = useJourneyStore((s) => s.deviationM);
  const { data: journey } = useJourney(journeyId);
  const { secondsLeft, isOverdue } = useCountdown(journey?.etaAt);
  const checkIn = useCheckIn();

  if (!journeyId) return null;

  const tone = isOverdue ? 'overdue' : isDeviating ? 'deviating' : 'normal';

  return (
    <>
      <div
        className={cn(
          'flex shrink-0 items-center gap-3 border-b px-4 py-2 text-sm md:px-6',
          tone === 'overdue' && 'border-risk-high/30 bg-risk-high/10',
          tone === 'deviating' && 'border-risk-moderate/30 bg-risk-moderate/10',
          tone === 'normal' && 'border-primary/20 bg-primary/5',
        )}
      >
        <span className="relative flex size-2 shrink-0">
          <span
            className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-75',
              tone === 'overdue' ? 'bg-risk-high' : tone === 'deviating' ? 'bg-risk-moderate' : 'bg-primary',
            )}
          />
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              tone === 'overdue' ? 'bg-risk-high' : tone === 'deviating' ? 'bg-risk-moderate' : 'bg-primary',
            )}
          />
        </span>

        <div className="min-w-0 flex-1 truncate">
          <span className="font-medium">
            {journey?.label || 'Journey in progress'}
          </span>
          <span className="ml-2 text-muted-foreground">
            {isOverdue
              ? `Overdue by ${formatClock(Math.abs(secondsLeft ?? 0))}`
              : secondsLeft !== null
                ? `ETA in ${formatClock(secondsLeft)}`
                : 'Tracking'}
            {isDeviating && deviationM ? ` · ${formatDistance(deviationM)} off route` : ''}
          </span>
        </div>

        <Button
          size="sm"
          variant={tone === 'normal' ? 'outline' : 'default'}
          loading={checkIn.isPending}
          onClick={() => checkIn.mutate({ journeyId })}
          className="hidden sm:inline-flex"
        >
          <ShieldCheck />
          I&apos;m safe
        </Button>

        <Button size="sm" variant="ghost" asChild>
          <Link to={paths.journey}>
            <MapPin className="sm:hidden" />
            <span className="hidden sm:inline">Details</span>
            <ChevronRight />
          </Link>
        </Button>
      </div>

      <JourneyPrompts />
    </>
  );
}
