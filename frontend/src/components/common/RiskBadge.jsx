import { cn } from '@/lib/utils';
import { levelFromScore, riskLevel } from '@/lib/risk';

/**
 * The score chip used on route cards, segments and reports.
 *
 * Always renders the label text next to the colour — colour alone is never
 * the only carrier of the risk signal.
 */
export function RiskBadge({ score, label, size = 'default', showScore = true, className }) {
  const level = riskLevel(label ?? levelFromScore(score));

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        level.badgeClassName,
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', level.dotClassName)} aria-hidden />
      {showScore && <span className="tabular-nums">{score}</span>}
      <span>{level.label}</span>
    </span>
  );
}

/** Large score readout for the route detail header. */
export function RiskScoreDial({ score, label, className }) {
  const level = riskLevel(label ?? levelFromScore(score));

  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className={cn('text-4xl font-bold tabular-nums leading-none', level.className)}>
        {score}
      </span>
      <div className="flex flex-col">
        <span className={cn('text-sm font-semibold', level.className)}>{level.label} risk</span>
        <span className="text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}
