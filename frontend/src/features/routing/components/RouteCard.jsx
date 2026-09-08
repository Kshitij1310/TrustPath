import { Clock, Route as RouteIcon, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from '@/components/common/RiskBadge';
import { formatDistance, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SegmentStrip } from './SegmentStrip';

/**
 * One route alternative, comparable at a glance: time, distance, risk, and
 * the segment strip that shows *where* the risk sits.
 */
export function RouteCard({ route, isSelected, onSelect, activeSeq, onSegmentSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(route)}
      aria-pressed={isSelected}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition-all',
        isSelected
          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
          : 'hover:border-foreground/20 hover:bg-accent/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{route.name}</span>
            {route.recommended && (
              <Badge className="gap-1 bg-risk-low/15 text-risk-low hover:bg-risk-low/15">
                <ShieldCheck className="size-3" />
                Recommended
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {formatDuration(route.durationS)}
            </span>
            <span className="flex items-center gap-1.5">
              <RouteIcon className="size-3.5" />
              {formatDistance(route.distanceM)}
            </span>
          </div>
        </div>

        <RiskBadge score={route.risk.score} label={route.risk.label} />
      </div>

      {/* The strip is the whole point of the card — show it always, not just
          when selected, so alternatives can be compared side by side. */}
      <SegmentStrip
        segments={route.segments}
        activeSeq={isSelected ? activeSeq : null}
        onSelect={isSelected ? onSegmentSelect : undefined}
        className="mt-3.5"
      />

      {route.risk.reasons?.[0] && (
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{route.risk.reasons[0]}</p>
      )}
    </button>
  );
}
