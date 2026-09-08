# TrustRoute — Separate Admin Panel

Build brief for splitting moderation and oversight out of the user app into its
own application.

Written against the codebase as it stands. Every claim in §1 was verified in the
source, not assumed.

---

## 1. Why this needs to change

The admin surface currently lives inside the user app. It is hidden, not
separated.

### 1.1 Admin code ships to every user

`frontend/src/features/admin/pages/AdminPage.jsx` is lazily imported by
`app/router.jsx`, so it builds to its own chunk:

```
dist/assets/AdminPage-C7vUy3NE.js    4.6 kB
```

That chunk sits on the same origin as the user app and is fetchable by anyone.
It is only *hidden*, in two places:

- `app/routes.js` marks the nav item `adminOnly: true`, and
  `components/layout/Sidebar.jsx` filters it out with `useIsAdmin()`
- `AdminPage.jsx` redirects with `<Navigate to={paths.plan} />` when
  `useIsAdmin()` is false

Both are client-side. A regular user can read the chunk and learn every admin
endpoint, its query shape and its response fields. Nothing is stolen by doing
so — the API still enforces the role — but the entire moderation interface is
public reading material, which is not a decision anyone made on purpose.

### 1.2 One token, two privilege levels

`middleware/auth.js` signs a single token shape:

```js
jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn })
```

`JWT_EXPIRES_IN` is `7d`. So an admin's browsing token — sitting in
`localStorage` under `trustroute.auth`, on the same origin they use for
ordinary route planning — carries moderation authority for a week. There is no
separate admin session, no shorter expiry, no re-authentication before a
privileged action.

To be fair to the current code: the role check itself is sound. `requireAuth`
re-reads `SELECT id, role FROM users` on every request, so a demoted admin
loses access immediately; the claim in the token is not trusted for
authorisation. The problem is session *scope*, not role verification.

### 1.3 Admin sees sensitive data with no record of it

`GET /api/admin/overview` returns, for every open SOS:

```sql
SELECT s.id, s.trigger, s.created_at, u.display_name,
       ST_Y(s.geom::geometry) AS lat, ST_X(s.geom::geometry) AS lng
FROM sos_incidents s JOIN users u ON u.id = s.user_id
WHERE s.status = 'open'
```

A person's name and the coordinates where they triggered an emergency. The
README calls live location, journey history and SOS events sensitive — and they
are. But **there is no `audit_log` table** (verified: absent from
`schema.sql`), so nothing records which admin looked at whose emergency, or
when. For this class of data that is the most serious gap on this list, ahead
of the bundle exposure.

### 1.4 The admin panel is thinner than it looks

The whole admin API is two reads and three writes:

| Endpoint | File |
| --- | --- |
| `GET /api/admin/overview` | `routes/adminRoutes.js` |
| `GET /api/admin/risk-zones` | `routes/adminRoutes.js` |
| `PATCH /api/reports/:id/moderate` | `routes/reportRoutes.js` |
| `POST /api/alerts` | `routes/alertRoutes.js` |
| `DELETE /api/alerts/:id` | `routes/alertRoutes.js` |

There is no user management, no way to see or revoke a share link, no import
controls, no way to review a moderation decision after the fact. A separate app
is the right moment to build those properly rather than bolting them onto a
page that redirects.

---

## 2. Decision

Three separate deployables, one API.

```
trustroute/
├── backend/     one API, serves both apps          (exists)
├── frontend/    the user app                        (exists)
└── admin/       NEW — moderation & oversight console
```

**One API, not two.** A second backend would duplicate the risk engine, the
PostGIS queries and the auth logic, and the two copies would drift. Admin
routes stay in `backend/`, behind their own middleware and their own session
type.

**Separate origins.** In development the admin app runs on its own port; in
production it gets its own hostname (`admin.trustroute.example`). This is what
actually stops admin code reaching users, and it lets the admin host carry
stricter headers, IP restrictions and its own cookie scope.

### What is shared, and how

Do **not** import across `frontend/` and `admin/`. Two apps reaching into each
other's `src/` is how a change to a user-facing button breaks the moderation
queue.

| Thing | Approach |
| --- | --- |
| `components/ui/*` (shadcn primitives) | **Copy** into `admin/src/components/ui/`. They are copy-paste components by design; the admin app will diverge — denser tables, different spacing. |
| `lib/utils.js` (`cn`) | Copy. Six lines. |
| `lib/apiClient.js` | Copy, then change: admin session key, and no silent 401 sign-out (an admin needs to know their session ended, not be bounced). |
| `lib/risk.js`, `lib/format.js` | Copy the parts used. |
| Design tokens (`index.css`) | Copy the token block, then **change the accent** so the two apps are visually distinct. An admin must never be unsure which app they are in. |
| API response shapes | Not shared in code. Documented in `backend/README.md` §4. |

If duplication later becomes a real maintenance cost, extract a `packages/ui`
workspace. Do not start there — a monorepo for two apps and sixteen components
is overhead before it is leverage.

---

## 3. Backend work

Do this **first**. The admin app has nothing to build against otherwise.

### 3.1 Audit log — non-negotiable, before anything else

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL,          -- denormalised: survives account deletion
  action      TEXT NOT NULL,          -- 'report.verify', 'sos.view', 'user.suspend'
  target_type TEXT,                   -- 'community_report', 'sos_incident', 'user'
  target_id   TEXT,
  -- What the admin saw or changed. For a read of sensitive data, record that
  -- the read happened; do not copy the sensitive values in here.
  detail      JSONB,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx  ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log (target_type, target_id);
```

Rules:

- **Every** admin mutation writes a row.
- **Every read of personal data** writes a row: SOS detail, journey detail,
  user detail, anything naming a person or a location. `sos.view` matters as
  much as `sos.resolve`.
- Append-only. No `UPDATE`, no `DELETE` from application code. Retention is a
  separate scheduled job, never an admin action.
- The log is readable in the admin app but never editable there.

Implement as `backend/src/services/audit/auditService.js` plus middleware that
takes the action name, so a route reads:

```js
router.patch('/:id/moderate', requireAdminSession, audit('report.moderate'), handler)
```

### 3.2 Separate admin sessions

Add a session scope to the token so a user-app token cannot moderate:

```js
// middleware/auth.js
export function signToken(user, { scope = 'app' } = {}) {
  return jwt.sign(
    { sub: user.id, role: user.role, scope },
    env.jwtSecret,
    { expiresIn: scope === 'admin' ? env.adminJwtExpiresIn : env.jwtExpiresIn },
  );
}
```

- `POST /api/admin/auth/login` issues `scope: 'admin'` and rejects non-admins
- New `requireAdminSession`: valid token **and** `scope === 'admin'` **and** a
  fresh DB role check **and** an audit row
- `ADMIN_JWT_EXPIRES_IN=8h` in `.env.example` — a shift, not a week
- The three shared mutations (`reports/:id/moderate`, `alerts` POST/DELETE)
  move from `requireAdmin` to `requireAdminSession`

Result: an admin's ordinary app token can plan routes and nothing else.

### 3.3 CORS and headers

`app.js` currently reads one `CORS_ORIGINS` list. Split it:

```
CORS_ORIGINS=http://localhost:5173
ADMIN_ORIGINS=http://localhost:5174
```

`/api/admin/*` accepts `ADMIN_ORIGINS` only; everything else accepts
`CORS_ORIGINS` only. An admin endpoint should reject a request from the user
app's origin outright.

On the admin router add `Cache-Control: no-store` and `X-Frame-Options: DENY` —
the admin console must never be framed.

### 3.4 Rate limiting

`middleware/rateLimit.js` has no admin limiter. Add:

- `adminAuthLimiter` — 5 attempts / 15 min, stricter than the user
  `authLimiter`'s 10
- `adminApiLimiter` — generous on reads, tight on mutations

### 3.5 New endpoints

Everything below is new. Each mutation audits; each personal-data read audits.

**Auth**
```
POST   /api/admin/auth/login          scope:'admin' token, admins only
POST   /api/admin/auth/logout
GET    /api/admin/auth/me
```

**Moderation queue** — replaces poking `/api/reports` with an admin token
```
GET    /api/admin/reports?status=&category=&from=&to=&page=
PATCH  /api/admin/reports/:id/moderate     { status, reason }   ← reason required
POST   /api/admin/reports/bulk-moderate    { ids[], status, reason }
GET    /api/admin/reports/:id              full detail incl. reporter + photo
```

`reason` being mandatory is the point. A rejection with no stated reason is
unreviewable later, and rejection removes a report from everyone's risk score.

**Alerts**
```
GET    /api/admin/alerts?includeExpired=
POST   /api/admin/alerts
PATCH  /api/admin/alerts/:id
DELETE /api/admin/alerts/:id
```

**Users**
```
GET    /api/admin/users?q=&role=&page=
GET    /api/admin/users/:id            counts only — never their journey routes
PATCH  /api/admin/users/:id/role       { role }
POST   /api/admin/users/:id/suspend    { reason, until }
```

Suspension needs a schema change: `users.suspended_until TIMESTAMPTZ`,
`users.suspended_reason TEXT`, and a check in `requireAuth`.

**Safety oversight — the sensitive set**
```
GET    /api/admin/sos?status=&from=&to=
GET    /api/admin/sos/:id              audits 'sos.view'
POST   /api/admin/sos/:id/annotate     { note }
GET    /api/admin/journeys?status=overdue
```

Design constraint, not a preference: **an admin does not get live tracking of an
arbitrary user.** Overdue and SOS journeys only, and every open audits. Anything
broader is surveillance with a dashboard on it.

**Data operations**
```
GET    /api/admin/data/status          what db:status prints, as JSON
POST   /api/admin/data/import/osm      { bbox }  → job id
GET    /api/admin/data/jobs/:id
DELETE /api/admin/data/demo            purge demo rows
```

**Audit log**
```
GET    /api/admin/audit?actor=&action=&target=&from=&to=&page=
```

### 3.6 Fix while you are here

Two real defects in the existing admin code:

- **`GET /api/admin/risk-zones` clusters with `ROUND(lat, 2)`.** Grid cells
  change size with latitude, and a real cluster straddling a boundary splits in
  two. PostGIS already has the right tool — use `ST_ClusterDBSCAN`.
- **No pagination anywhere.** `overview` caps at `LIMIT 50/100` with no cursor,
  so past that the data is silently invisible. Every admin list needs paging.

---

## 4. Admin app scaffold

Same stack as `frontend/` — React 18 + Vite, plain JavaScript, Tailwind,
shadcn/ui, TanStack Query, Zustand. No TypeScript. One stack across the project
is worth more than picking a different tool here.

```
admin/
├── index.html
├── vite.config.js          port 5174, proxies /api → 4000
├── tailwind.config.js      admin token palette
├── jsconfig.json           @/* → ./src/*
├── package.json
└── src/
    ├── main.jsx
    ├── index.css           admin tokens — DIFFERENT accent from the user app
    ├── app/
    │   ├── router.jsx      lazy routes, admin shell
    │   ├── queryClient.js  admin query keys
    │   └── providers.jsx
    ├── components/
    │   ├── ui/             copied shadcn primitives
    │   ├── layout/         AdminShell, AdminSidebar, AdminTopbar
    │   └── common/         DataTable, FilterBar, Pagination, ConfirmDialog,
    │                       AuditTrail, EmptyState, ErrorState
    ├── features/
    │   ├── auth/           admin login (separate session)
    │   ├── dashboard/      queue depth, open SOS, overdue journeys
    │   ├── moderation/     the report queue — the main workspace
    │   ├── alerts/         publish / edit / expire
    │   ├── users/          search, roles, suspension
    │   ├── safety/         SOS + overdue journeys (audited)
    │   ├── data/           imports, demo purge, dataset coverage
    │   └── audit/          the log, searchable
    ├── hooks/
    ├── lib/                apiClient (admin session), format, risk
    └── stores/             adminAuthStore, uiStore
```

### Design direction

The user app is consumer-facing, dark by default, map-first. **The admin console
is a tool.** Different treatment:

- **Different accent colour.** The user app's primary is blue
  (`--primary: 217 91% 60%`). Pick something clearly distinct — a slate or
  indigo. An admin should know which app they are in from peripheral vision.
- **Density over comfort.** Compact tables, ~13px base, tabular numerals on
  every count. This screen is scanned, not read.
- **Persistent environment marker.** A strip naming the environment and the
  signed-in admin. On production, make it unmistakable.
- **State in form, not just colour.** A queue row's status reads as a chip and a
  severity stripe, so urgency survives a greyscale screenshot.
- **Destructive actions confirm and require a reason.** Rejecting a report and
  suspending a user both change what other people see.

---

## 5. Screens

### 5.1 Dashboard
Queue depth, open SOS count, overdue journeys, alerts expiring soon, imports
last run. Every tile links to its filtered list. Open SOS is the only thing
that should ever be visually loud here.

### 5.2 Moderation queue — the main screen
Filterable table: status, category, severity, date, reporter, distance from a
point. Row expands to description, photo, map position, nearby reports, the
reporter's history. Actions: verify, reject (reason required), corroborate,
bulk-select. Keyboard: `j`/`k` to move, `v` verify, `r` reject — a moderator
working a queue of 200 should not need the mouse.

Show the risk impact: verifying moves a report's weight from 0.4 to 1.0. The
moderator should see what their click does to the score.

### 5.3 Alerts
List with an active/expired split. Create with a map picker for centre and
radius, a required expiry, and a preview of how many route segments fall inside.
State plainly that publishing raises risk for every user in that radius.

### 5.4 Users
Search by email or name. Role change, suspension with reason and duration.
Counts of reports and journeys — **not** the journeys themselves. A moderator
does not need to see where someone travelled to judge whether their reports are
trustworthy.

### 5.5 Safety oversight
Open SOS list with an explicit "open case" action that audits the view. Overdue
journeys with last known position. Every panel here shows the audit trail for
that record inline, so an admin can see that their own access is recorded. That
visibility is the deterrent.

### 5.6 Data
What `db:status` shows, as a screen: which datasets are loaded, which risk
factors are active, which are dropped and why. Trigger an OSM import for a
bounding box. Purge demo data. Show demo-data state prominently — an admin
reading demo numbers as real is exactly the failure the provenance system exists
to prevent.

### 5.7 Audit log
Searchable by actor, action, target, date. Read-only, and visibly so.

---

## 6. Security requirements

Non-negotiable. If any of these is missing, the panel is not ready.

1. **Separate origin.** Admin on its own host in production, its own port in
   development.
2. **Separate session.** `scope: 'admin'` tokens, 8-hour expiry. A user-app
   token cannot reach an admin endpoint.
3. **Server-side authorisation on every route.** Hiding UI is not access
   control. Assume the admin bundle is public — because it is.
4. **Audit every mutation and every personal-data read.** No exceptions for
   reads: `sos.view` is the row that matters most.
5. **Reasons on destructive actions.** Rejection and suspension both require
   free text, stored in the audit row.
6. **No live tracking of arbitrary users.** SOS and overdue journeys only.
7. **`Cache-Control: no-store`** on admin responses; `X-Frame-Options: DENY`.
8. **Stricter rate limits** on admin login than user login.
9. **No secrets in the admin bundle.** Everything privileged stays server-side.
10. **Session ends visibly.** On 401 the admin app says the session expired and
    asks for re-login. It must not silently bounce to a login screen — an admin
    needs to know an action did not go through.

### Worth doing before production

- **2FA (TOTP) on admin accounts.** An admin account is a privileged account.
- **IP allowlist** on the admin host, if the team's addresses are stable.
- **Re-authentication** before role changes and suspensions.
- **Alerting** when an admin opens more than N SOS records in an hour.

---

## 7. Build order

Backend first, then the app. Each phase leaves the system working.

**Phase 1 — foundations (backend)**
`audit_log` table and service · `scope` on tokens ·
`POST /api/admin/auth/login` · `requireAdminSession` · split CORS · admin rate
limiters. Existing admin mutations move to the new middleware.

**Phase 2 — scaffold (admin app)**
Vite + Tailwind + copied UI primitives · admin tokens with the new accent ·
`AdminShell` · login · `DataTable`, `FilterBar`, `Pagination`.

**Phase 3 — moderation**
`GET/PATCH /api/admin/reports` with paging and mandatory reasons · the queue
screen with keyboard navigation. **This is the phase that earns the project —
ship it before anything else.**

**Phase 4 — alerts and users**
Alert CRUD with the map picker · user search, roles, suspension (schema change).

**Phase 5 — safety oversight**
SOS list and detail, audited · overdue journeys · inline audit trails.

**Phase 6 — data and audit**
Data status screen · OSM import trigger with job tracking · demo purge · audit
log browser.

**Phase 7 — hardening**
2FA · IP allowlist · re-auth on destructive actions · admin activity alerting ·
`ST_ClusterDBSCAN` for risk zones.

**Then remove the old surface.** Delete `frontend/src/features/admin/`, the
`adminOnly` nav entry in `app/routes.js`, the `paths.admin` route in
`app/router.jsx`, and the `useIsAdmin()` branches in
`features/alerts/pages/AlertsPage.jsx` and
`features/reports/pages/ReportsPage.jsx`. Verify with a production build that no
admin chunk remains. Until this step is done nothing has actually been
separated — there are just two admin panels.

---

## 8. Build prompt

To hand to an AI assistant, one phase at a time. Do not paste all seven phases
at once; each needs review before the next.

> Read `ADMIN_PANEL_SPEC.md` in the repository root, then implement **Phase N**
> only.
>
> Context: TrustRoute is a safety navigation platform. `backend/` is Node 20 +
> Express in plain JavaScript (ESM), PostgreSQL + PostGIS, zod validation,
> Socket.IO. `frontend/` is React 18 + Vite in plain JavaScript with Tailwind,
> shadcn/ui, TanStack Query and Zustand. **No TypeScript anywhere.** Read
> `backend/README.md` and `frontend/README.md` first — they document the
> conventions this code follows, and the admin app must follow the same ones.
>
> Requirements:
> - Match the existing code's structure and comment style. Comments explain
>   *why*, not *what*.
> - Every endpoint validates input with zod. Every query is parameterised.
> - Every admin mutation and every personal-data read writes an `audit_log` row.
> - Server-side authorisation on every admin route. Assume the admin bundle is
>   public.
> - Tests for anything with real logic, in the existing `node:test` style.
> - Do not touch `frontend/` until Phase 7's cleanup step.
>
> When you finish: list what you built, what you did not, and anything in the
> spec you disagree with and why. Do not report a phase complete until
> `npm test` passes and the app builds.

---

## 9. Effort

Rough, for one developer working with an assistant.

| Phase | Effort |
| --- | --- |
| 1 — backend foundations | 1–2 days |
| 2 — scaffold | 1 day |
| 3 — moderation | 2–3 days |
| 4 — alerts and users | 2 days |
| 5 — safety oversight | 2 days |
| 6 — data and audit | 1–2 days |
| 7 — hardening and cleanup | 2–3 days |

Phases 1–3 give a working, safer admin console. Everything after that is
breadth.

---

## 10. What to argue with

This spec makes calls worth challenging before building on them.

- **One backend, two frontends.** If admin traffic or the team ever needs a
  separate deployment cadence, a separate admin service starts making sense.
  Not at this size.
- **Copying UI components instead of a shared package.** Deliberate. Revisit if
  a third app appears, or if the same fix has to be applied in two places more
  than twice.
- **No live tracking for admins.** The strongest constraint here, and the one
  most likely to be argued with when someone wants a live operations map. The
  reason to hold it: a safety product that surveils its users has inverted its
  own purpose, and "we only look when needed" is not enforceable without a hard
  limit in code.
- **Mandatory rejection reasons.** Slower to moderate. Worth it — a rejection
  silently deletes a signal from everyone's risk score.
