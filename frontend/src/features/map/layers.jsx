import { Circle, CircleMarker, Marker, Polyline, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { riskLevel } from '@/lib/risk';
import { formatDistance, formatRelative } from '@/lib/format';
import { categoryLabel } from '@/lib/risk';

/**
 * A route drawn segment-by-segment, each coloured by its own risk band.
 *
 * This is the visual form of the blueprint's core argument: a route is not
 * one number, and the risky 500 m stretch should be visible on the map rather
 * than averaged away.
 */
export function RouteSegmentsLayer({ segments, dimmed = false, onSegmentClick, activeSeq }) {
  return segments.map((segment) => {
    const level = riskLevel(segment.label);
    const isActive = activeSeq === segment.seq;

    return (
      <Polyline
        key={segment.seq}
        positions={segment.path}
        pathOptions={{
          color: level.color,
          weight: isActive ? 9 : dimmed ? 4 : 6,
          opacity: dimmed ? 0.35 : 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }}
        eventHandlers={{ click: () => onSegmentClick?.(segment) }}
      >
        <Tooltip sticky>
          <span className="font-medium">
            Segment {segment.seq + 1} — {level.label} ({segment.score})
          </span>
        </Tooltip>
      </Polyline>
    );
  });
}

/** A plain route outline, for alternatives that are not selected. */
export function RouteOutlineLayer({ path, color, onClick }) {
  return (
    <Polyline
      positions={path}
      pathOptions={{ color, weight: 5, opacity: 0.35, dashArray: '6 8' }}
      eventHandlers={{ click: onClick }}
    />
  );
}

const pinIcon = (color, glyph) =>
  L.divIcon({
    className: '',
    html: `<span style="
      display:grid;place-items:center;
      width:28px;height:28px;border-radius:9999px;
      background:${color};color:white;font-size:13px;font-weight:600;
      box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.85)
    ">${glyph}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

export const originIcon = pinIcon('hsl(217 91% 60%)', 'A');
export const destinationIcon = pinIcon('hsl(152 55% 45%)', 'B');

/** The user's live position: a dot with an accuracy halo and a pulse. */
export function LivePositionLayer({ position, accuracyM }) {
  if (!position) return null;

  return (
    <>
      {accuracyM > 0 && (
        <Circle
          center={position}
          radius={accuracyM}
          pathOptions={{ color: 'hsl(217 91% 60%)', weight: 1, fillOpacity: 0.08 }}
        />
      )}
      <CircleMarker
        center={position}
        radius={7}
        pathOptions={{
          color: 'white',
          weight: 2,
          fillColor: 'hsl(217 91% 60%)',
          fillOpacity: 1,
        }}
      />
    </>
  );
}

export function OriginDestinationLayer({ origin, destination }) {
  return (
    <>
      {origin && <Marker position={origin} icon={originIcon} />}
      {destination && <Marker position={destination} icon={destinationIcon} />}
    </>
  );
}

/**
 * Community reports as graduated circles.
 *
 * Radius encodes weight rather than a real-world distance, so it is capped —
 * an oversized blob would imply a precision the data does not have.
 */
export function ReportsLayer({ points, onSelect }) {
  return points.map((point, idx) => (
    <CircleMarker
      key={`${point.lat}-${point.lng}-${idx}`}
      center={[point.lat, point.lng]}
      radius={6 + (point.weight ?? 0.5) * 8}
      pathOptions={{
        color: 'hsl(var(--risk-high))',
        weight: 1,
        fillColor: 'hsl(var(--risk-high))',
        fillOpacity: 0.35,
      }}
      eventHandlers={{ click: () => onSelect?.(point) }}
    >
      {point.category && (
        <Popup>
          <p className="font-medium">{categoryLabel(point.category)}</p>
          {point.description && <p className="mt-1 text-muted-foreground">{point.description}</p>}
          {point.createdAt && (
            <p className="mt-1 text-xs text-muted-foreground">{formatRelative(point.createdAt)}</p>
          )}
        </Popup>
      )}
    </CircleMarker>
  ));
}

export function IncidentsLayer({ points }) {
  return points.map((point, idx) => (
    <CircleMarker
      key={`incident-${idx}`}
      center={[point.lat, point.lng]}
      radius={4 + (point.weight ?? 0.5) * 5}
      pathOptions={{
        stroke: false,
        fillColor: 'hsl(var(--risk-critical))',
        fillOpacity: 0.22,
      }}
    />
  ));
}

/** Active alerts, drawn at their real radius — this one is a true distance. */
export function AlertsLayer({ alerts }) {
  return alerts.map((alert, idx) => (
    <Circle
      key={alert.id ?? `alert-${idx}`}
      center={[alert.lat, alert.lng]}
      radius={alert.radiusM ?? 500}
      pathOptions={{
        color: 'hsl(var(--risk-moderate))',
        weight: 1.5,
        dashArray: '4 6',
        fillColor: 'hsl(var(--risk-moderate))',
        fillOpacity: 0.12,
      }}
    >
      <Popup>
        <p className="font-medium">{alert.alertType ?? alert.type}</p>
        {alert.description && <p className="mt-1 text-muted-foreground">{alert.description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Affects {formatDistance(alert.radiusM ?? 500)} around this point
        </p>
      </Popup>
    </Circle>
  ));
}

/** Police stations, hospitals and the rest — shown during an SOS. */
export function FacilitiesLayer({ facilities }) {
  return facilities.map((facility, idx) => (
    <CircleMarker
      key={`facility-${idx}`}
      center={[facility.lat, facility.lng]}
      radius={6}
      pathOptions={{
        color: 'white',
        weight: 1.5,
        fillColor: 'hsl(var(--risk-low))',
        fillOpacity: 0.95,
      }}
    >
      <Popup>
        <p className="font-medium">{facility.name}</p>
        <p className="text-xs capitalize text-muted-foreground">
          {facility.kind.replace('_', ' ')} · {formatDistance(facility.distanceM)}
        </p>
      </Popup>
    </CircleMarker>
  ));
}
