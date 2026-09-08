# TrustRoute

A privacy-first personal safety navigation and journey protection platform.

Traditional navigation optimises for time. TrustRoute adds a safety layer:
routes are scored on contextual risk, the risky stretch is shown rather than
averaged away, and the journey is watched from departure to arrival.

```
Choose a safer route → Understand the risk → Start the journey → Stay protected → Get help if needed
```

---

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18 + Vite, **plain JavaScript** (no TypeScript) |
| UI | Tailwind CSS + shadcn/ui (Radix primitives), lucide-react |
| Server state | TanStack Query · Client state: Zustand |
| Map | Leaflet + react-leaflet, OpenStreetMap tiles |
| Backend | Node.js 20 + Express, plain JavaScript (ESM) |
| Database | PostgreSQL + **PostGIS** |
| Real-time | Socket.IO |
| Validation | zod, on both sides |

No build step on the backend; no TypeScript anywhere. Correctness at the
boundaries is enforced at runtime with zod schemas instead of compile-time
types.

---

## Layout

```
women_safety_project/
├── backend/            Node.js API — see backend/README.md
├── frontend/           React app — see frontend/README.md
├── TRUSTROUTE_PROJECT.md  Product blueprint
└── PROJECT_ANALYSIS.md    Analysis of the original Flask prototype
```

---

## Running it

You need **two terminals**. The API must be up before the app is useful.

### 1. Backend

```bash
cd backend
npm install
# edit backend/.env — set your real Postgres password in DATABASE_URL
npm run db:migrate
npm run db:import:osm   # real OpenStreetMap data for your area
npm run db:seed:demo    # optional: sample data so every screen has content
npm run db:status      # what is loaded, and which risk factors it enables
npm run dev            # http://localhost:4000
```

PostgreSQL must be running **with the PostGIS extension installed** — that is
the one prerequisite the installer does not give you. Setup instructions are in
[backend/README.md](backend/README.md#1-prerequisites).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Vite proxies `/api` and `/socket.io` to port 4000, so no CORS setup is needed
in development.

### Checks

```bash
cd backend  && npm test     # 38 tests — geometry, segmentation, risk model, validation
cd frontend && npm run lint
cd frontend && npm run build
```

---

## What it does

**Safe Route Engine** — fetches route alternatives, cuts each into ~500 m
segments, scores every segment on six weighted factors, and ranks the results.
Near-ties break in favour of the faster route, so it never recommends a long
detour to shave two risk points.

**Explainable risk** — every score ships with the reasons behind it and the
per-factor breakdown. The worst segment is surfaced separately so a single
critical stretch cannot hide inside a calm average. The score is always
described as a *contextual route-risk score*, never a probability of crime.

**Community reports** — trust-weighted. A new report counts for 0.4, a
corroborated one 0.7, a verified one 1.0, so a single unverified report cannot
swing a route's score.

**Journey Guardian** — live GPS, route-deviation detection, and an ETA that
doubles as a dead-man switch. Miss it without checking in and the app asks
whether you are safe.

**Intelligent SOS** — the server records the event and prepares everything
(message, `tel:`/`sms:` links, nearest police and hospitals) but **sends
nothing itself**. Your phone does the sending, and the app never displays
"sent" for something that was not. Triggered offline, the SOS is queued on the
device and replayed when the network returns, with an idempotency key so the
replay cannot duplicate it.

**Fake call** — a scheduled, convincing incoming-call screen. Entirely local:
no API, no permissions.

---

## Where the data comes from

Every row carries a `source`, so real records and seeded samples can always be
told apart. Nothing is unattributable.

| Table | Source | Command |
| --- | --- | --- |
| `emergency_locations` | OpenStreetMap | `npm run db:import:osm` |
| `osm_features` (lamps, activity POIs) | OpenStreetMap | `npm run db:import:osm` |
| `community_reports` | your users | in-app |
| `safety_alerts` | your moderators | in-app |
| `crime_incidents` | **you must supply it** | `npm run db:import:crime` |

For development and demos there is also a seeded sample set — 155 incidents,
12 reports, a finished journey and two sign-in accounts:

```bash
cd backend
npm run db:seed:demo              # create
npm run db:seed:demo -- --purge   # remove
```

Every seeded row is tagged `source = 'demo'`, the API flags it on every score,
and the app shows a standing banner while any of it exists. It exists so the
product can be shown working — never as information about a real place.
Details in [backend/README.md](backend/README.md#3-data).

`npm run db:status` shows what is loaded and which risk factors it enables.

### The engine degrades honestly

A factor with no data behind it is **dropped and its weight redistributed**,
not scored as zero. Scoring an unsourced factor as zero would drag every route
down by that factor's weight and make roads look safer than the evidence
supports — the dangerous direction to be wrong in for a safety product.

The API returns exactly what it did and did not use:

```json
"coverage": {
  "factorsUsed": ["communityReports", "timeOfDay", "emergencyAccess", "isolation"],
  "factorsUnavailable": ["historicalCrime", "recentIncidents"],
  "note": "No historical crime data or recent incident data is loaded for this area, so they were excluded from the score rather than counted as zero…"
}
```

The UI shows that note next to the score.

### A note on the data this project used to ship with

Earlier versions carried `ncbr.csv`, described as NCRB crime statistics, plus
`risk_data.csv` and a seed that scattered synthetic incident points. All three
have been removed. The CSV was not real NCRB data:

- Case counts swung 40× year to year (Karnataka 3435 → 84 → 1545)
- Delhi showed 180 cases for a year — off by orders of magnitude
- The "risk percentage" did not follow the case counts (Kerala avg 2603 → 20%,
  Nagaland avg 2691 → 68%)
- No population normalisation, without which a "risk %" means nothing

The `historicalCrime` factor — 30% of the nominal model — rested entirely on
it. It is now inactive until real data is imported, and the app says so.

## Other limitations

- **Routing and geocoding use the public OSRM and Nominatim servers.** They
  have usage policies and rate limits, and are not commercial infrastructure.
  Both sit behind a provider interface — swap in a self-hosted OSRM by changing
  one environment variable. Nominatim blocks placeholder contact details, so
  `GEOCODER_USER_AGENT` must carry a real email or project URL.
- **No ML.** The risk engine is a documented, hand-tuned weighted model. Nothing
  in this codebase should be described as machine learning until a model is
  actually trained, evaluated and integrated.
- **OSM street-lighting coverage in India is sparse.** Durg–Bhilai has no
  `highway=street_lamp` nodes at all. Where lighting is unmapped the engine
  drops that sub-signal rather than scoring the area as unlit — absence of
  mapping is not absence of lighting.
- **The factor weights are product rules, not measured coefficients.** They
  are the most obvious thing to revisit once real feedback exists.

---

## History

This started as a Flask + SQLite + Jinja2 prototype. That codebase has been
removed — its endpoints are mapped to their Node equivalents in
[backend/README.md](backend/README.md#10-migrating-off-the-flask-prototype).
The prototype had no user accounts, so no rows carried over. Its CSV datasets
were dropped too, for the reasons above — the database is now populated from
OpenStreetMap and from your own users.
