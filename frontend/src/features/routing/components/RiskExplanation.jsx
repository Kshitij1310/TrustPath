import { AlertTriangle, FlaskConical, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { RiskBadge } from '@/components/common/RiskBadge';
import { FACTOR_LABELS, riskLevel } from '@/lib/risk';
import { cn } from '@/lib/utils';

/**
 * The "why is this route risky?" panel.
 *
 * Two halves: the plain-language reasons the server generated, and the factor
 * breakdown behind them. The disclaimer is not optional — the product must
 * never let a score read as a prediction of crime.
 */
export function RiskExplanation({ risk, worstSegmentDetail, className }) {
  if (!risk) return null;

  return (
    <div className={cn('space-y-5', className)}>
      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold">Why this score</h3>
        <ul className="space-y-2">
          {risk.reasons?.map((reason) => (
            <li key={reason} className="flex gap-2.5 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </section>

      {risk.worstSegment && (
        <section className="rounded-lg border border-risk-high/30 bg-risk-high/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-risk-high" />
              <span className="text-sm font-medium">
                Highest-risk stretch — segment {risk.worstSegment.seq + 1}
              </span>
            </div>
            <RiskBadge score={risk.worstSegment.score} label={risk.worstSegment.label} size="sm" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Shown separately so it is not hidden inside the route average.
          </p>
        </section>
      )}

      {worstSegmentDetail?.factors && (
        <FactorBreakdown factors={worstSegmentDetail.factors} label={`Segment ${worstSegmentDetail.seq + 1}`} />
      )}

      {risk.coverage?.demoNote && (
        <section className="rounded-lg border border-risk-moderate/40 bg-risk-moderate/10 p-3">
          <div className="flex items-start gap-2">
            <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-risk-moderate" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-risk-moderate">
                Built on demonstration data
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {risk.coverage.demoNote}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* What the number could not take into account. Shown next to the score
          itself, not buried in a help page — a risk score without its coverage
          claims more than the data supports. */}
      {risk.coverage?.note && (
        <section className="rounded-lg border border-risk-moderate/30 bg-risk-moderate/5 p-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-risk-moderate" />
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Limited data for this area</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{risk.coverage.note}</p>
              {risk.coverage.factorsUnavailable?.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Not scored:{' '}
                  {risk.coverage.factorsUnavailable
                    .map((f) => FACTOR_LABELS[f] ?? f)
                    .join(', ')
                    .toLowerCase()}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {risk.disclaimer && (
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          {risk.disclaimer}
        </p>
      )}
    </div>
  );
}

/** Per-factor contribution bars, ordered by how much each is pushing. */
export function FactorBreakdown({ factors, label }) {
  // Only render factors the engine actually scored. A factor that was dropped
  // for lack of data is absent from `factors` — showing it at 0% would read
  // as "measured, and fine".
  const rows = Object.entries(FACTOR_LABELS)
    .filter(([key]) => factors[key] !== undefined)
    .map(([key, name]) => ({ key, name, value: factors[key] }))
    .sort((a, b) => b.value - a.value);

  return (
    <section className="space-y-2.5">
      <h3 className="text-sm font-semibold">
        Factor breakdown{label ? <span className="font-normal text-muted-foreground"> · {label}</span> : null}
      </h3>
      <div className="space-y-2">
        {rows.map(({ key, name, value }) => {
          const percent = Math.round(value * 100);
          const level = riskLevel(
            percent <= 30 ? 'low' : percent <= 55 ? 'moderate' : percent <= 75 ? 'high' : 'critical',
          );
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{name}</span>
                <span className="font-medium tabular-nums">{percent}%</span>
              </div>
              {/* Bar colour follows the risk band. Inline, because the value
                  is dynamic and Tailwind cannot generate arbitrary hues. */}
              <Progress value={percent} indicatorStyle={{ backgroundColor: level.color }} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
