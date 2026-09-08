import { useState } from 'react';
import { Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/states';
import { PageHeader } from '@/components/common/PageHeader';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useIsAdmin } from '@/stores/authStore';
import { formatCoords, formatDistance, formatRelative } from '@/lib/format';
import { useAlerts, useCreateAlert, useDeleteAlert } from '../queries';

/**
 * Alerts raise risk for everyone nearby, so publishing is admin-only. For
 * regular users this page is a read-only feed of what is currently active.
 */
export default function AlertsPage() {
  const isAdmin = useIsAdmin();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const { data: alerts, isLoading, error, refetch } = useAlerts({ limit: 100 });
  const remove = useDeleteAlert();

  return (
    <div className="container max-w-3xl space-y-6 py-6">
      <PageHeader
        title="Safety alerts"
        description="Active alerts near you. Each one raises the contextual risk of routes passing through it."
        actions={
          isAdmin && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus />
              Publish alert
            </Button>
          )
        }
      />

      {!isAdmin && (
        <Alert variant="info">
          <ShieldAlert />
          <AlertDescription>
            Alerts are published by moderators. To flag something yourself, file a community report
            — enough corroboration promotes it.
          </AlertDescription>
        </Alert>
      )}

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <ListSkeleton rows={3} />
      ) : alerts?.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No active alerts"
          description="Nothing is currently flagged in the area."
        />
      ) : (
        <ul className="space-y-2.5">
          {alerts.map((alert) => (
            <li key={alert.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{alert.alertType}</span>
                    <Badge variant="secondary">Severity {alert.severity}/5</Badge>
                  </div>
                  {alert.description && (
                    <p className="text-sm text-muted-foreground">{alert.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Affects {formatDistance(alert.radiusM)} around {formatCoords([alert.lat, alert.lng])}
                    {' · '}
                    {alert.expiresAt
                      ? `expires ${formatRelative(alert.expiresAt)}`
                      : 'no expiry set'}
                  </p>
                </div>

                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remove.mutate(alert.id)}
                    aria-label="Delete alert"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && <CreateAlertDialog open={isDialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  );
}

function CreateAlertDialog({ open, onOpenChange }) {
  const [form, setForm] = useState({
    alertType: '',
    description: '',
    severity: 3,
    radiusM: 500,
    expiresInHours: 24,
  });
  const { coords, isLoading: isLocating, refresh } = useGeolocation({ enabled: false });
  const createAlert = useCreateAlert();

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = () => {
    if (!coords) return;
    createAlert.mutate(
      {
        lat: coords[0],
        lng: coords[1],
        alertType: form.alertType,
        description: form.description || undefined,
        severity: Number(form.severity),
        radiusM: Number(form.radiusM),
        expiresAt: new Date(Date.now() + Number(form.expiresInHours) * 3600_000),
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publish a safety alert</DialogTitle>
          <DialogDescription>
            This raises the risk score of every route passing nearby, for every user. Set an expiry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="alertType">Type</Label>
            <Input
              id="alertType"
              value={form.alertType}
              onChange={set('alertType')}
              placeholder="Road closure, protest, flooding…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alertDesc">Description</Label>
            <Textarea id="alertDesc" rows={3} value={form.description} onChange={set('description')} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="severity">Severity</Label>
              <Input id="severity" type="number" min={1} max={5} value={form.severity} onChange={set('severity')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="radius">Radius (m)</Label>
              <Input id="radius" type="number" min={50} max={20000} value={form.radiusM} onChange={set('radiusM')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiry">Expires (h)</Label>
              <Input id="expiry" type="number" min={1} max={720} value={form.expiresInHours} onChange={set('expiresInHours')} />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <span className="flex-1 truncate text-muted-foreground">
              {coords ? formatCoords(coords) : 'No location selected'}
            </span>
            <Button variant="ghost" size="sm" onClick={refresh} loading={isLocating}>
              Use my location
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createAlert.isPending} disabled={!coords || !form.alertType}>
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
