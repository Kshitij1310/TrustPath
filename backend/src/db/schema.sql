-- TrustRoute schema — PostgreSQL + PostGIS
-- Idempotent: safe to run repeatedly (npm run db:migrate).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- users

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  -- privacy-by-design: every sharing behaviour is opt-in per user
  settings      JSONB NOT NULL DEFAULT '{
                  "shareLiveLocation": false,
                  "notifyContactsOnOverdue": true,
                  "voiceSafetyEnabled": false,
                  "journeyHistoryRetentionDays": 30
                }'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  relation   TEXT,
  priority   INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emergency_contacts_user_idx ON emergency_contacts (user_id, priority);

-- ------------------------------------------------------- safety datasets

-- Point-level incident data.
--
-- This table is EMPTY until real data is imported (`npm run db:import:crime`).
-- Nothing synthesises rows into it: a fabricated incident produces a
-- fabricated risk score, and this is a safety product. When the table is
-- empty the risk engine drops the historical-crime factor entirely and says
-- so in the response, rather than scoring 0 and quietly understating risk.
CREATE TABLE IF NOT EXISTS crime_incidents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geom         GEOGRAPHY(POINT, 4326) NOT NULL,
  occurred_at  TIMESTAMPTZ,
  crime_type   TEXT,
  severity     INT NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  state        TEXT,
  district     TEXT,
  -- Provenance is mandatory: every row must be traceable to where it came
  -- from, so an unsourced import can be found and removed later.
  source       TEXT NOT NULL,
  source_ref   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crime_incidents_geom_idx ON crime_incidents USING GIST (geom);
CREATE INDEX IF NOT EXISTS crime_incidents_occurred_idx ON crime_incidents (occurred_at DESC);

-- Real OpenStreetMap features, imported via the Overpass API.
--
-- Two things the risk engine needs and can source truthfully:
--   'street_lamp'  -> is this stretch lit?
--   'activity'     -> shops, cafes, offices; a proxy for whether a place is
--                     overlooked by other people rather than deserted.
CREATE TABLE IF NOT EXISTS osm_features (
  id          BIGSERIAL PRIMARY KEY,
  osm_id      BIGINT NOT NULL,
  osm_type    TEXT NOT NULL DEFAULT 'node',
  kind        TEXT NOT NULL CHECK (kind IN ('street_lamp', 'activity')),
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  name        TEXT,
  tags        JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (osm_type, osm_id, kind)
);
CREATE INDEX IF NOT EXISTS osm_features_geom_idx ON osm_features USING GIST (geom);
CREATE INDEX IF NOT EXISTS osm_features_kind_idx ON osm_features (kind);

CREATE TABLE IF NOT EXISTS community_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  category    TEXT NOT NULL CHECK (category IN (
                'unsafe_area', 'poor_lighting', 'harassment',
                'suspicious_activity', 'crime', 'road_issue', 'other')),
  description TEXT,
  severity    INT NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 5),
  -- trust system: reports start unverified and carry lower weight
  status      TEXT NOT NULL DEFAULT 'unverified'
                CHECK (status IN ('unverified', 'corroborated', 'verified', 'rejected')),
  upvotes     INT NOT NULL DEFAULT 0,
  image_path  TEXT,
  -- 'user' for anything a real person filed, 'demo' for seeded sample data.
  -- Provenance is first-class so demo rows can always be told apart from
  -- real ones, surfaced in the UI, and purged exactly.
  source      TEXT NOT NULL DEFAULT 'user',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_reports_geom_idx ON community_reports USING GIST (geom);
CREATE INDEX IF NOT EXISTS community_reports_created_idx ON community_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS safety_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  radius_m    INT NOT NULL DEFAULT 500,
  alert_type  TEXT NOT NULL,
  description TEXT,
  severity    INT NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  active_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  source      TEXT NOT NULL DEFAULT 'moderator',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safety_alerts_geom_idx ON safety_alerts USING GIST (geom);
CREATE INDEX IF NOT EXISTS safety_alerts_expiry_idx ON safety_alerts (expires_at);

-- Police stations, hospitals, etc. Proximity lowers a segment's risk.
-- Populated from OpenStreetMap by `npm run db:import:osm` — real data, not
-- a hand-written list.
CREATE TABLE IF NOT EXISTS emergency_locations (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geom     GEOGRAPHY(POINT, 4326) NOT NULL,
  name     TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN (
             'police', 'hospital', 'railway_station', 'petrol_pump',
             'fire_station', 'pharmacy', 'public_place', 'other')),
  phone    TEXT,
  address  TEXT,
  source   TEXT NOT NULL DEFAULT 'osm',
  osm_id   BIGINT,
  UNIQUE (source, osm_id)
);
CREATE INDEX IF NOT EXISTS emergency_locations_geom_idx ON emergency_locations USING GIST (geom);

-- ------------------------------------------------------ routes & scoring

CREATE TABLE IF NOT EXISTS routes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  origin         GEOGRAPHY(POINT, 4326) NOT NULL,
  destination    GEOGRAPHY(POINT, 4326) NOT NULL,
  path           GEOGRAPHY(LINESTRING, 4326) NOT NULL,
  distance_m     NUMERIC NOT NULL,
  duration_s     NUMERIC NOT NULL,
  risk_score     INT,
  risk_label     TEXT,
  -- the explainability payload: factor breakdown + reason strings
  risk_breakdown JSONB,
  scored_for_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS routes_user_idx ON routes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS route_segments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id      UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  seq           INT NOT NULL,
  geom          GEOGRAPHY(LINESTRING, 4326) NOT NULL,
  midpoint      GEOGRAPHY(POINT, 4326) NOT NULL,
  length_m      NUMERIC NOT NULL,
  risk_score    INT NOT NULL,
  risk_label    TEXT NOT NULL,
  factors       JSONB NOT NULL,
  UNIQUE (route_id, seq)
);
CREATE INDEX IF NOT EXISTS route_segments_geom_idx ON route_segments USING GIST (geom);

-- ------------------------------------------------------ journey guardian

CREATE TABLE IF NOT EXISTS journeys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id         UUID REFERENCES routes(id) ON DELETE SET NULL,
  label            TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'completed', 'overdue', 'sos', 'cancelled')),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  eta_at           TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  last_check_in_at TIMESTAMPTZ,
  -- opaque token for read-only sharing with a trusted contact
  share_token      TEXT UNIQUE,
  share_expires_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journeys_user_idx ON journeys (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS journeys_active_idx ON journeys (status, eta_at);

CREATE TABLE IF NOT EXISTS journey_locations (
  id           BIGSERIAL PRIMARY KEY,
  journey_id   UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  geom         GEOGRAPHY(POINT, 4326) NOT NULL,
  accuracy_m   NUMERIC,
  speed_mps    NUMERIC,
  deviation_m  NUMERIC,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journey_locations_journey_idx
  ON journey_locations (journey_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS journey_events (
  id         BIGSERIAL PRIMARY KEY,
  journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN (
               'started', 'deviation', 'back_on_route', 'overdue',
               'checked_in', 'sos', 'ended', 'cancelled')),
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journey_events_journey_idx ON journey_events (journey_id, created_at DESC);

-- ------------------------------------------------------------- emergency

CREATE TABLE IF NOT EXISTS sos_incidents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id     UUID REFERENCES journeys(id) ON DELETE SET NULL,
  geom           GEOGRAPHY(POINT, 4326),
  trigger        TEXT NOT NULL CHECK (trigger IN ('manual', 'overdue', 'deviation', 'voice', 'offline_sync')),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'false_alarm')),
  notes          TEXT,
  -- what the *device* actually did; never assume delivery succeeded
  notified       JSONB NOT NULL DEFAULT '[]'::jsonb,
  client_ref     TEXT UNIQUE,   -- idempotency key for offline replay
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sos_incidents_user_idx ON sos_incidents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sos_incidents_open_idx ON sos_incidents (status, created_at DESC);

-- ------------------------------------------------------------- migrations
--
-- CREATE TABLE IF NOT EXISTS does nothing when a table already exists, so it
-- never adds a column to a database created by an earlier version of this
-- file. These statements bring an existing schema up to date and are no-ops
-- on a fresh one.

-- Provenance on emergency_locations: rows now come from the OSM importer.
ALTER TABLE emergency_locations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'osm',
  ADD COLUMN IF NOT EXISTS osm_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'emergency_locations_source_osm_id_key'
  ) THEN
    ALTER TABLE emergency_locations
      ADD CONSTRAINT emergency_locations_source_osm_id_key UNIQUE (source, osm_id);
  END IF;
END $$;

-- 'pharmacy' was added to the facility kinds when the OSM importer landed.
ALTER TABLE emergency_locations DROP CONSTRAINT IF EXISTS emergency_locations_kind_check;
ALTER TABLE emergency_locations
  ADD CONSTRAINT emergency_locations_kind_check CHECK (kind IN (
    'police', 'hospital', 'railway_station', 'petrol_pump',
    'fire_station', 'pharmacy', 'public_place', 'other'));

-- Traceability on imported incidents.
ALTER TABLE crime_incidents
  ADD COLUMN IF NOT EXISTS source_ref TEXT;
ALTER TABLE crime_incidents ALTER COLUMN source DROP DEFAULT;

-- The fabricated district baseline this project shipped with has been
-- removed. Drop the table if an older database still carries it.
DROP TABLE IF EXISTS district_risk;

-- Provenance on user-generated tables, so seeded demo rows are always
-- distinguishable from real ones and can be purged exactly.
ALTER TABLE community_reports ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';
ALTER TABLE safety_alerts     ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'moderator';
ALTER TABLE users             ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'signup';

CREATE INDEX IF NOT EXISTS community_reports_source_idx ON community_reports (source);
CREATE INDEX IF NOT EXISTS crime_incidents_source_idx   ON crime_incidents (source);
