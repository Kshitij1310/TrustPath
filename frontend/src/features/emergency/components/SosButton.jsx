import { useEffect, useRef, useState } from 'react';
import { Siren } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSosStore } from '../sosStore';
import { useOfflineSosReplay } from '../queries';
import { SosSheet } from './SosSheet';

/** Press-and-hold duration. Long enough to be deliberate, short in a panic. */
const HOLD_MS = 800;

/**
 * The floating SOS control, present on every authenticated page.
 *
 * Press-and-hold rather than a plain tap: a pocket tap must not fire an
 * emergency workflow, but a real one should still take under a second. The
 * ring fills to show progress, so the interaction explains itself.
 */
export function SosButton() {
  const open = useSosStore((s) => s.open);
  const [holdProgress, setHoldProgress] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(0);

  // Replays anything captured while offline.
  useOfflineSosReplay();

  const stopHold = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setHoldProgress(0);
  };

  const startHold = () => {
    startRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const progress = Math.min(1, elapsed / HOLD_MS);
      setHoldProgress(progress);

      if (progress >= 1) {
        stopHold();
        if (navigator.vibrate) navigator.vibrate(60);
        open({ trigger: 'manual' });
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => stopHold, []);

  return (
    <>
      <button
        type="button"
        aria-label="Hold to trigger SOS"
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        // Keyboard users get a plain activation — holding a key is not a
        // sensible interaction, and the confirmation lives in the sheet.
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open({ trigger: 'manual' });
          }
        }}
        className={cn(
          'group fixed bottom-20 right-4 z-40 grid size-16 place-items-center rounded-full',
          'bg-destructive text-destructive-foreground shadow-xl shadow-destructive/25',
          'transition-transform active:scale-95 md:bottom-6 md:right-6',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
        style={{
          // The ring fills clockwise as the hold progresses.
          backgroundImage:
            holdProgress > 0
              ? `conic-gradient(rgba(255,255,255,.45) ${holdProgress * 360}deg, transparent 0deg)`
              : undefined,
        }}
      >
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-destructive/40 animate-pulse-ring"
          aria-hidden
        />
        <Siren className="relative size-7" />
        <span className="sr-only">SOS</span>
      </button>

      <SosSheet />
    </>
  );
}
