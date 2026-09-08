import { riskLevel } from '@/lib/risk';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The route rendered as a row of coloured blocks — the 🟢🟢🟡🔴🟢 idea from
 * the blueprint, made interactive.
 *
 * Each block is a button so the strip is keyboard-navigable, and hovering one
 * highlights the matching segment on the map.
 */
export function SegmentStrip({ segments, activeSeq, onSelect, className }) {
  if (!segments?.length) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex gap-[3px]" role="group" aria-label="Risk by route segment">
        {segments.map((segment) => {
          const level = riskLevel(segment.label);
          const isActive = activeSeq === segment.seq;

          return (
            <Tooltip key={segment.seq}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect?.(isActive ? null : segment)}
                  aria-label={`Segment ${segment.seq + 1}: ${level.label} risk, score ${segment.score}`}
                  aria-pressed={isActive}
                  className={cn(
                    'h-6 flex-1 rounded-[3px] transition-all',
                    isActive ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : 'hover:opacity-80',
                  )}
                  style={{ backgroundColor: level.color }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">
                  Segment {segment.seq + 1} · {level.label} ({segment.score})
                </p>
                <p className="text-muted-foreground">
                  {segment.counts?.recentIncidents ?? 0} recent · {segment.counts?.reports ?? 0} reports
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Start</span>
        <span>{segments.length} segments · ~500 m each</span>
        <span>Destination</span>
      </div>
    </div>
  );
}
