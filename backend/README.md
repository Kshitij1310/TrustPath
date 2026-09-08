# TrustRoute — Backend

Node.js + Express API for TrustRoute: safe-route scoring, Journey Guardian and
the emergency workflow.

**Stack:** Node.js 20 · Express 4 · plain JavaScript (ESM) · PostgreSQL + PostGIS ·
Socket.IO · JWT · zod

No TypeScript, no build step — `node src/server.js` runs the source directly.

---

## 1. Prerequisites

| Thing | Why | Notes |
| --- | --- | --- |
| Node.js 20+ | runtime | `node -v` |
| PostgreSQL 14+ | database | already listening on `localhost:5432` on this machine |
| **PostGIS extension** | every spatial query | **this is the one piece that still needs installing** |

### Installing PostGIS on Windows

PostGIS does not ship with the PostgreSQL installer — it is a separate add-on:

1. Open **Stack Builder** (installed alongside PostgreSQL, in the Start menu).
2. Pick your PostgreSQL instance → **Spatial Extensions** → **PostGIS**.
3. Install, then confirm from psql: `SELECT PostGIS_Version();`

Offline alternative: download the matching `postgis-bundle-pgXX-x.y.z` zip from
<https://download.osgeo.org/postgis/windows/> and unzip it over your PostgreSQL
install directory.

`npm run db:migrate` runs `CREATE EXTENSION postgis` for you — it just needs the
extension files present on disk.

---

## 2. Setup

```bash
cd backend
npm install
```

`.env` already exists with a generated `JWT_SECRET`. **Edit one line** — your
real Postgres password:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/trustroute
```

Create the database, apply the schema, then import real data:

```bash
createdb -U postgres trustroute     # or: CREATE DATABASE trustroute; in psql
npm run db:migrate                  # extensions, tables, GIST indexes
npm run db:import:osm               # real OpenStreetMap data (see §3)
npm run db:status                   # what is loaded, and what it enables
npm run dev                         # http://localhost:4000
```

Check it came up:

```bash
curl http://localhost:4000/health
# {"status":"ok","database":"connected","postgis":"3.6 ..."}
```

Tests need neither the database nor a `.env`:

```bash
npm test        # 38 tests: geometry, segmentation, risk model, validation
```

---

## 3. Data

Every row carries a `source`. That is the rule the whole data layer rests on:
nothing in this database is unattributable, so real records and seeded samples
can always be told apart, surfaced differently, and removed separately.

| Source | Meaning |
| --- | --- |
| `osm` | Real OpenStreetMap data |
| `user` / `moderator` | Filed by a real person in the app |
| `demo` | Seeded sample data — see §3.3 |
| anything else | Whatever you passed to `--source` on import |

### `npm run db:import:osm`

Pulls real OpenStreetMap data via the Overpass API — free, no key.

```bash
npm run db:import:osm                                # default Durg–Bhilai bbox
npm run db:import:osm -- --bbox=21.0,81.1,21.4,81.5  # south,west,north,east
npm run db:import:osm -- --only=lamps                # facilities | lamps | activity
```

| Populates | With |
| --- | --- |
| `emergency_locations` | police, hospitals, clinics, fire stations, pharmacies, fuel, railway stations |
| `osm_features` kind=`street_lamp` | street lighting — the lighting signal |
| `osm_features` kind=`activity` | shops, food, banks, schools, offices — is anyone else around |

Re-running is safe; rows upsert on their OSM id. Data © OpenStreetMap
contributors, ODbL.

The public Overpass instances are often saturated, so the importer rotates
through mirrors and retries with backoff. Only **global-coverage** mirrors are
listed — a regional instance answers an out-of-region query with a valid empty
result, which would silently import nothing. (`overpass.osm.ch` carries
Switzerland only; it was in the list and had to be removed.)

### `npm run db:import:crime`

For real point-level incident data, when you obtain it:

```bash
npm run db:import:crime -- --file=incidents.csv --source=police-durg-2024
```

CSV columns: `lat`, `lng` required; `occurred_at`, `crime_type`, `severity`
(1–5), `state`, `district`, `source_ref` optional. `--source` is mandatory and
stamped on every row, so a bad import can be found and removed:

```sql
DELETE FROM crime_incidents WHERE source = 'the-bad-import';
```

Until this table has rows, the historical-crime and recent-incident factors
are inactive — see §6.

### `npm run db:seed:demo`

A complete, clearly-labelled sample dataset so every screen has content and the
risk engine has spatial variation to score against.

```bash
npm run db:seed:demo              # create (replaces any previous demo set)
npm run db:seed:demo -- --purge   # remove every trace of it
```

| Seeds | Detail |
| --- | --- |
| 4 users | `demo@trustroute.local` and `admin@trustroute.local`, password `demo1234` |
| 155 incidents | across 6 density zones, evening-weighted timestamps, recency-weighted |
| 12 reports | mixed `unverified` / `corroborated` / `verified`, with upvotes |
| 2 alerts | active, with expiry |
| 3 contacts | so the SOS sheet has someone to call |
| 1 journey | completed, 31 GPS points, a deviation, a check-in, a resolved SOS |

**What makes this legitimate rather than fabrication is that it never claims to
be real.** The incidents did not happen; nobody filed the reports. So:

- every row carries `source = 'demo'`
- `GET /api/meta/data-provenance` reports it, unauthenticated
- the risk engine sets `coverage.usingDemoData` on every score, with a note
- the app shows a standing, non-dismissible banner while any demo row exists
- `db:status` leads with it, before any numbers
- `--purge` removes all of it and leaves the real OSM data untouched

The zones are deliberately uneven. A uniform scatter would give every segment
the same score and defeat the point — the engine exists to tell places apart,
and the data has to let it. With the demo set loaded, segment scores on a
22 km route spread from 22 to 54; with no incident data at all they spread 6.

Use it for development, demos and screenshots. Never present a number derived
from it as information about a real place.

### `npm run db:status`

Prints what is loaded, which factors are active, and what their weights
actually are after redistribution. Start here when a score looks wrong.

---

## 4. API

All request/response coordinates are `[lat, lng]`. Authenticated routes take
`Authorization: Bearer <token>`.

### Auth — `/api/auth`
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/register` | — | create account, returns token |
| POST | `/login` | — | returns token |
| POST | `/logout` | — | client discards the token |
| GET | `/me` | user | current user + settings |
| PATCH | `/settings` | user | privacy toggles (sharing, retention) |
| DELETE | `/me` | user | delete account + all personal data |

### Routes & risk — `/api/routes`
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/` | optional | **the core call**: alternatives → segment risk → ranked, recommended |
| POST | `/score` | optional | score a path the client already has |
| GET | `/geocode?q=` | — | address search (Nominatim) |
| GET | `/:id` | user | a saved route with its segments |

`POST /api/routes` request:

```json
{ "origin": [21.1904, 81.2849], "destination": [21.2120, 81.3732],
  "departAt": "2026-08-09T23:00:00Z", "persist": true }
```

Response (abridged) — note `recommended`, the per-segment scores and the
`reasons` array that drives the explainability UI:

```json
{
  "routes": [{
    "id": "…", "name": "Route B", "distanceM": 8100, "durationS": 1380,
    "recommended": true,
    "risk": {
      "score": 31, "label": "moderate",
      "reasons": ["3 incidents reported near this route in the last 30 days",
                  "Travelling at 23:00 raises the time-of-day risk factor"],
      "worstSegment": { "seq": 4, "score": 58, "label": "high", "midpoint": [21.2, 81.35] },
      "disclaimer": "Contextual route-risk score … not a probability of crime."
    },
    "segments": [{ "seq": 0, "score": 22, "label": "low", "lengthM": 500, "counts": { … } }]
  }]
}
```

### Reports — `/api/reports`
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/` | optional | submit a report (`multipart/form-data`, optional `image`) |
| GET | `/` | — | recent reports |
| GET | `/nearby?lat=&lng=&radius=` | — | PostGIS radius search |
| GET | `/heatmap?minLat=&minLng=&maxLat=&maxLng=` | — | weighted points for the map layers |
| POST | `/:id/upvote` | user | corroboration — 3 upvotes promote `unverified` → `corroborated` |
| PATCH | `/:id/moderate` | admin | verify / reject |
| DELETE | `/:id` | owner or admin | delete |

Categories: `unsafe_area`, `poor_lighting`, `harassment`, `suspicious_activity`,
`crime`, `road_issue`, `other`.

### Alerts — `/api/alerts`
`GET /`, `GET /nearby` public; `POST /` and `DELETE /:id` admin only, since an
alert changes risk scores for every user.

### Journeys — `/api/journeys`
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/` | user | start a journey (`routeId`, `etaMinutes`, `share`) |
| GET | `/` | user | journey history |
| GET | `/:id` | user | detail + locations + events |
| POST | `/:id/location` | user | GPS ping → deviation check |
| POST | `/:id/safe` | user | "I'm Safe", optionally extend the ETA |
| POST | `/:id/end` | user | complete or cancel |
| GET | `/shared/:token` | — | trusted contact's read-only view |

### Emergency — `/api/emergency`
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/contacts` | user | trusted contacts |
| DELETE | `/contacts/:id` | user | remove a contact |
| POST | `/sos` | user | record the event, return everything the device needs |
| POST | `/sos/:id/confirm` | user | device reports what it actually sent |
| POST | `/sos/:id/resolve` | user | resolve / mark false alarm |
| GET | `/sos`, `/sos/:id` | user | history and detail |
| GET | `/facilities/nearby` | — | nearest police / hospital / station |

### Admin — `/api/admin`
`GET /overview` (dashboard tiles, pending reports, open SOS, active journeys),
`GET /risk-zones` (report clusters).

---

## 5. Real-time (Socket.IO)

Connect to the same origin. Authenticate with either a JWT or a share token:

```js
const socket = io('http://localhost:4000', { auth: { token } });
// or, for a trusted contact:  { auth: { shareToken } }

socket.emit('journey:subscribe', journeyId, (ack) => console.log(ack));
socket.on('journey:location', (p) => { /* { position, deviationM, deviating } */ });
socket.on('journey:deviation', (e) => { /* prompt: are you safe? */ });
socket.on('journey:overdue', (e) => { /* dead-man switch fired */ });
```

Membership is checked server-side on subscribe — nothing is broadcast globally.

---

## 6. How the risk engine works

1. The route polyline is cut into ~500 m segments (`SEGMENT_LENGTH_METERS`).
2. Each segment's midpoint is scored from six factors — see
   [`src/services/risk/weights.js`](src/services/risk/weights.js):

   | Factor | Nominal weight | Needs |
   | --- | --- | --- |
   | Historical crime | 30% | `crime_incidents` |
   | Recent incidents | 20% | `crime_incidents` |
   | Community reports | 15% | — always available |
   | Time of day | 15% | — computed |
   | Emergency access | 10% | `emergency_locations` |
   | Isolation | 10% | `osm_features` |

3. Community reports are **trust-weighted**: `unverified` 0.4, `corroborated`
   0.7, `verified` 1.0. A brand-new report cannot dominate a score.
4. The route score is `mean × 0.7 + worst × 0.3` — a single critical segment
   must not vanish into an average. `worstSegment` is always returned.
5. Near-ties (≤5 points) break in favour of the faster route, so the app never
   recommends a 40-minute detour to shave 2 risk points.

The score is a **contextual route-risk score**, never a probability of crime.
Every response carries that disclaimer. All weights are product rules meant to
be tuned against real data, not measured coefficients.

### Factors with no data are dropped, not zeroed

This is the most important rule in the engine.

Scoring an unsourced factor as 0 would drag every route down by that factor's
weight. A route would look *safer* than the evidence supports — the dangerous
direction to be wrong in. So `effectiveWeights()` drops such factors and
renormalises the rest to sum to 1, and every response carries a `coverage`
block naming what was excluded and why. `npm run db:status` shows the same
thing from the command line.

### Isolation

Two independent real signals, both from OSM:

- **lighting** — `highway=street_lamp` nodes within 150 m
- **activity** — shops, food, banks, schools within 300 m; a proxy for whether
  a place is overlooked rather than deserted

Lighting weighs 0.6 against activity's 0.4. But OSM lighting coverage in India
is sparse — Durg–Bhilai has *no* street lamps mapped — so when lighting is
unmapped, `isolationMix()` drops it and activity takes the full weight.
Otherwise every segment would score as pitch dark, confusing "not surveyed"
with "not lit" and adding a constant that discriminates nothing.

---

## 7. Zero-budget notes

- **Routing/geocoding** goes through the public OSRM and Nominatim servers,
  behind [`src/services/routing/index.js`](src/services/routing/index.js). Both
  have usage policies and rate limits — they are not commercial infrastructure.
  Swap in a self-hosted OSRM by changing `OSRM_BASE_URL`; no other file changes.
- **SOS sends nothing itself.** No paid SMS provider is required. The server
  records the incident and returns `tel:` / `sms:` / `wa.me` links plus the
  message text; the device performs the action and reports back via
  `/sos/:id/confirm`. Until it does, delivery state stays `"prepared"` — the API
  never claims a message was sent when it was not.
- **No Redis.** The overdue dead-man switch is a 60-second interval in
  [`src/services/journey/overdueSweeper.js`](src/services/journey/overdueSweeper.js).
  Swap it for a queue when one server is no longer enough.

---

## 8. Security & privacy

- bcrypt (cost 12) password hashing; JWT bearer tokens; login is rate-limited
  and returns the same message whether or not the email exists.
- Every query is parameterised — no string-built SQL.
- All input validated with zod, including coordinate ranges.
- Uploads: image MIME allow-list, size cap, random UUID filenames, extension
  derived from the MIME type rather than the client-supplied name.
- Journey shares use a 192-bit random token and expire.
- `DELETE /api/auth/me` cascades to journeys, locations, contacts and SOS rows.
- Sensitive by definition: live location, journey history, emergency contacts,
  report photos, SOS events. None of it is exposed unauthenticated.

Still to do before calling this production-ready: structured request logging,
audit trail, retention job that prunes journey history per the user's
`journeyHistoryRetentionDays` setting.

---

## 9. Layout

```
backend/src/
├── config/       env.js, db.js (pg pool + transaction helper)
├── controllers/  auth, route, report, alert, journey, emergency
├── routes/       one router per area, zod schemas colocated
├── services/
│   ├── risk/     riskEngine.js, weights.js
│   ├── routing/  provider interface + osrmProvider.js
│   ├── journey/  journeyService.js, overdueSweeper.js
│   └── emergency/sosService.js
├── middleware/   auth, validate, upload, rateLimit, errorHandler
├── db/           schema.sql, migrate.js, seed.js
├── utils/        geo.js, ApiError.js, asyncHandler.js
├── websocket/    Socket.IO rooms per journey
├── app.js
└── server.js
```

---

## 10. Migrating off the Flask prototype

The old `app.py` stays where it is for now; nothing here depends on it.
Endpoint mapping:

| Flask | Node |
| --- | --- |
| `POST /api/score_route` | `POST /api/routes/score` (now segment-level + explained) |
| `GET /api/get_state_risk` | **dropped** — it read the fabricated CSV baseline |
| `POST /api/report`, `GET /api/reports` | `POST /api/reports`, `GET /api/reports` |
| `GET/POST /api/alerts` | `GET/POST /api/alerts` (POST now admin-only) |
| `GET/POST /api/contacts` | `/api/emergency/contacts` (now per-user) |
| `POST /api/sos` (TextBee) | `POST /api/emergency/sos` (device-native, no paid SMS) |
| `POST /api/save_route` (CSV file) | `persist: true` on `POST /api/routes` |

The prototype had no user accounts — data was global. Everything here is
user-scoped, so nothing migrates from `data.db`. Its CSV datasets were dropped
as well: `ncbr.csv` was presented as NCRB statistics but was fabricated (40×
year-on-year swings, no population normalisation, risk percentages that did
not follow the case counts). The database is now populated from OpenStreetMap
and from your own users — see §3.
