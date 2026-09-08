import { useState } from 'react';
import { MessageSquareWarning, Plus, ThumbsUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/states';
import { PageHeader } from '@/components/common/PageHeader';
import { BoundsWatcher, ClickHandler, MapCanvas } from '@/features/map/MapCanvas';
import { ReportsLayer } from '@/features/map/layers';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCurrentUser } from '@/stores/authStore';
import { REPORT_CATEGORIES, REPORT_STATUS, categoryLabel } from '@/lib/risk';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReportDialog } from '../components/ReportDialog';
import { useDeleteReport, useHeatmap, useReports, useUpvoteReport } from '../queries';

export default function ReportsPage() {
  const [category, setCategory] = useState('all');
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [reportCoords, setReportCoords] = useState(null);
  const [bbox, setBbox] = useState(null);

  const user = useCurrentUser();
  const filters = category === 'all' ? { limit: 100 } : { limit: 100, category };
  const { data: reports, isLoading, error, refetch } = useReports(filters);

  const debouncedBbox = useDebouncedValue(bbox, 500);
  const { data: layers } = useHeatmap(debouncedBbox);

  const upvote = useUpvoteReport();
  const remove = useDeleteReport();

  const openDialogAt = (coords) => {
    setReportCoords(coords);
    setDialogOpen(true);
  };

  return (
    <div className="container max-w-5xl space-y-6 py-6">
      <PageHeader
        title="Community reports"
        description="What people are seeing on the ground. Reports start unverified and gain weight as others corroborate them."
        actions={
          <Button onClick={() => openDialogAt(null)}>
            <Plus />
            Report an issue
          </Button>
        }
      />

      <Tabs defaultValue="list">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="map">Map</TabsTrigger>
          </TabsList>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {REPORT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="list">
          {error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : isLoading ? (
            <ListSkeleton rows={4} />
          ) : reports?.length === 0 ? (
            <EmptyState
              icon={MessageSquareWarning}
              title="No reports here yet"
              description="Be the first to flag something — poor lighting, a blocked road, anything that affects how safe a place feels."
              action={
                <Button onClick={() => openDialogAt(null)}>
                  <Plus />
                  Report an issue
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {reports.map((report) => {
                const status = REPORT_STATUS[report.status] ?? REPORT_STATUS.unverified;
                return (
                  <li key={report.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{categoryLabel(report.category)}</span>
                          <Badge className={cn('border-transparent', status.className)}>
                            {status.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Severity {report.severity}/5
                          </span>
                        </div>
                        {report.description && (
                          <p className="text-sm text-muted-foreground">{report.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatRelative(report.createdAt)}
                        </p>
                      </div>

                      {report.imagePath && (
                        <img
                          src={`/uploads/${report.imagePath}`}
                          alt=""
                          loading="lazy"
                          className="size-16 shrink-0 rounded-lg object-cover"
                        />
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => upvote.mutate(report.id)}
                        disabled={upvote.isPending}
                      >
                        <ThumbsUp />
                        Seen this too
                        {report.upvotes > 0 && <span className="tabular-nums">{report.upvotes}</span>}
                      </Button>

                      {user?.role === 'admin' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => remove.mutate(report.id)}
                        >
                          <Trash2 />
                          Delete
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="map">
          <div className="h-[60vh] overflow-hidden rounded-xl border">
            <MapCanvas>
              <BoundsWatcher onChange={setBbox} />
              <ClickHandler onClick={openDialogAt} />
              {layers?.communityReports && <ReportsLayer points={layers.communityReports} />}
            </MapCanvas>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Tap anywhere on the map to file a report at that spot.
          </p>
        </TabsContent>
      </Tabs>

      <ReportDialog open={isDialogOpen} onOpenChange={setDialogOpen} coords={reportCoords} />
    </div>
  );
}
