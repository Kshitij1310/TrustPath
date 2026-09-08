import { useParams } from 'react-router-dom';
import { Clock, MapPin, Route, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageLoader } from '@/components/common/states';
import { MapCanvas, MapController } from '@/features/map/MapCanvas';
import { LivePositionLayer } from '@/features/map/layers';
import { useCountdown } from '@/hooks/useCountdown';
import { formatClock, formatDateTime, formatRelative } from '@/lib/format';
import { useSharedJourney } from '../queries';

/**
 * What a trusted contact sees when they open a share link.
 *
 * No account, no app chrome, and deliberately minimal: last known position,
 * ETA and status. Journey history, contacts and identity stay private.
 */
export default function SharedJourneyPage() {
  const { token } = useParams();
  const { data: journey, isLoading, error } = useSharedJourney(token);
  const { secondsLeft, isOverdue } = useCountdown(journey?.etaAt);

  if (isLoading) return <PageLoader label="Loading journey…" />;

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-sm">
          <CardHeader>
            <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-muted">
              <ShieldAlert className="size-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-center">Link unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              {error.message} Share links stop working once the journey ends.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const position = journey.lastKnownPosition
    ? [journey.lastKnownPosition.lat, journey.lastKnownPosition.lng]
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Route className="size-4" />
        </span>
        <span className="font-semibold">TrustRoute</span>
      </header>

      <main className="container max-w-lg space-y-4 py-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {journey.travellerName} is travelling
            {journey.label ? ` to ${journey.label}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            Started {formatRelative(journey.startedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={journey.status === 'active' ? 'default' : 'destructive'}
            className="capitalize"
          >
            {journey.status}
          </Badge>
          <Badge variant="secondary" className="gap-1.5">
            <Clock className="size-3" />
            {isOverdue
              ? `Overdue by ${formatClock(Math.abs(secondsLeft ?? 0))}`
              : `ETA ${formatDateTime(journey.etaAt)}`}
          </Badge>
        </div>

        {journey.status === 'overdue' && (
          <Alert variant="warning">
            <ShieldAlert />
            <AlertDescription>
              This journey has passed its expected arrival time and no check-in has been received.
              Consider getting in touch.
            </AlertDescription>
          </Alert>
        )}

        {journey.status === 'sos' && (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertDescription>
              An SOS was triggered on this journey. Please contact them or emergency services.
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden">
          <div className="h-72">
            {position ? (
              <MapCanvas center={position} zoom={15}>
                <MapController center={position} zoom={15} />
                <LivePositionLayer position={position} />
              </MapCanvas>
            ) : (
              <div className="grid h-full place-items-center bg-muted/40 text-sm text-muted-foreground">
                No location received yet
              </div>
            )}
          </div>
          {journey.lastKnownPosition && (
            <CardContent className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              Last update {formatRelative(journey.lastKnownPosition.recordedAt)}
            </CardContent>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          This page updates automatically and expires when the journey ends.
        </p>
      </main>
    </div>
  );
}
