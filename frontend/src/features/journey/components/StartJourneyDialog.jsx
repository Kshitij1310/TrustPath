import { useEffect, useState } from 'react';
import { Copy, Share2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDuration } from '@/lib/format';
import { useStartJourney } from '../queries';

/**
 * Turns a chosen route into a monitored journey.
 *
 * The ETA doubles as the dead-man switch deadline, so it is pre-filled from
 * the route's own travel time plus a small buffer — a deadline the user is
 * bound to miss would produce false alarms and train them to ignore it.
 */
export function StartJourneyDialog({ open, onOpenChange, route }) {
  const [label, setLabel] = useState('');
  const [etaMinutes, setEtaMinutes] = useState(30);
  const [share, setShare] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const startJourney = useStartJourney();

  useEffect(() => {
    if (open && route) {
      setEtaMinutes(Math.max(5, Math.round(route.durationS / 60) + 10));
      setShareUrl(null);
    }
  }, [open, route]);

  const submit = () =>
    startJourney.mutate(
      {
        routeId: route?.id,
        label: label.trim() || undefined,
        etaMinutes: Number(etaMinutes),
        share,
      },
      {
        onSuccess: (data) => {
          if (data.shareUrl) {
            setShareUrl(`${window.location.origin}${data.shareUrl}`);
          } else {
            onOpenChange(false);
          }
        },
      },
    );

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied');
    } catch {
      toast.error('Could not copy — select the link and copy it manually.');
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Follow my TrustRoute journey', url: shareUrl });
        return;
      } catch {
        // Fall through to clipboard.
      }
    }
    copyShareUrl();
  };

  // Once the journey exists, the dialog becomes the share-link handoff.
  if (shareUrl) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Journey started</DialogTitle>
            <DialogDescription>
              Send this link to someone you trust. It shows your last known position and ETA, and
              expires after the journey.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input readOnly value={shareUrl} className="font-mono text-xs" />
            <Button size="icon" variant="outline" onClick={copyShareUrl} aria-label="Copy link">
              <Copy />
            </Button>
          </div>

          <Alert variant="info">
            <ShieldCheck />
            <AlertDescription>
              Anyone with this link can see your journey. It carries no account access and stops
              working once the journey ends.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            <Button onClick={shareLink}>
              <Share2 />
              Share link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start safe journey</DialogTitle>
          <DialogDescription>
            TrustRoute will watch for route deviations and check in if you have not arrived.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="journey-label">Where are you going?</Label>
            <Input
              id="journey-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Home, hostel, work…"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="journey-eta">Expected arrival</Label>
            <div className="flex items-center gap-2">
              <Input
                id="journey-eta"
                type="number"
                min={1}
                max={1440}
                value={etaMinutes}
                onChange={(event) => setEtaMinutes(event.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                minutes
                {route && ` · route takes about ${formatDuration(route.durationS)}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              If you have not checked in by then, TrustRoute will ask whether you are safe.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="journey-share">Share with a trusted contact</Label>
              <p className="text-xs text-muted-foreground">
                Creates a temporary link showing your position and ETA. Off by default.
              </p>
            </div>
            <Switch id="journey-share" checked={share} onCheckedChange={setShare} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={startJourney.isPending}>
            <ShieldCheck />
            Start journey
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
