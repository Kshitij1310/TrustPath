import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatClock } from '@/lib/format';

/**
 * Fake incoming call — a way to leave a situation without explaining yourself.
 *
 * Entirely local: no API, no audio file, no permissions. A timer, a vibration
 * pattern and a convincing full-screen call UI.
 */
export function FakeCall() {
  const [caller, setCaller] = useState('Mom');
  const [delaySeconds, setDelaySeconds] = useState(10);
  const [countdown, setCountdown] = useState(null);
  const [isRinging, setRinging] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const vibrateRef = useRef(null);

  // Scheduling countdown.
  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown <= 0) {
      setCountdown(null);
      setRinging(true);
      return undefined;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // Ring: buzz in a phone-like pattern until answered or dismissed.
  useEffect(() => {
    if (!isRinging || !navigator.vibrate) return undefined;
    vibrateRef.current = setInterval(() => navigator.vibrate([400, 200, 400, 1000]), 2000);
    navigator.vibrate([400, 200, 400, 1000]);
    return () => clearInterval(vibrateRef.current);
  }, [isRinging]);

  const isInCall = callSeconds !== null && !isRinging;

  // Answered-call timer.
  useEffect(() => {
    if (!isInCall) return undefined;
    const id = setInterval(() => setCallSeconds((s) => (s ?? 0) + 1), 1000);
    return () => clearInterval(id);
  }, [isInCall]);

  const answer = () => {
    navigator.vibrate?.(0);
    setRinging(false);
    setCallSeconds(0);
  };

  const hangUp = () => {
    navigator.vibrate?.(0);
    setRinging(false);
    setCallSeconds(null);
    setCountdown(null);
  };

  if (isRinging || isInCall) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-neutral-900 px-6 py-16 text-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-neutral-400">
            {isInCall ? formatClock(callSeconds) : 'Incoming call'}
          </p>
          <div className="grid size-24 place-items-center rounded-full bg-neutral-700 text-3xl font-semibold">
            {caller.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-3xl font-semibold">{caller}</h2>
          <p className="text-neutral-400">mobile</p>
        </div>

        <div className="flex w-full max-w-xs items-center justify-around">
          {isRinging && (
            <button
              type="button"
              onClick={answer}
              className="grid size-16 place-items-center rounded-full bg-green-600 transition-transform active:scale-95"
              aria-label="Answer call"
            >
              <Phone className="size-7" />
            </button>
          )}
          <button
            type="button"
            onClick={hangUp}
            className="grid size-16 place-items-center rounded-full bg-red-600 transition-transform active:scale-95"
            aria-label="End call"
          >
            <PhoneOff className="size-7" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneOutgoing className="size-4" />
          Fake call
        </CardTitle>
        <CardDescription>
          Schedule a convincing incoming call to give yourself a reason to leave.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="caller">Caller name</Label>
            <Input id="caller" value={caller} onChange={(e) => setCaller(e.target.value)} maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delay">Ring after (seconds)</Label>
            <Input
              id="delay"
              type="number"
              min={3}
              max={300}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(e.target.value)}
            />
          </div>
        </div>

        {countdown !== null ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-muted-foreground">
              Ringing in <span className="font-semibold tabular-nums">{countdown}s</span>
            </p>
            <Button variant="outline" size="sm" onClick={() => setCountdown(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setCountdown(Number(delaySeconds))}>
            <Phone />
            Schedule call
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
