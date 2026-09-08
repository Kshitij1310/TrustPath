import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { api } from '@/lib/apiClient';

/**
 * Standing notice while the database holds seeded demo rows.
 *
 * Demo data exists so every screen has content and the risk engine has
 * something to discriminate against. That is legitimate for development — but
 * only while it is impossible to mistake for real information. This banner is
 * the part that keeps it honest, so it is deliberately not dismissible.
 */
export function DemoDataBanner() {
  const { data } = useQuery({
    queryKey: ['meta', 'data-provenance'],
    queryFn: () => api.get('/meta/data-provenance'),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!data?.usingDemoData) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2.5 border-b border-risk-moderate/40 bg-risk-moderate/10 px-4 py-2 text-xs md:px-6"
    >
      <FlaskConical className="size-3.5 shrink-0 text-risk-moderate" />
      <p className="min-w-0">
        <span className="font-semibold text-risk-moderate">Demonstration data.</span>{' '}
        <span className="text-muted-foreground">
          {data.counts.incidents > 0 && `${data.counts.incidents} incidents `}
          {data.counts.reports > 0 && `and ${data.counts.reports} reports `}
          on this map are seeded samples — they did not happen and nobody filed them. Risk scores
          here show how the engine works, not what these places are like.
        </span>
      </p>
    </div>
  );
}
