# RAIL RAKSHAK

**AI-Powered Automatic Block Planning to Maximize Asset Availability on Indian Railways**
Smart India Hackathon 2026 · Problem Statement #26027 · Ministry of Railways · Transportation & Logistics

RAIL RAKSHAK replaces the decentralized, manual BDMS block-planning process with a data-driven,
coordinated system: it ingests defects from TMS/TDMS/SMMS, predicts failure risk with a **trained**
model, runs an **urgency engine** over permit-to-work deadlines, tracks every defect through a
server-enforced **11-stage lifecycle**, bundles Engineering + Traction + S&T into single-occupancy
**super-blocks**, and re-plans live when the day goes wrong.

---

## Quick start

```bash
cp .env.example .env          # DATABASE_URL (see Environment below)
npm install

npm run db:dev                # terminal 1 — embedded PostgreSQL 18 on :5433 (no Docker, no install)
npm run db:push               # terminal 2 — create/refresh tables from src/db/schema.ts
npm run dev                   #          — start the app
```

Open `http://localhost:3000` → sign in at `/login`, or open the two **login-free** surfaces:
`/patrol` (Rakshak Patrol handset) and `/trains` (Citizen Train View). The Delhi-NCR grid, defects,
trains and workflow jobs **auto-seed on first request** (idempotent).

**Demo credentials** (prototype authentication, see *What's real vs. simulated*):

| Door | Credentials | Lands on |
| --- | --- | --- |
| Officer | `drm01` / `demo123` | DRM desk (`/command`, `/planner`, `/compare`, `/replan`) |
| Officer | `coa01` / `demo123` | Control room (`/command`, `/simulation`) |
| Officer | `sm01` / `demo123` | Station Master desk (`/station`) |
| Officer | `ins01` / `demo123` | Section Inspector (`/defects`, `/field`, `/jobs`) |
| Field worker | mobile `9811000101/02/03` + DOB `1988-04-12` / `1990-08-25` / `1985-11-30` | Karmi job portal (`/jobs`) |

The role is **derived from the account**, never chosen: a station master cannot click into the DRM
desk, and `RoleGate` blocks any route outside the session's allow-list.

## Test suites

All suites drive a **running** server (start it first) and print `N passed, M failed`:

```bash
npm test                                        # runs all six, in order
node scripts/verify.mjs      http://localhost:3000   # 15 — core invariants + integration contract
node scripts/lifecycle-test.mjs                      # 64 — 11-stage lifecycle, server-enforced graph, audit trail
node scripts/superblock-test.mjs                     # 65 — coordinated vs independent downtime, feasibility maths
node scripts/urgency-test.mjs                        # 34 — classification bands, boost maths, summary consistency
node scripts/auth-test.mjs                           # 92 — two doors, role derivation, route permission matrix
node scripts/patrol-test.mjs                         # 51 — login-free handset, intake contract, recurrence, duplicates
```

321 checks total, all currently passing.

## Roles & pages

| Role | Entry | What they see |
| --- | --- | --- |
| DRM / Admin | `/command`, `/planner` | health index, trust index, financials, plan approval, reasoned human veto, strategy comparison |
| Control Room (COA) | `/command`, `/simulation` | NTES live board, what-if cascade lab, overrun pre-emption, draggable Gantt, Final-Boss 60 s crisis |
| Section Inspector | `/field`, `/defects` | patroller inbox, crew allotment (AI-recommended), before/after sign-off, and the full defect lifecycle board with audit trail |
| Station Master | `/station` | station-centred view: sections, today's blocks, defects near the station, crews, quick actions |
| Maintenance Karmi | `/jobs` | GenAI job permits, GPS proximity gate, before/after photo capture, offline queue, auto-escalation |
| Track Patroller | `/patrol` | login-free handset: category tiles, GPS lock, photo, severity — creates a report at stage REPORTED |
| Citizen / Passenger | `/trains` | public Citizen Train View — search a train, see journey progress and how planned maintenance may affect the trip. Clearly labelled Prototype Data; no internal controls exposed |

**New in this build:** `/defects` (lifecycle board + detail with audit trail), `/station`,
`/superblocks` (queue opportunities + split-block waste), `/compare` (safety-first vs traffic-first
vs balanced over the live queue), `/replan` (6 live events, frozen committed blocks, plan lineage).

## Architecture

```
TMS · TDMS · SMMS · COA · FOIS · IMD          (contracts: src/lib/integrations/contracts.ts)
        └─ federated data lake (PostgreSQL via Drizzle ORM)
                 │
   ml.ts          → logistic-regression risk model (batch GD, L2, 700 epochs,
                    fitted in-process on 2,400 labeled work-order outcomes,
                    80/20 holdout accuracy/AUC computed at runtime)
   scoring.ts     → single source of truth for riskFor()/scoreDefect() criticality
   urgency.ts     → urgency classes (EMERGENCY → NORMAL), 0–100 urgency index,
                    0.70–1.30 sort boost, final priority = 35% criticality · 30% urgency ·
                    20% ML risk · 15% availability (every term reported in the UI)
   defectlifecycle.ts → 11 stages REPORTED → … → CLOSED, TRANSITIONS adjacency enforced
                    server-side, DEF-<SECTION>-<YEAR>-<SEQ> ids, defect_events audit trail,
                    rule-based recurrence (≥4 similar in 180 d ⇒ HIGH), detailed inspection,
                    long-term maintenance, and planner/job auto-advance hooks
   superblock.ts  → coordinated vs independent downtime (packWaves), 5-factor feasibility
                    with computed rejection reasons, split-block waste detection
   optimizer.ts   → wave-packing (parallel multi-dept crews) + EXACT constraint placement
                    (exhaustive window search minimizing delay cost) + 500-run Monte Carlo,
                    now ordered by criticality × urgency boost and writing a rationale per block
   replan.ts      → TRAIN_DELAY · OVERRUN · NEW_DEFECT · OHE_FAILURE · FREIGHT_SURGE ·
                    BLOCK_CANCELLED — frozen in-progress blocks, plan lineage (supersedesId,
                    triggerNote, diff), no silent rewriting of committed work
   alternatives.ts→ balanced / safety-first / traffic-first strategies + custom weights
   quality.ts     → Plan Quality Score (6 weighted sub-metrics, weights redistributed when
                    a metric is unmeasurable) · availability.ts → Asset Availability KPI
   simulate.ts    → cascade what-if engine, consensus votes, safety work orders, crisis resolver
   livetrains.ts  → real train roster kinematics on real track polylines
   jobs.ts        → 5-step workflow + GPS haversine fraud checks + escalation + lifecycle hooks
   fieldreport.ts → Rakshak Patrol intake (category catalogue shared with the handset)
```

Real-world data: 19 real stations (true lat/lng), 23 real sections with waypoint alignments,
the real Yamuna course, and 24 real trains (12951/52 Mumbai Rajdhani, 12301/02 Howrah Rajdhani,
22439 Vande Bharat, Namo Bharat RRTS, DFC super-heavies…) running real schedules.

## What's real vs. simulated (read this before judging)

**Genuinely implemented**

- Trained statistical model for 72-h failure probability — not a hardcoded lookup; the
  logistic-regression weights are fitted at runtime with gradient descent and reported
  with computed holdout accuracy. (It trains on synthetic-but-principled labeled data,
  since real IR failure logs aren't public — stated honestly on the model card.)
- The **defect lifecycle** is enforced in the API, not the UI: illegal jumps (e.g. REPORTED →
  CLOSED) are refused with a reason, every accepted move is written to `defect_events`, and the
  planner/job hooks advance stages as work actually happens.
- **Recurrence detection is rule-based and labelled as such** (count of similar defects on the same
  asset inside a 180-day window; ≥4 ⇒ HIGH band). No ML is claimed where a threshold does the job.
- The **urgency engine** is deterministic and fully exposed: classification bands, the 0–100 index
  and the 0.70–1.30 boost are pure functions of `dueInDays`, severity and recurrence, and the
  four-term priority blend is shown term-by-term in the UI.
- **Super-block maths** is computed, not asserted: independent downtime = Σ(task + 40 min setup),
  coordinated = packed waves + 15 min + 8 min × (waves − 1), and every rejected bundle carries the
  reason it was rejected (window cap breached, dense corridor, minimum interval, single discipline).
  The five feasibility weights (window 25 · traffic 25 · safety 20 · resources 15 · recency 15) are
  published in the UI — they are engineering judgement, not learned parameters, and are labelled so.
- **Dynamic re-planning** preserves committed work: blocks with a crew on site are frozen, the new
  plan records the event that triggered it, what changed (added/removed/moved/frozen) and its
  parent plan id — the lineage is inspectable in `/replan`.
- Exact constraint-based solver pass over the window-placement subproblem (exhaustive
  objective evaluation with hard constraints). We deliberately did **not** bind OR-Tools/
  CP-SAT: its native binaries are fragile on demo machines, and the exact search over
  this instance size (≤26 blocks × window grid) is provably optimal for the same
  objective — same guarantee, zero install risk at the booth.
- Monte Carlo stress distribution (500 samples, real histogram persisted & rendered).
- Cross-department consensus votes — computed live from real TMS/TDMS/SMMS section
  data (severity + health-drag, deterministic). We label it a heuristic vote, not
  "federated learning": there is no FedAvg and we no longer claim one.
- Haversine GPS fraud checks, escalation timers, exact train-kinematics positioning,
  exact delay-cost model shared by optimizer / resize API / what-if lab.
- The entire 5-step workflow with cross-dashboard state (start work → section red,
  sign-off → section green).

**Simulated by design (demo datasets, swappable transports)**

- External feeds (TMS/TDMS/SMMS/COA/FOIS/IMD) are served from the seeded data lake via
  documented contracts (`src/lib/integrations/contracts.ts`) — `GET /api/ingest?system=TMS`
  executes a contract-shaped ingestion cycle. Point the adapters at real endpoints to go live.
- Train delays, federated consensus votes and Monte Carlo perturbations use seeded RNG
  (deterministic demos). The *models wrapped around them* are real code.
- LLM-style documents (work orders, job permits) are template-generated with rule citations,
  presented without claiming a hosted LLM dependency.
- Webhooks to NTES/SIMRAN shown in the UI are clearly labeled example payloads — no live
  government endpoints are contacted.
- Sign-in is a **prototype**: credentials live in `src/lib/auth.ts` and the session is kept in
  `localStorage`; production design is divisional IAM/LDAP with a signed httpOnly session cookie and
  the same `ROLE_ROUTES` allow-list enforced in middleware. The two-door split (officer vs field
  worker) and role-derived landing pages are real behaviour, not mock-ups.
- English/Hindi strings exist for the navigation and the pre-existing surfaces; the newest panels
  (lifecycle detail, super-block factors, re-plan diff) are English-only in this build.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection (Drizzle + drizzle-kit push). `npm run db:dev` boots an embedded PostgreSQL 18 cluster on `127.0.0.1:5433` with no system install |

Local database scripts: `npm run db:dev` (start), `npm run db:push` (apply schema),
`npm run db:generate` / `npm run db:migrate` (versioned SQL migrations via drizzle-kit).

## API map (selected)

`GET /api/state` · `GET /api/defects` (board + roll-up + urgency queue) · `GET /api/defects/<id>`
(lifecycle detail + audit trail) · `POST /api/defects/<id>/transition {advance|inspect|long-term}`
· `GET|POST /api/defects/report` (patrol intake) · `GET /api/urgency` · `GET /api/superblocks`
· `GET|POST /api/alternatives` · `GET|POST /api/replan` · `POST /api/auth/login {mode, …}`
· `GET /api/jobs` · `POST /api/optimize {horizon: ROLLING|WEEKLY|MONTHLY}`
· `POST /api/whatif` · `POST /api/consensus` · `POST /api/safety-order` · `POST /api/crisis`
· `POST /api/jobs/{report,allot,start,complete,review,extend}` · `PATCH /api/blocks` (drag-resize)
· `POST /api/mode` (fog/VIP/DTP) · `POST /api/veto` · `GET /api/ingest?system=…`
· `GET /api/trains?q=…` (citizen search) · `GET /api/trains/<number>` (citizen journey + maintenance impact)

## Performance & reliability notes

- Dashboards poll with **change detection** (signature compare) — zero re-render when idle.
- Session, theme, language and the header clock are read through `useSyncExternalStore`, so there is
  no setState-in-effect cascading render and SSR/hydration stay deterministic (`npm run lint` clean).
- The SVG rail grid is memoized; heavy fog blur reduced for GPU repaint cost.
- Every async action has busy/disabled guards; every field photo has an error fallback.
- Self-healing seed: wiping the DB re-seeds automatically on next request.

## Report structure

- `src/db/schema.ts` — stations, sections, assets, defects, defect_events, plans, block items, jobs, events, settings
- `src/lib/engine/` — ml, scoring, urgency, defectlifecycle, lifecycleStages, superblock, replan,
  alternatives, quality, availability, fieldreport, optimizer, simulate, livetrains, jobs, state, seed, network, types, citizen
- `src/lib/auth.ts` + `src/components/RoleGate.tsx` — prototype two-door authentication, role-derived
  landing pages and route protection
- `src/components/` — map, feeds, boards, modals, role dashboards, lifecycle board/detail,
  urgency queue/summary, super-block panel, re-plan panel, plan compare/quality, block explainer
- `scripts/*.test.mjs` — executable suites (lifecycle, superblock, urgency, auth, patrol) + `verify.mjs`
