# TrustRoute --- Project Blueprint

## 1. Project Overview

**Project Name:** TrustRoute

**Product:** AI-powered Personal Safety Navigation & Journey Protection
Platform

### Core idea

TrustRoute is a safety-first navigation platform that helps a user
choose a safer route instead of only the shortest or fastest route.

The product has three major stages:

1.  **Before the journey** → evaluate and recommend safer routes.
2.  **During the journey** → monitor the journey and detect
    safety-related problems.
3.  **Emergency** → provide an SOS and trusted-contact workflow.

### Simple example

A user wants to travel from Durg to Bhilai at 11 PM.

A normal navigation app may mainly optimize:

-   distance
-   travel time

TrustRoute evaluates:

-   historical crime data
-   recent incidents
-   community safety reports
-   alerts
-   time of day
-   nearby safety/emergency infrastructure
-   route-level risk

Example:

``` text
Route A → 20 min → Risk 72 🔴
Route B → 23 min → Risk 31 🟢  ← Recommended
Route C → 21 min → Risk 48 🟡
```

TrustRoute can explain why Route B is recommended instead of only
showing a number.

------------------------------------------------------------------------

# 2. Final Technology Stack

## Frontend

-   React
-   TypeScript
-   Vite
-   Tailwind CSS
-   Leaflet
-   PWA capabilities
-   Browser Geolocation API
-   Browser speech capabilities where supported

### Frontend responsibility

The frontend handles:

-   map and route UI
-   route comparison
-   safety heatmap
-   risk explanation
-   community reporting
-   journey tracking UI
-   live location UI
-   SOS interface
-   emergency contacts
-   settings
-   admin dashboard
-   responsive/mobile-first experience

------------------------------------------------------------------------

## Backend

-   Node.js
-   TypeScript
-   Express or Fastify
-   Socket.IO for real-time communication
-   JWT/session-based authentication
-   REST APIs

### Backend responsibility

The backend handles:

-   authentication and authorization
-   route/risk APIs
-   community reports
-   alerts
-   emergency contacts
-   journey sessions
-   live journey state
-   route deviation checks
-   SOS orchestration
-   data validation
-   rate limiting
-   privacy/security
-   admin APIs

------------------------------------------------------------------------

## Database

### PostgreSQL

Primary relational database.

### PostGIS

Spatial extension for location-based queries.

PostGIS will be used for:

-   nearby crime lookup
-   nearby community reports
-   nearby alerts
-   route segments
-   risk zones
-   emergency infrastructure
-   spatial distance queries
-   future spatial indexing

Example conceptual query:

``` text
Find all incidents within 500 meters
of this route segment.
```

------------------------------------------------------------------------

## Optional future infrastructure

These should NOT be mandatory for the first MVP:

-   Redis --- caching and high-scale real-time workloads
-   Python ML service --- if a real ML model is later trained
-   Docker --- containerized deployment
-   GitHub Actions --- CI
-   PostgreSQL/PostGIS production deployment
-   PWA service worker and offline capabilities

------------------------------------------------------------------------

# 3. Zero-Budget Principle

The project must be designed around a **₹0 development/MVP budget**.

We should not make the core product dependent on paid APIs.

### Use free/open-source/local components where practical

-   React → free/open source
-   TypeScript → free/open source
-   Vite → free/open source
-   Node.js → free/open source
-   PostgreSQL → free/open source
-   PostGIS → free/open source
-   Leaflet → free/open source
-   Docker → free/open source
-   Git/GitHub → free for the intended development workflow
-   Browser Geolocation → device/browser capability
-   Local database/data → no API cost
-   Own risk algorithm → no API cost

### Mapping/routing note

OpenStreetMap ecosystem services and public routing/geocoding services
can have usage policies and rate limits. They must not be treated as
unlimited commercial infrastructure.

The architecture must keep routing/geocoding behind service interfaces
so the provider can be replaced later.

### Emergency communication note

For the zero-budget MVP, do not make a paid SMS provider mandatory.

Use device-native capabilities where supported:

-   SMS/share intent
-   phone call
-   location sharing

The application should never falsely display "SOS sent" unless the
action has actually been confirmed.

------------------------------------------------------------------------

# 4. Main Product Modules

## Module 1 --- Safe Route Engine

This is the core feature.

### User flow

``` text
Enter origin
      ↓
Enter destination
      ↓
Generate route alternatives
      ↓
Analyze each route
      ↓
Calculate safety risk
      ↓
Compare routes
      ↓
Recommend safer route
```

Example:

``` text
Route A
20 min
Risk 72
High

Route B
23 min
Risk 31
Low
Recommended

Route C
21 min
Risk 48
Moderate
```

------------------------------------------------------------------------

# 5. Segment-Level Risk Engine

Routes must not be treated as one large average.

Each route will be divided into approximately 500-meter segments.

``` text
Route
 ↓
Segment 1
Segment 2
Segment 3
Segment 4
...
```

Each segment receives its own risk score.

### Segment inputs

-   historical crime data
-   recent incidents
-   community reports
-   safety alerts
-   time of day
-   severity
-   nearby emergency infrastructure
-   available location context

Example:

``` text
Route:

🟢 🟢 🟡 🔴 🟢 🟢

Segment 4 = high-risk segment
```

The system should expose the highest-risk segment instead of hiding it
inside an average.

------------------------------------------------------------------------

# 6. Explainable Risk

The system should not only say:

``` text
Risk = 70
```

It should explain:

``` text
Why is this route risky?

- 3 recent incidents nearby
- High historical incident density
- Night-time risk factor increased
- Multiple community safety reports
- Limited nearby emergency infrastructure
```

This gives the project an explainable-AI / decision-support angle.

------------------------------------------------------------------------

# 7. Risk Score

The exact weights should be documented and tuned using available data.

A possible initial scoring structure:

``` text
Historical crime       30%
Recent incidents       20%
Community reports      15%
Time-of-day factor     15%
Emergency access       10%
Location/isolation     10%
```

Normalize the final score to:

``` text
0–30    Low
31–55   Moderate
56–75   High
76–100  Critical
```

These thresholds are initial product rules, not claims about real-world
probability. They should be validated and documented.

Do NOT describe the score as "probability of crime."

Use terminology such as:

> Contextual route-risk score.

------------------------------------------------------------------------

# 8. Time-Aware Risk

The same location can have different contextual risk at different times.

Example:

``` text
2 PM  → Low
7 PM  → Moderate
11 PM → High
```

Time-related inputs can include:

-   hour
-   day of week
-   night/day
-   historical incident timing where available

------------------------------------------------------------------------

# 9. Safety Heatmap

Display safety information visually on the map.

``` text
🟢 Low
🟡 Moderate
🟠 High
🔴 Critical
```

Possible layers:

-   historical crime density
-   recent incidents
-   community reports
-   active safety alerts
-   high-risk zones

------------------------------------------------------------------------

# 10. Community Safety Reports

Users can report safety problems.

### Categories

-   Unsafe area
-   Poor lighting
-   Harassment
-   Suspicious activity
-   Crime
-   Road issue
-   Other

Example:

``` text
Location: XYZ Road
Category: Poor Lighting
Description: Road is very dark at night.
```

Reports are stored in PostgreSQL/PostGIS.

------------------------------------------------------------------------

# 11. Community Report Trust System

Do not blindly trust every user report.

Future/target mechanism:

``` text
New report
      ↓
Unverified
      ↓
Corroboration / moderation
      ↓
Verified or rejected
```

Potential inputs:

-   reporter reputation
-   report history
-   corroborating reports
-   community voting
-   moderation
-   location consistency
-   timestamp consistency

Example weighting:

``` text
New/unverified report → lower weight
Trusted community report → higher weight
Verified source → highest weight
```

------------------------------------------------------------------------

# 12. Dynamic Safety Risk

Risk should be able to change when new information appears.

Concept:

``` text
Historical Risk
+
Recent Community Reports
+
Current Alerts
+
Time Context
=
Current Contextual Risk
```

Example:

A normally safe road can become risky because of:

-   an incident
-   a road closure
-   a safety alert
-   unusual crowd/activity
-   multiple new reports

------------------------------------------------------------------------

# 13. Journey Guardian

This is the second major product pillar.

After selecting a route, the user can press:

``` text
🛡️ Start Safe Journey
```

The journey gets a session.

Example:

``` text
Destination: Home
ETA: 30 minutes
Status: Active
```

The system can monitor:

-   current location
-   planned route
-   ETA
-   route deviation
-   journey timeout
-   active safety alerts

------------------------------------------------------------------------

# 14. Live Location Sharing

A user can share a temporary journey with a trusted contact.

Example:

``` text
TrustRoute Journey

Current location
Destination
ETA
Journey status
Last update
```

The shared journey should expire after the journey or configured
retention period.

Privacy must be a first-class requirement.

------------------------------------------------------------------------

# 15. Route Deviation Detection

If the user's current GPS position moves significantly away from the
planned route:

``` text
⚠️ You appear to have deviated from your planned route.

Are you safe?

[ I'm Safe ]
[ Find Safer Route ]
[ SOS ]
```

This is a location-distance calculation and does not require a paid API.

------------------------------------------------------------------------

# 16. Journey Overdue / Dead-Man Switch

User starts a journey with an ETA.

Example:

``` text
ETA = 30 minutes
```

After the expected arrival time:

``` text
⚠️ Journey overdue

Are you safe?

[ I'm Safe ]
[ I Need Help ]
[ SOS ]
```

If the user does not respond within a configured window, notify trusted
contacts according to the user's settings.

------------------------------------------------------------------------

# 17. Intelligent SOS

SOS should be an emergency workflow, not only a button.

Concept:

``` text
SOS
 ↓
Get current location
 ↓
Get active journey
 ↓
Prepare emergency information
 ↓
Notify/assist trusted contacts
 ↓
Provide emergency call/SMS/share options
 ↓
Record emergency event
```

For the zero-budget MVP, use device-native communication capabilities
instead of requiring a paid SMS provider.

Never show a false "sent successfully" status.

------------------------------------------------------------------------

# 18. Offline Safety / Offline SOS

The application should not assume that internet connectivity always
exists.

Use browser capabilities such as:

-   Service Worker
-   IndexedDB

Concept:

``` text
SOS
 ↓
Internet available?
 ├─ YES → process
 └─ NO  → store emergency state locally
                    ↓
              network returns
                    ↓
                 retry
```

Offline behavior must be clearly documented because some browser/device
capabilities have platform limitations.

------------------------------------------------------------------------

# 19. Voice Safety

Optional safety feature.

User explicitly enables:

``` text
🎙️ Voice Safety
```

Supported keywords can include:

-   Help
-   Help me
-   Bachao
-   Madad

Potential language settings:

-   en-IN
-   hi-IN

Important:

-   Do not silently activate the microphone.
-   Ask for explicit user consent.
-   Stop listening when the user disables the feature.
-   Provide a clear privacy indicator.
-   Treat browser speech support as capability-dependent.

------------------------------------------------------------------------

# 20. Fake Call

A simple safety utility.

User selects:

``` text
Fake Call
```

After a configurable delay:

``` text
Incoming Call

Mom
```

This is a UI/device feature and does not require a paid API.

------------------------------------------------------------------------

# 21. Emergency Infrastructure

Maintain a local/open dataset of useful nearby infrastructure where
available:

-   police stations
-   hospitals
-   railway stations
-   petrol pumps
-   public places
-   other relevant emergency/safety points

The risk engine can consider proximity to emergency infrastructure.

------------------------------------------------------------------------

# 22. AI Assistant

The AI layer should be useful, not just a generic chatbot.

Example user question:

> "I need to travel at 11 PM. Which route should I take?"

Possible response:

> "Route B is recommended. It is about 3 minutes longer but has lower
> contextual risk and avoids a high-risk segment with recent incidents."

The AI should explain decisions based on actual TrustRoute data.

Do not claim that the AI can predict crime with certainty.

------------------------------------------------------------------------

# 23. Optional Real ML

ML is a later phase.

Possible model:

-   Random Forest
-   XGBoost

Potential features:

-   crime density
-   recent incident count
-   hour
-   day of week
-   severity
-   community report density
-   POI density
-   emergency infrastructure proximity
-   historical recency

Required evaluation:

-   Precision
-   Recall
-   F1
-   AUC
-   Confusion matrix

Also create a model card describing:

-   training data
-   limitations
-   bias
-   intended use
-   non-intended use

### Important

Do not claim "ML implemented" until a real model is trained, evaluated
and integrated.

If ML becomes substantial, Python can be introduced as a separate ML
service while Node.js remains the main application backend.

------------------------------------------------------------------------

# 24. Authentication & Security

Required before calling the system production-ready.

Implement:

-   JWT or secure session authentication
-   password hashing
-   user-scoped data
-   restricted CORS
-   rate limiting
-   input validation
-   coordinate validation
-   secure uploads
-   UUID/random filenames
-   private sensitive files
-   environment-based secrets
-   production debug disabled
-   proper error handling
-   logging

### Sensitive data

Treat these as sensitive:

-   live location
-   journey history
-   emergency contacts
-   incident photos
-   SOS events

Do not expose them publicly.

------------------------------------------------------------------------

# 25. Privacy

Add privacy controls such as:

-   live location sharing on/off
-   journey sharing controls
-   journey history controls
-   emergency contact management
-   report/photo management
-   data deletion
-   temporary share links
-   retention policies

The product should follow privacy-by-design principles.

------------------------------------------------------------------------

# 26. Admin Dashboard

Admin should be able to see:

``` text
Today's reports
Active journeys
SOS events
High-risk zones
Pending community reports
Verified reports
```

Map can display:

-   reports
-   alerts
-   risk zones
-   active safety events

Admin functions should be protected by authorization.

------------------------------------------------------------------------

# 27. Notifications

Possible notification types:

-   high-risk route warning
-   route deviation
-   journey overdue
-   safety-zone entry
-   new local alert
-   trusted-contact notification
-   SOS state changes

For MVP, implement only the notifications that can be supported reliably
without paid infrastructure.

------------------------------------------------------------------------

# 28. PWA

The frontend should eventually become installable as a Progressive Web
App.

Potential capabilities:

-   installable web app
-   cached application shell
-   offline state
-   service worker
-   push notifications where supported
-   offline safety workflows

------------------------------------------------------------------------

# 29. Architecture

Target architecture:

``` text
                         TRUSTROUTE
                              |
                        React + Vite
                         TypeScript
                              |
                         Node.js API
                         TypeScript
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
        Risk Engine      Journey Engine    Emergency
              |               |               |
              +---------------+---------------+
                              |
                     PostgreSQL + PostGIS
                              |
                  +-----------+-----------+
                  |                       |
             Optional Redis         Optional ML
                                   Python Service
```

### First version

Do NOT over-engineer.

Start with:

``` text
React + Vite + TypeScript
          +
Node.js + TypeScript
          +
PostgreSQL + PostGIS
```

Add Redis, Python ML, queues and other infrastructure only when
required.

------------------------------------------------------------------------

# 30. Suggested Backend Structure

``` text
backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   │   ├── risk/
│   │   ├── journey/
│   │   ├── routing/
│   │   ├── emergency/
│   │   └── notifications/
│   ├── models/
│   ├── middleware/
│   ├── utils/
│   ├── websocket/
│   └── app.ts
├── tests/
├── package.json
└── tsconfig.json
```

------------------------------------------------------------------------

# 31. Suggested Frontend Structure

``` text
frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── features/
│   │   ├── map/
│   │   ├── routing/
│   │   ├── risk/
│   │   ├── journey/
│   │   ├── reports/
│   │   ├── emergency/
│   │   └── admin/
│   ├── hooks/
│   ├── services/
│   ├── stores/
│   ├── types/
│   └── main.tsx
├── public/
└── package.json
```

------------------------------------------------------------------------

# 32. Database Core Entities

Initial entities:

``` text
User
EmergencyContact
CrimeIncident
CommunityReport
SafetyAlert
Route
RouteSegment
Journey
JourneyLocation
SOSIncident
SafetyZone
EmergencyLocation
```

Potential future entities:

``` text
ReportVerification
UserReputation
Notification
MLPrediction
AuditLog
```

------------------------------------------------------------------------

# 33. API Areas

### Authentication

``` text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
```

### Routing

``` text
POST /api/routes
POST /api/routes/score
GET  /api/routes/:id
```

### Reports

``` text
POST /api/reports
GET  /api/reports
GET  /api/reports/nearby
```

### Alerts

``` text
POST /api/alerts
GET  /api/alerts
DELETE /api/alerts/:id
```

### Journey

``` text
POST /api/journeys
GET  /api/journeys/:id
POST /api/journeys/:id/location
POST /api/journeys/:id/safe
POST /api/journeys/:id/sos
POST /api/journeys/:id/end
```

### Emergency

``` text
GET  /api/emergency/contacts
POST /api/emergency/contacts
DELETE /api/emergency/contacts/:id
POST /api/emergency/sos
```

Exact API design can evolve during implementation.

------------------------------------------------------------------------

# 34. Testing

Use automated tests from the beginning.

Important tests:

-   risk score calculation
-   segment risk
-   route ranking
-   coordinate validation
-   report creation
-   authentication
-   authorization
-   SOS workflow
-   journey deviation
-   ETA/overdue logic
-   upload validation
-   API contracts

Target:

``` text
15–20+ meaningful tests initially
```

Then increase coverage as features grow.

------------------------------------------------------------------------

# 35. Development Roadmap

## Phase 1 --- Foundation

-   React + Vite + TypeScript
-   Node + TypeScript
-   PostgreSQL + PostGIS
-   authentication
-   database schema
-   basic map
-   routing integration
-   clean Git setup
-   environment configuration
-   README

## Phase 2 --- Core Safety Engine

-   crime data import
-   PostGIS spatial queries
-   500m route segmentation
-   segment risk
-   route comparison
-   contextual risk score
-   risk explanation
-   heatmap

## Phase 3 --- Community Safety

-   community reports
-   report categories
-   moderation
-   report trust/reputation
-   alerts
-   dynamic risk updates

## Phase 4 --- Journey Guardian

-   start journey
-   live GPS
-   live journey state
-   route deviation
-   ETA
-   overdue journey
-   trusted contact sharing

## Phase 5 --- Emergency

-   SOS
-   native call/SMS/share workflow
-   emergency contacts
-   offline emergency state
-   safety notifications
-   privacy controls

## Phase 6 --- Product Polish

-   PWA
-   voice safety
-   fake call
-   admin dashboard
-   analytics
-   accessibility
-   mobile-first UX

## Phase 7 --- Advanced Intelligence

-   real ML model
-   model evaluation
-   model card
-   optional Python ML service
-   personalized risk
-   advanced prediction/recommendation

## Phase 8 --- Production Engineering

-   Docker
-   CI/CD
-   logging
-   monitoring
-   rate limiting
-   caching
-   optional Redis
-   deployment

------------------------------------------------------------------------

# 36. What NOT to Build Initially

Do not try to build everything at once.

Avoid making these MVP blockers:

-   paid AI APIs
-   paid map SDKs
-   paid SMS services
-   complex microservices
-   Kubernetes
-   Redis before it is needed
-   ML before good data exists
-   fake "AI prediction" without evaluation
-   production-scale infrastructure before the core product works

------------------------------------------------------------------------

# 37. MVP --- What Must Be Working

The first strong demo should have these:

### 1. Safe route comparison

``` text
Route A → Risk 70
Route B → Risk 30 → Recommended
Route C → Risk 50
```

### 2. Segment-level risk

``` text
🟢 🟢 🟡 🔴 🟢
```

### 3. Explainable risk

``` text
Why risky?
- recent incidents
- community reports
- night factor
```

### 4. Community reporting

User can submit an unsafe-area report.

### 5. Journey Guardian

``` text
Start Journey
→ GPS tracking
→ route deviation
→ ETA
→ overdue check
```

### 6. SOS

``` text
SOS
→ current location
→ emergency information
→ native communication options
```

These six features form the coherent product story:

``` text
Choose a safer route
        ↓
Understand the risk
        ↓
Start the journey
        ↓
Stay protected
        ↓
Get help if needed
```

------------------------------------------------------------------------

# 38. Product Positioning

Do NOT pitch TrustRoute as:

> "A women safety website."

Pitch it as:

> **"A privacy-first personal safety navigation and journey protection
> platform."**

### One-line pitch

> **TrustRoute helps users choose safer routes, understand contextual
> risk, stay protected during their journey, and quickly activate
> emergency assistance when needed.**

### Short pitch

> Traditional navigation focuses on getting users to a destination
> efficiently. TrustRoute adds a safety intelligence layer that
> evaluates route risk using spatial data, incidents, community reports,
> alerts and time context. After route selection, Journey Guardian
> monitors the trip for deviations and overdue journeys and provides an
> emergency workflow when required.

------------------------------------------------------------------------

# 39. Key Differentiators

## 1. Safety over shortest path

``` text
Fastest route ≠ safest route
```

## 2. Explainable risk

``` text
Not just "Risk 72"
but "Why Risk 72?"
```

## 3. Segment-level intelligence

``` text
Whole route average
        ↓
500m local risk segments
```

## 4. Continuous protection

``` text
Before journey
+
During journey
+
Emergency
```

## 5. Community intelligence

Local reports can affect current contextual risk.

## 6. Privacy-first design

Location and emergency data are treated as sensitive.

## 7. Zero-budget architecture

Core product does not require paid APIs.

------------------------------------------------------------------------

# 40. Final Project Goal

The goal is to evolve the existing TrustRoute prototype into:

``` text
                 TRUSTROUTE
                     |
          PERSONAL SAFETY LAYER
                     |
       +-------------+-------------+
       |             |             |
       v             v             v
   SAFE ROUTE   JOURNEY GUARD    EMERGENCY
       |             |             |
       v             v             v
  Risk Engine     Live GPS       SOS
  Heatmap         ETA            Contacts
  Explanation     Deviation     Offline State
  Reports         Overdue       Call/SMS/Share
       |             |             |
       +-------------+-------------+
                     |
               SAFETY PLATFORM
```

## Final technology decision

``` text
Frontend:
React + Vite + TypeScript

Backend:
Node.js + TypeScript

Database:
PostgreSQL + PostGIS

Real-time:
Socket.IO

Maps:
Leaflet + open/public map ecosystem where permitted

State/API:
React-side state/query solution as appropriate

Optional later:
Redis
Python ML service
Docker
GitHub Actions
PWA
```

## Core principle

**Build the safety intelligence ourselves.**

Third-party services should provide infrastructure such as map/routing
data where necessary; the actual TrustRoute value should come from our:

-   risk engine
-   route segmentation
-   contextual scoring
-   explainability
-   journey monitoring
-   community intelligence
-   emergency workflow

That is what turns TrustRoute from a simple map project into a proper
product.
