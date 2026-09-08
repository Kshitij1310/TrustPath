/**
 * Risk presentation rules.
 *
 * The bands mirror the backend's `RISK_BANDS` (§7 of the blueprint). Keep the
 * two in sync — the server decides the label, this file only decides how it
 * looks.
 */

export const RISK_LEVELS = {
  low: {
    label: 'Low',
    color: 'hsl(var(--risk-low))',
    className: 'text-risk-low',
    badgeClassName: 'bg-risk-low/15 text-risk-low border-risk-low/30',
    dotClassName: 'bg-risk-low',
  },
  moderate: {
    label: 'Moderate',
    color: 'hsl(var(--risk-moderate))',
    className: 'text-risk-moderate',
    badgeClassName: 'bg-risk-moderate/15 text-risk-moderate border-risk-moderate/30',
    dotClassName: 'bg-risk-moderate',
  },
  high: {
    label: 'High',
    color: 'hsl(var(--risk-high))',
    className: 'text-risk-high',
    badgeClassName: 'bg-risk-high/15 text-risk-high border-risk-high/30',
    dotClassName: 'bg-risk-high',
  },
  critical: {
    label: 'Critical',
    color: 'hsl(var(--risk-critical))',
    className: 'text-risk-critical',
    badgeClassName: 'bg-risk-critical/15 text-risk-critical border-risk-critical/30',
    dotClassName: 'bg-risk-critical',
  },
};

export function riskLevel(label) {
  return RISK_LEVELS[label] ?? RISK_LEVELS.moderate;
}

/** Fallback when only a number is available (server normally sends a label). */
export function levelFromScore(score) {
  if (score <= 30) return 'low';
  if (score <= 55) return 'moderate';
  if (score <= 75) return 'high';
  return 'critical';
}

/** Human-readable names for the six scoring factors. */
export const FACTOR_LABELS = {
  historicalCrime: 'Historical crime',
  recentIncidents: 'Recent incidents',
  communityReports: 'Community reports',
  timeOfDay: 'Time of day',
  emergencyAccess: 'Emergency access',
  isolation: 'Isolation',
};

export const REPORT_CATEGORIES = [
  { value: 'unsafe_area', label: 'Unsafe area' },
  { value: 'poor_lighting', label: 'Poor lighting' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'suspicious_activity', label: 'Suspicious activity' },
  { value: 'crime', label: 'Crime' },
  { value: 'road_issue', label: 'Road issue' },
  { value: 'other', label: 'Other' },
];

export const categoryLabel = (value) =>
  REPORT_CATEGORIES.find((c) => c.value === value)?.label ?? 'Other';

export const REPORT_STATUS = {
  unverified: { label: 'Unverified', className: 'bg-muted text-muted-foreground' },
  corroborated: { label: 'Corroborated', className: 'bg-risk-moderate/15 text-risk-moderate' },
  verified: { label: 'Verified', className: 'bg-risk-low/15 text-risk-low' },
  rejected: { label: 'Rejected', className: 'bg-destructive/15 text-destructive' },
};
