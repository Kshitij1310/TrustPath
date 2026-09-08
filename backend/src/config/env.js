import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be a number`);
  return parsed;
}

function bool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true';
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: num('PORT', 4000),

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  databaseUrl: required('DATABASE_URL'),
  databaseSsl: bool('DATABASE_SSL', false),

  osrmBaseUrl: (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, ''),
  nominatimBaseUrl: (process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
  geocoderUserAgent: process.env.GEOCODER_USER_AGENT || 'TrustRoute/0.1',

  segmentLengthMeters: num('SEGMENT_LENGTH_METERS', 500),
  incidentRadiusMeters: num('INCIDENT_RADIUS_METERS', 500),

  deviationThresholdMeters: num('DEVIATION_THRESHOLD_METERS', 250),
  overdueGraceMinutes: num('OVERDUE_GRACE_MINUTES', 10),

  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadBytes: num('MAX_UPLOAD_BYTES', 5 * 1024 * 1024),
};

if (env.isProduction && env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
