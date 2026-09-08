import { formatDistanceToNow, format, isValid } from 'date-fns';

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatTime(value) {
  const date = new Date(value);
  return isValid(date) ? format(date, 'HH:mm') : '—';
}

export function formatDateTime(value) {
  const date = new Date(value);
  return isValid(date) ? format(date, 'd MMM, HH:mm') : '—';
}

export function formatRelative(value) {
  const date = new Date(value);
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : '—';
}

/** mm:ss for the fake-call and overdue countdowns. */
export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export const formatCoords = ([lat, lng]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
