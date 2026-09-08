import { useMemo, useState } from 'react';
import { Flag, Layers, Loader2, MapPin, Navigation, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/common/states';
import { RiskScoreDial } from '@/components/common/RiskBadge';
import { BoundsWatcher, ClickHandler, MapCanvas, MapController } from '@/features/map/MapCanvas';
import {
  AlertsLayer,
  IncidentsLayer,
  LivePositionLayer,
  OriginDestinationLayer,
  ReportsLayer,
  RouteOutlineLayer,
  RouteSegmentsLayer,
} from '@/features/map/layers';
import { ReportDialog } from '@/features/reports/components/ReportDialog';
import { useHeatmap } from '@/features/reports/queries';
import { StartJourneyDialog } from '@/features/journey/components/StartJourneyDialog';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useUiStore } from '@/stores/uiStore';
import { useJourneyStore } from '@/stores/journeyStore';
import { formatDistance, formatDuration } from '@/lib/format';
import { LocationSearchInput } from '../components/LocationSearchInput';
import { RiskExplanation } from '../components/RiskExplanation';
import { RouteCard } from '../components/RouteCard';
import { usePlanRoutes } from '../queries';

const LAYER_LABELS = {
  communityReports: 'Community reports',
  historicalIncidents: 'Historical incidents',
  activeAlerts: 'Active alerts',
};

/**
 * The product's centrepiece: compare route alternatives by contextual risk,
 * see where the risk sits, understand why, then start a guarded journey.
 */
export default function RoutePlannerPage() {
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [activeSegment, setActiveSegment] = useState(null);
  const [bbox, setBbox] = useState(null);
  const [reportCoords, setReportCoords] = useState(null);
  const [isReportOpen, setReportOpen] = useState(false);
  const [isJourneyOpen, setJourneyOpen] = useState(false);

  const mapLayers = useUiStore((s) => s.mapLayers);
  const toggleMapLayer = useUiStore((s) => s.toggleMapLayer);
  const activeJourneyId = useJourneyStore((s) => s.activeJourneyId);

  const plan = usePlanRoutes();
  const { coords: myCoords, isLoading: isLocating, refresh: locate } = useGeolocation({ enabled: false });

  // Only refetch layers once the map has settled.
  const debouncedBbox = useDebouncedValue(bbox, 500);
  const { data: layers } = useHeatmap(debouncedBbox);

  const routes = plan.data?.routes ?? [];
  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null;

  const worstSegmentDetail = useMemo(() => {
    if (!selectedRoute?.risk?.worstSegment) return null;
    return selectedRoute.segments?.find((s) => s.seq === selectedRoute.risk.worstSegment.seq) ?? null;
  }, [selectedRoute]);

  const mapBounds = useMemo(() => {
    if (!selectedRoute) return null;
    return selectedRoute.path;
  }, [selectedRoute]);

  // Not a hook despite the shape — `use*` naming would confuse the linter.
  const applyMyLocation = (setter) => {
    locate();
    if (myCoords) {
      setter({ label: 'My current location', lat: myCoords[0], lng: myCoords[1] });
    } else {
      toast.info('Getting your location…');
    }
  };

  const findRoutes = () => {
    if (!origin || !destination) return;
    setActiveSegment(null);
    plan.mutate(
      {
        origin: [origin.lat, origin.lng],
        destination: [destination.lat, destination.lng],
        // Persisting gives each route an id a journey can reference later.
        persist: true,
      },
      {
        onSuccess: (data) => {
          const recommended = data.routes.find((r) => r.recommended) ?? data.routes[0];
          setSelectedRouteId(recommended?.id ?? null);
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ---------------------------------------------------------- panel */}
      <div className="flex w-full shrink-0 flex-col border-b lg:w-[420px] lg:border-b-0 lg:border-r">
        <div className="space-y-3 p-4">
          <LocationSearchInput
            id="origin"
            placeholder="From where?"
            value={origin}
            onChange={setOrigin}
            onUseMyLocation={() => applyMyLocation(setOrigin)}
            isLocating={isLocating}
            icon={MapPin}
          />
          <LocationSearchInput
            id="destination"
            placeholder="Where to?"
            value={destination}
            onChange={setDestination}
            icon={Flag}
          />

          <Button
            className="w-full"
            size="lg"
            onClick={findRoutes}
            loading={plan.isPending}
            disabled={!origin || !destination}
          >
            <Navigation />
            Compare safer routes
          </Button>
        </div>

        <Separator />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {plan.isPending && (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          )}

          {!plan.isPending && routes.length === 0 && (
            <EmptyState
              icon={ShieldCheck}
              title="Plan a safer journey"
              description="Enter where you're going and TrustRoute will compare the alternatives on contextual risk, not just travel time."
            />
          )}

          {!plan.isPending && routes.length > 0 && (
            <div className="space-y-4 p-4">
              <div className="space-y-2.5">
                {routes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    isSelected={route.id === selectedRoute?.id}
                    onSelect={(r) => {
                      setSelectedRouteId(r.id);
                      setActiveSegment(null);
                    }}
                    activeSeq={activeSegment?.seq ?? null}
                    onSegmentSelect={setActiveSegment}
                  />
                ))}
              </div>

              {selectedRoute && (
                <>
                  <Separator />

                  <div className="flex items-center justify-between gap-3">
                    <RiskScoreDial
                      score={selectedRoute.risk.score}
                      label={selectedRoute.risk.label}
                    />
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{formatDuration(selectedRoute.durationS)}</p>
                      <p>{formatDistance(selectedRoute.distanceM)}</p>
                    </div>
                  </div>

                  <RiskExplanation
                    risk={selectedRoute.risk}
                    worstSegmentDetail={activeSegment ?? worstSegmentDetail}
                  />

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => setJourneyOpen(true)}
                    disabled={Boolean(activeJourneyId)}
                  >
                    <ShieldCheck />
                    {activeJourneyId ? 'A journey is already running' : 'Start safe journey'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------ map */}
      <div className="relative min-h-[50vh] flex-1">
        <MapCanvas>
          <MapController bounds={mapBounds} />
          <BoundsWatcher onChange={setBbox} />
          <ClickHandler
            onClick={(coords) => {
              setReportCoords(coords);
              setReportOpen(true);
            }}
          />

          {/* Unselected alternatives sit behind, dashed and dim. */}
          {routes
            .filter((route) => route.id !== selectedRoute?.id)
            .map((route) => (
              <RouteOutlineLayer
                key={route.id}
                path={route.path}
                color="hsl(var(--muted-foreground))"
                onClick={() => setSelectedRouteId(route.id)}
              />
            ))}

          {selectedRoute && (
            <RouteSegmentsLayer
              segments={selectedRoute.segments}
              activeSeq={activeSegment?.seq ?? null}
              onSegmentClick={setActiveSegment}
            />
          )}

          <OriginDestinationLayer
            origin={origin ? [origin.lat, origin.lng] : null}
            destination={destination ? [destination.lat, destination.lng] : null}
          />

          {mapLayers.communityReports && layers?.communityReports && (
            <ReportsLayer points={layers.communityReports} />
          )}
          {mapLayers.historicalIncidents && layers?.historicalIncidents && (
            <IncidentsLayer points={layers.historicalIncidents} />
          )}
          {mapLayers.activeAlerts && layers?.activeAlerts && (
            <AlertsLayer alerts={layers.activeAlerts} />
          )}

          <LivePositionLayer position={myCoords} />
        </MapCanvas>

        {/* Floating map controls */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] flex items-start justify-between gap-2">
          <Badge variant="secondary" className="pointer-events-auto gap-1.5 shadow-sm">
            <MapPin className="size-3" />
            Tap the map to report an issue
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="pointer-events-auto shadow-sm"
              >
                <Layers />
                Layers
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Safety layers</DropdownMenuLabel>
              {Object.entries(LAYER_LABELS).map(([key, label]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={mapLayers[key]}
                  onCheckedChange={() => toggleMapLayer(key)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-6 left-3 z-[400] shadow-md"
          onClick={() => {
            setReportCoords(myCoords);
            setReportOpen(true);
          }}
          aria-label="Report an issue at my location"
        >
          <Plus />
        </Button>

        {plan.isPending && (
          <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center bg-background/40 backdrop-blur-[2px]">
            <div className="glass-panel flex items-center gap-2 px-4 py-2.5 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Scoring route alternatives…
            </div>
          </div>
        )}
      </div>

      <ReportDialog open={isReportOpen} onOpenChange={setReportOpen} coords={reportCoords} />
      <StartJourneyDialog
        open={isJourneyOpen}
        onOpenChange={setJourneyOpen}
        route={selectedRoute}
      />
    </div>
  );
}
