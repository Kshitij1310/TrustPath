import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MapPin, Navigation, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/states';
import { PageHeader } from '@/components/common/PageHeader';
import { MapCanvas, MapController } from '@/features/map/MapCanvas';
import { LivePositionLayer } from '@/features/map/layers';
import { useJourneyStore } from '@/stores/journeyStore';
import { useCountdown } from '@/hooks/useCountdown';
import { formatClock, formatDateTime, formatDistance, formatRelative } from '@/lib/format';
import { paths } from '@/app/routes';
import { cn } from '@/lib/utils';
import { useCheckIn, useEndJourney, useJourney, useJourneys } from '../queries';

const EVENT_COPY = {
  started: { label: 'Journey started', tone: 'text-primary' },
  deviation: { label: 'Left the planned route', tone: 'text-risk-moderate' },
  back_on_route: { label: 'Back on route', tone: 'text-risk-low' },
  overdue: { label: 'Journey overdue', tone: 'text-risk-high' },
  checked_in: { label: 'Checked in — safe', tone: 'text-risk-low' },
  sos: { label: 'SOS triggered', tone: 'text-destructive' },
  ended: { label: 'Journey completed', tone: 'text-muted-foreground' },
  cancelled: { label: 'Journey cancelled', tone: 'text-muted-foreground' },
};

const STATUS_VARIANT = {
  active: 'default',
  overdue: 'destructive',
  sos: 'destructive',
  completed: 'secondary',
  cancelled: 'secondary',
};

export default function JourneyPage() {
  const activeJourneyId = useJourneyStore((s) => s.activeJourneyId);
  const [selectedId, setSelectedId] = useState(null);
  const journeyId = selectedId ?? activeJourneyId;

  const { data: journeys, isLoading, error, refetch } = useJourneys();
  const { data: journey } = useJourney(journeyId);
  const { secondsLeft, isOverdue } = useCountdown(journey?.etaAt);
  const checkIn = useCheckIn();
  const endJourney = useEndJourney();

  const trackPath = journey?.locations?.map((l) => [l.lat, l.lng]).reverse() ?? [];
  const latest = journey?.locations?.[0];

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      <PageHeader
        title="Journey Guardian"
        description="Live tracking, deviation checks and an arrival deadline that asks after you."
        actions={
          !activeJourneyId && (
            <Button asChild>
              <Link to={paths.plan}>
                <Navigation />
                Plan a journey
              </Link>
            </Button>
          )
        }
      />

      {journeyId && journey && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>{journey.label || 'Journey'}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Started {formatRelative(journey.startedAt)}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[journey.status] ?? 'secondary'} className="capitalize">
              {journey.status}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label={isOverdue ? 'Overdue by' : 'Arrives in'}
                value={secondsLeft === null ? '—' : formatClock(Math.abs(secondsLeft))}
                tone={isOverdue ? 'text-risk-high' : undefined}
              />
              <Stat label="ETA" value={formatDateTime(journey.etaAt)} />
              <Stat
                label="Off route by"
                value={latest?.deviationM != null ? formatDistance(latest.deviationM) : '—'}
                tone={latest?.deviationM > 250 ? 'text-risk-moderate' : undefined}
              />
            </div>

            {trackPath.length > 0 && (
              <div className="h-56 overflow-hidden rounded-lg border">
                <MapCanvas center={trackPath[trackPath.length - 1]} zoom={15}>
                  <MapController bounds={trackPath.length > 1 ? trackPath : null} />
                  <LivePositionLayer
                    position={trackPath[trackPath.length - 1]}
                    accuracyM={latest?.accuracyM}
                  />
                </MapCanvas>
              </div>
            )}

            {journey.status === 'active' || journey.status === 'overdue' ? (
              <div className="flex flex-wrap gap-2">
                <Button loading={checkIn.isPending} onClick={() => checkIn.mutate({ journeyId })}>
                  <ShieldCheck />
                  I&apos;m safe
                </Button>
                <Button
                  variant="outline"
                  loading={endJourney.isPending}
                  onClick={() => endJourney.mutate({ journeyId, status: 'completed' })}
                >
                  <CheckCircle2 />
                  I&apos;ve arrived
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => endJourney.mutate({ journeyId, status: 'cancelled' })}
                >
                  <XCircle />
                  Cancel
                </Button>
              </div>
            ) : null}

            {journey.events?.length > 0 && (
              <>
                <Separator />
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Timeline</h3>
                  <ul className="space-y-2">
                    {journey.events.map((event, idx) => {
                      const copy = EVENT_COPY[event.kind] ?? { label: event.kind, tone: '' };
                      return (
                        <li key={idx} className="flex items-baseline gap-3 text-sm">
                          <span className={cn('font-medium', copy.tone)}>{copy.label}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {formatRelative(event.created_at ?? event.createdAt)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Past journeys</h2>

        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : journeys?.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No journeys yet"
            description="Plan a route and start a guarded journey — it will show up here."
          />
        ) : (
          <ul className="space-y-2">
            {journeys?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors',
                    item.id === journeyId ? 'border-primary bg-primary/5' : 'hover:bg-accent/40',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.label || 'Journey'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(item.startedAt)}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[item.status] ?? 'secondary'} className="capitalize">
                    {item.status}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  );
}
