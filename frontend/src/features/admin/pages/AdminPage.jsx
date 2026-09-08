import { Navigate } from 'react-router-dom';
import { Check, MapPin, MessageSquareWarning, Siren, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, ListSkeleton } from '@/components/common/states';
import { PageHeader } from '@/components/common/PageHeader';
import { MapCanvas } from '@/features/map/MapCanvas';
import { ReportsLayer } from '@/features/map/layers';
import { useModerateReport } from '@/features/reports/queries';
import { useIsAdmin } from '@/stores/authStore';
import { paths } from '@/app/routes';
import { categoryLabel } from '@/lib/risk';
import { formatCoords, formatRelative } from '@/lib/format';
import { useAdminOverview, useRiskZones } from '../queries';

const TILES = [
  { key: 'reports_today', label: 'Reports today', icon: MessageSquareWarning },
  { key: 'pending_reports', label: 'Awaiting moderation', icon: MessageSquareWarning },
  { key: 'active_journeys', label: 'Active journeys', icon: MapPin },
  { key: 'open_sos', label: 'Open SOS', icon: Siren, urgent: true },
];

export default function AdminPage() {
  const isAdmin = useIsAdmin();
  const { data, isLoading, error, refetch } = useAdminOverview();
  const { data: zones } = useRiskZones();
  const moderate = useModerateReport();

  // The server enforces this too; the redirect just avoids a dead screen.
  if (!isAdmin) return <Navigate to={paths.plan} replace />;

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const counts = data?.counts ?? {};

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      <PageHeader
        title="Moderation dashboard"
        description="What is happening right now, and what needs a decision."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map(({ key, label, icon: Icon, urgent }) => {
          const value = Number(counts[key] ?? 0);
          return (
            <Card key={key} className={urgent && value > 0 ? 'border-destructive/40' : undefined}>
              <CardContent className="flex items-center gap-3 p-4">
                <span
                  className={`grid size-10 place-items-center rounded-full ${
                    urgent && value > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{isLoading ? '—' : value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Open SOS first — nothing on this page matters more. */}
      {data?.openSos?.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Siren className="size-4" />
              Open SOS events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.openSos.map((sos) => (
                <li key={sos.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                  <span className="font-medium">{sos.display_name}</span>
                  <Badge variant="secondary" className="capitalize">
                    {sos.trigger}
                  </Badge>
                  {sos.lat && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${sos.lat}&mlon=${sos.lng}#map=17/${sos.lat}/${sos.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {formatCoords([Number(sos.lat), Number(sos.lng)])}
                    </a>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatRelative(sos.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Moderation queue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reports awaiting moderation</CardTitle>
          <CardDescription>
            Verifying a report raises its weight in the risk engine; rejecting it removes it entirely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListSkeleton rows={3} />
          ) : data?.pendingReports?.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing waiting. The queue is clear.
            </p>
          ) : (
            <ul className="space-y-2">
              {data?.pendingReports?.map((report) => (
                <li key={report.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{categoryLabel(report.category)}</p>
                    <p className="text-xs text-muted-foreground">
                      Severity {report.severity}/5 · {formatCoords([Number(report.lat), Number(report.lng)])} ·{' '}
                      {formatRelative(report.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => moderate.mutate({ id: report.id, status: 'verified' })}
                    >
                      <Check />
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => moderate.mutate({ id: report.id, status: 'rejected' })}
                    >
                      <X />
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Risk zones */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Report clusters</CardTitle>
          <CardDescription>
            Areas with repeated reports in the last 90 days. Circle size follows report count.
          </CardDescription>
        </CardHeader>
        <div className="h-80">
          <MapCanvas>
            {zones && (
              <ReportsLayer
                points={zones.map((zone) => ({
                  lat: zone.lat,
                  lng: zone.lng,
                  weight: Math.min(1, zone.reportCount / 10),
                }))}
              />
            )}
          </MapCanvas>
        </div>
      </Card>
    </div>
  );
}
