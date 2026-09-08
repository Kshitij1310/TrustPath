import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Navigation, ShieldCheck, Siren } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useJourneyStore } from '@/stores/journeyStore';
import { useSosStore } from '@/features/emergency/sosStore';
import { paths } from '@/app/routes';
import { formatDistance } from '@/lib/format';
import { useCheckIn } from '../queries';

/**
 * The two safety prompts from the blueprint (§15 and §16).
 *
 * Deliberately not dismissible by clicking away or pressing Escape: an
 * unanswered "are you safe?" is the signal the dead-man switch depends on,
 * and an accidental tap outside must not count as an answer.
 */
export function JourneyPrompts() {
  const prompt = useJourneyStore((s) => s.prompt);
  const journeyId = useJourneyStore((s) => s.activeJourneyId);
  const deviationM = useJourneyStore((s) => s.deviationM);
  const dismissPrompt = useJourneyStore((s) => s.dismissPrompt);
  const openSos = useSosStore((s) => s.open);
  const checkIn = useCheckIn();
  const navigate = useNavigate();

  if (!prompt || !journeyId) return null;

  const isDeviation = prompt === 'deviation';

  const triggerSos = () => {
    dismissPrompt();
    openSos({ trigger: prompt === 'overdue' ? 'overdue' : 'deviation' });
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="max-w-md"
      >
        <DialogHeader>
          <div
            className={`mx-auto mb-2 grid size-12 place-items-center rounded-full ${
              isDeviation ? 'bg-risk-moderate/15' : 'bg-risk-high/15'
            }`}
          >
            {isDeviation ? (
              <AlertTriangle className="size-6 text-risk-moderate" />
            ) : (
              <Clock className="size-6 text-risk-high" />
            )}
          </div>

          <DialogTitle className="text-center">
            {isDeviation ? 'You have left your planned route' : 'Your journey is overdue'}
          </DialogTitle>

          <DialogDescription className="text-center">
            {isDeviation
              ? `You are about ${formatDistance(deviationM ?? 0)} away from the route you chose. Are you safe?`
              : 'You have not arrived by the ETA you set. Are you safe?'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            size="lg"
            loading={checkIn.isPending}
            onClick={() => checkIn.mutate({ journeyId, extendMinutes: isDeviation ? 0 : 15 })}
          >
            <ShieldCheck />
            I&apos;m safe{!isDeviation && ' — give me 15 more minutes'}
          </Button>

          {isDeviation && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                dismissPrompt();
                navigate(paths.plan);
              }}
            >
              <Navigation />
              Find a safer route
            </Button>
          )}

          <Button variant="destructive" size="lg" onClick={triggerSos}>
            <Siren />
            I need help — start SOS
          </Button>
        </div>

        <DialogFooter className="sm:justify-center">
          <p className="text-center text-xs text-muted-foreground">
            Nobody has been contacted yet. You decide what happens next.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
