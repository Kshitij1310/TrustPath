import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { cn } from '@/lib/utils';

// Leaflet's default icon URLs assume a CSS-relative path that a bundler
// rewrites; wire the imported assets back in once, globally.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/** Durg–Bhilai, the corridor the seeded data covers. */
export const DEFAULT_CENTER = [21.1938, 81.3];
export const DEFAULT_ZOOM = 12;

/** Pans/zooms the map when the caller changes `bounds` or `center`. */
export function MapController({ bounds, center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (bounds?.length) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [64, 64], maxZoom: 16 });
    } else if (center) {
      map.setView(center, zoom ?? map.getZoom());
    }
  }, [map, bounds, center, zoom]);

  return null;
}

/** Reports the visible bounding box — used to fetch only what is on screen. */
export function BoundsWatcher({ onChange }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });

  function emit() {
    const b = map.getBounds();
    onChange({
      minLat: b.getSouth(),
      minLng: b.getWest(),
      maxLat: b.getNorth(),
      maxLng: b.getEast(),
    });
  }

  useEffect(() => {
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Turns a map click into a coordinate — how reports get placed. */
export function ClickHandler({ onClick }) {
  useMapEvents({
    click: (event) => onClick?.([event.latlng.lat, event.latlng.lng]),
  });
  return null;
}

/**
 * Leaflet measures its container once on mount and never again on its own —
 * a CSS-only resize (the side panel collapsing, a sidebar toggling) leaves it
 * drawing tiles at the old size until the window itself fires a resize event.
 * Watch the container and tell Leaflet to re-measure whenever it changes.
 */
export function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export function MapCanvas({
  children,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  className,
  ...props
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      zoomControl={false}
      className={cn('size-full', className)}
      // Scroll-zoom is off by default so the page still scrolls on mobile when
      // a finger lands on the map; Ctrl/pinch still zooms.
      scrollWheelZoom
      {...props}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {children}
    </MapContainer>
  );
}
