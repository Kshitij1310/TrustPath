import { useEffect } from 'react';
import { CheckCircle2, Copy, Hospital, MessageSquare, Phone, ShieldQuestion, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useJourneyStore } from '@/stores/journeyStore';
import { formatDistance } from '@/lib/format';
import { useSosStore } from '../sosStore';
import { useConfirmSos, useResolveSos, useTriggerSos } from '../queries';

/**
 * The SOS workflow.
 *
 * The honesty rule from the blueprint is enforced here: the server sends
 * nothing, and this sheet never says "sent". It shows what was prepared, the
 * user performs the action, and only then is delivery recorded — as reported
 * by the device.
 */
export function SosSheet() {
  const isOpen = useSosStore((s) => s.isOpen);
  const trigger = useSosStore((s) => s.trigger);
  const active = useSosStore((s) => s.active);
  const close = useSosStore((s) => s.close);
  const journeyId = useJourneyStore((s) => s.activeJourneyId);

  const { position } = useGeolocation({ enabled: isOpen });
  const triggerSos = useTriggerSos();
  const confirmSos = useConfirmSos();
  const resolveSos = useResolveSos();

  // Fire as soon as the sheet opens — waiting for a location fix would delay
  // the record. The position is attached if it arrives in time.
  useEffect(() => {
    if (!isOpen || active || triggerSos.isPending) return;
    triggerSos.mutate({
      trigger,
      journeyId: journeyId ?? undefined,
      lat: position?.lat,
      lng: position?.lng,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, position?.lat]);

  const sosId = active?.sos?.id;
  const contacts = active?.contacts ?? [];
  const message = active?.message ?? '';

  const recordAttempt = (channel, target, result) => {
    if (!sosId) return;
    confirmSos.mutate({ sosId, attempts: [{ channel, target, result, at: new Date() }] });
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Message copied');
      recordAttempt('share', 'clipboard', 'sent');
    } catch {
      toast.error('Could not copy — select and copy the text manually.');
    }
  };

  const shareMessage = async () => {
    if (!navigator.share) return copyMessage();
    try {
      await navigator.share({ title: 'TrustRoute SOS', text: message });
      recordAttempt('share', 'system-share', 'sent');
    } catch {
      // A cancelled share sheet is not a failure worth shouting about, but it
      // is not a delivery either — record it as cancelled.
      recordAttempt('share', 'system-share', 'cancelled');
    }
    return undefined;
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent side="bottom" className="max-h-[92dvh] rounded-t-2xl sm:max-w-none">
        <SheetHeader>
          <div className="mx-auto mb-1 grid size-12 place-items-center rounded-full bg-destructive/15">
            <ShieldQuestion className="size-6 text-destructive" />
          </div>
          <SheetTitle className="text-center">Emergency assistance</SheetTitle>
          <SheetDescription className="text-center">
            {triggerSos.isPending
              ? 'Preparing your emergency information…'
              : 'Choose how to reach someone. Tap an action below to open it on your device.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* The single most important honesty affordance in the product. */}
          {active?.offline ? (
            <Alert variant="warning">
              <WifiOff />
              <AlertTitle>You are offline</AlertTitle>
              <AlertDescription>
                This SOS is saved on your device and will reach the server when you reconnect.
                Calling and SMS below still work — they use your phone network, not the internet.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="info">
              <CheckCircle2 />
              <AlertTitle>Recorded — nothing has been sent yet</AlertTitle>
              <AlertDescription>
                TrustRoute does not send messages on your behalf. Use the buttons below and your
                phone will do it, so you can see exactly what went out.
              </AlertDescription>
            </Alert>
          )}

          {active?.location && (
            <p className="text-xs text-muted-foreground">
              Location attached:{' '}
              <a
                href={active.location.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {active.location.lat.toFixed(5)}, {active.location.lng.toFixed(5)}
              </a>
            </p>
          )}

          {/* Public services first — they work without any setup. */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Emergency services</h3>
            <div className="grid grid-cols-2 gap-2">
              {(active?.publicServices ?? [
                { name: 'Emergency (India)', phone: '112', callUrl: 'tel:112' },
                { name: 'Women Helpline', phone: '1091', callUrl: 'tel:1091' },
              ]).map((service) => (
                <Button
                  key={service.phone}
                  variant="destructive"
                  size="lg"
                  asChild
                  onClick={() => recordAttempt('call', service.phone, 'unknown')}
                >
                  <a href={service.callUrl}>
                    <Phone />
                    {service.phone}
                  </a>
                </Button>
              ))}
            </div>
          </section>

          <Separator />

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Your trusted contacts</h3>
              {contacts.length > 0 && (
                <Badge variant="secondary">{contacts.length}</Badge>
              )}
            </div>

            {contacts.length === 0 ? (
              <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                You have not added any trusted contacts yet. Add one in Emergency so they appear
                here next time.
              </p>
            ) : (
              <ul className="space-y-2">
                {contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{contact.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {contact.phone}
                        {contact.relation ? ` · ${contact.relation}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="icon"
                        variant="outline"
                        asChild
                        onClick={() => recordAttempt('call', contact.phone, 'unknown')}
                        aria-label={`Call ${contact.name}`}
                      >
                        <a href={contact.callUrl}>
                          <Phone />
                        </a>
                      </Button>
                      <Button
                        size="icon"
                        asChild
                        onClick={() => recordAttempt('sms', contact.phone, 'unknown')}
                        aria-label={`Text ${contact.name}`}
                      >
                        <a href={contact.smsUrl}>
                          <MessageSquare />
                        </a>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {message && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Message</h3>
              <p className="rounded-lg border bg-muted/40 p-3 text-sm">{message}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={shareMessage}>
                  <Copy />
                  Share or copy
                </Button>
              </div>
            </section>
          )}

          {active?.nearestFacilities?.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Nearest help</h3>
              <ul className="space-y-1.5">
                {active.nearestFacilities.map((facility, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <Hospital className="size-3.5 shrink-0 text-risk-low" />
                    <span className="truncate">{facility.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatDistance(facility.distanceM)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button
            variant="ghost"
            onClick={() => {
              if (sosId) resolveSos.mutate({ sosId, status: 'false_alarm' });
              close();
            }}
          >
            False alarm
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (sosId) resolveSos.mutate({ sosId, status: 'resolved' });
              close();
            }}
          >
            I&apos;m safe now
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
