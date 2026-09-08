import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Full-viewport spinner — the Suspense fallback for lazily loaded routes. */
export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-3">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Nothing to show, and that is not an error. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="rounded-full bg-muted p-3">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * A query failed. Shows the server's message rather than a generic string —
 * the API already returns something human-readable.
 */
export function ErrorState({ error, onRetry, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertCircle className="size-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">Something went wrong</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error?.message ?? 'Unexpected error.'}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Placeholder rows that match the shape of the list they stand in for. */
export function ListSkeleton({ rows = 3, className }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
