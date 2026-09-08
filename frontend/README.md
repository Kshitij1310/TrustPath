# TrustRoute — Frontend

React 18 + Vite, **plain JavaScript**. Tailwind + shadcn/ui, TanStack Query for
server state, Zustand for client state, Leaflet for maps.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

No `.env` is needed in development — Vite proxies `/api` and `/socket.io` to
`http://localhost:4000`. Start the backend first.

---

## Structure

Organised by **feature**, not by file type. Everything one feature needs —
its API calls, its query hooks, its components, its pages — lives in one
folder, so a change to reports touches `features/reports/` and nothing else.

```
src/
├── app/                    Wiring only, no feature logic
│   ├── router.jsx          Lazy routes + Suspense boundaries
│   ├── routes.js           Path constants and nav config
│   ├── providers.jsx       Query client, theme, tooltips, toasts
│   └── queryClient.js      Query keys + cache defaults
│
├── components/
│   ├── ui/                 shadcn primitives (button, dialog, sheet, …)
│   ├── layout/             AppShell, Sidebar, Topbar, MobileNav
│   └── common/             RiskBadge, states, ErrorBoundary, PageHeader
│
├── features/
│   ├── auth/               api · queries · RequireAuth · pages
│   ├── routing/            api · queries · RouteCard · SegmentStrip · RiskExplanation
│   ├── map/                MapCanvas + the Leaflet layers
│   ├── journey/            JourneyTracker · ActiveJourneyBar · JourneyPrompts
│   ├── reports/            ReportDialog · ReportsPage
│   ├── alerts/             AlertsPage (publishing is admin-only)
│   ├── emergency/          SosButton · SosSheet · FakeCall · sosStore
│   ├── settings/           Privacy controls, retention, account deletion
│   └── admin/              Moderation dashboard
│
├── hooks/                  useGeolocation, useCountdown, useOnlineStatus, …
├── lib/                    apiClient, socket, risk, format, utils
└── stores/                 authStore, journeyStore, uiStore
```

Each feature folder follows the same shape:

```
features/<name>/
├── api.js          Thin wrappers over lib/apiClient — no React in here
├── queries.js      TanStack Query hooks; cache invalidation and toasts
├── components/     Feature-owned components
└── pages/          Route-level components (default export, lazily imported)
```

---

## The rules this codebase follows

**Server state vs client state are never mixed.** Anything the API owns lives
in TanStack Query. Zustand holds only what the server does not: the auth token,
which journey this device is tracking, UI preferences, the offline SOS queue.
A field never lives in both.

**Query keys live in one file.** `app/queryClient.js` exports every key. An
invalidation cannot miss a cache entry because two files spelled a key
differently.

**One API client.** `lib/apiClient.js` is the only place that calls `fetch`.
It attaches the bearer token, unwraps JSON, converts non-2xx into an `ApiError`
carrying `status` and field-level `details`, and signs the user out on a 401.

**Every page is code-split.** `router.jsx` lazy-imports all of them with a
per-page Suspense boundary, so a slow chunk never blanks the shell. Leaflet,
React and the query layer are split into separate vendor chunks — an app change
does not invalidate the map library in anyone's cache.

**Errors have somewhere to go.** An `ErrorBoundary` wraps the app and another
wraps the page outlet, so one broken panel cannot take the SOS button down with
it. Queries render `ErrorState` with the server's own message; 4xx responses are
never retried.

**Loading states match their content.** `Skeleton` rows shaped like the list
they stand in for, not a centred spinner over an empty page.

---

## Safety-specific decisions

These are not stylistic — they follow from what the product is.

**The SOS button is press-and-hold (800 ms).** A pocket tap must not fire an
emergency workflow, but a real one should still take under a second. The ring
fills as you hold, so the interaction explains itself.

**The SOS sheet never says "sent".** The server prepares links; the device
sends. The sheet says *"Recorded — nothing has been sent yet"* and records what
actually happened via `/sos/:id/confirm` after you act.

**Offline SOS is queued, not failed.** `sosStore` persists the payload with a
`clientRef`; `useOfflineSosReplay` replays it on reconnect. The server treats
`clientRef` as an idempotency key, so a replay cannot duplicate the incident.

**Safety prompts cannot be dismissed by accident.** The deviation and overdue
dialogs block Escape and outside clicks. An unanswered "are you safe?" is the
signal the dead-man switch depends on — a stray tap must not answer it.

**Journey tracking survives a refresh.** `activeJourneyId` is persisted. A
reload mid-journey that silently stopped tracking would be a safety failure,
not a UX annoyance.

**Tracking is app-wide, not page-scoped.** `JourneyTracker` is headless and
mounted in the shell, so GPS keeps flowing whatever page is open.

**Risk colour is never the only signal.** `RiskBadge` always pairs the colour
with the band's name and score. The palette is tuned to stay distinguishable
for common colour-vision deficiencies.

**Sharing is off by default, everywhere.** Live location sharing is a per-user
setting *and* a per-journey switch. Share links expire.

---

## Design system

Tokens are HSL CSS variables in `index.css`, with a full light and dark palette.
Four risk bands (`--risk-low` … `--risk-critical`) are defined once there,
mirrored in `lib/risk.js` for JS consumers, and exposed to Tailwind as
`risk-low`, `risk-moderate`, `risk-high`, `risk-critical`.

Leaflet ships light-themed chrome, so `index.css` re-skins its controls,
popups and attribution with the same tokens, and knocks the tiles back in dark
mode. Without that the map looks bolted on.

Adding a shadcn component: this project uses plain JS, so the CLI's default
TypeScript output does not apply. Copy the component into `components/ui/`,
rename to `.jsx`, and strip the type annotations — the existing files show the
pattern.

---

## Known lint warnings

`npm run lint` reports seven `react-refresh/only-export-components` warnings.
They come from files that export both a component and a constant —
`buttonVariants`, `DEFAULT_CENTER`, the map icons. That is the standard shadcn
layout; the warnings only affect hot-reload granularity, never the build.
