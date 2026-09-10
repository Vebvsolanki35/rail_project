# RAIL RAKSHAK

**AI-Powered Automatic Block Planning to Maximize Asset Availability on Indian Railways**
Smart India Hackathon 2026 · Problem Statement #26027 · Ministry of Railways · Transportation & Logistics

RAIL RAKSHAK replaces the decentralized, manual BDMS block-planning process with a data-driven,
coordinated system: it ingests defects from TMS/TDMS/SMMS, predicts failure risk with a **trained**
model, bundles Engineering + Traction + S&T into single-occupancy **super-blocks**, and runs the
whole 5-step field workflow from patroller photo to inspector sign-off and block release.

---

## Quick start

```bash
cp .env.example .env        # set DATABASE_URL
npm install
npx drizzle-kit push        # create tables
npm run build && npm start  # or: npm run dev
```

Open `http://localhost:3000` → sign in via `/login` (4 demo roles). The Delhi-NCR grid,
defects, trains and workflow jobs **auto-seed on first request** (idempotent).

Verify a running deployment end-to-end:

```bash
node scripts/verify.mjs http://localhost:3000   # 15 invariant checks against live APIs
```

## Roles & pages

| Role | Entry | What they see |
| --- | --- | --- |
| DRM / Admin | `/command`, `/planner` | health index, trust index, financials, plan approval, reasoned human veto |
| Control Room (COA) | `/command`, `/simulation` | NTES live board, what-if cascade lab, overrun pre-emption, draggable Gantt, Final-Boss 60 s crisis |
| Section Inspector | `/field` | beat-focused map, patroller inbox, crew allotment (AI-recommended), before/after sign-off with fraud checks |
| Maintenance Karmi | `/jobs` | GenAI job permits, GPS proximity gate, before/after photo capture, offline queue, auto-escalation |
| Track Patroller | `/patrol` | phone-framed defect reporting with GPS lock (feeds Step 0) |
| Citizen / Passenger | `/trains` | public Citizen Train View — search a train, see journey progress, route timeline and how planned maintenance may affect the trip (GREEN/YELLOW/RED). Clearly labelled Prototype Data; no internal controls exposed |

## Architecture

```
TMS · TDMS · SMMS · COA · FOIS · IMD          (contracts: src/lib/integrations/contracts.ts)
        └─ federated data lake (PostgreSQL via Drizzle ORM)
                 │
   ml.ts        → logistic-regression risk model (batch GD, L2, 700 epochs,
                 fitted in-process on 2,400 labeled work-order outcomes,
                 80/20 holdout accuracy/AUC computed at runtime — see model card
                 on the Planner page)
   optimizer.ts → wave-packing (parallel multi-dept crews) + EXACT constraint
                 placement (exhaustive window search minimizing delay cost,
                 crew-capacity + single-occupancy constraints) + 500-run Monte
                 Carlo resilience simulation (histogram persisted per plan)
   simulate.ts  → cascade what-if engine (named-train arrivals + ambient flow,
                 ₹ cost model, red-zone LC logic), federated consensus votes,
                 GenAI-style safety work orders, Final-Boss multi-crisis resolver
   livetrains.ts→ real train roster kinematics on real track polylines
   jobs.ts      → 5-step workflow + GPS haversine fraud checks + escalation
                 levels (T+15/T+30/T+60) + DRM override
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
- Role sign-in is a **demo stub** (localStorage). Production design: SSO via CRIS/Parivartan
  with signed JWT + route-level RBAC middleware.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection (Drizzle + drizzle-kit push) |

## API map (selected)

`GET /api/state` · `GET /api/defects` · `GET /api/jobs` · `POST /api/optimize {horizon: ROLLING|WEEKLY|MONTHLY}`
· `POST /api/whatif` · `POST /api/consensus` · `POST /api/safety-order` · `POST /api/crisis`
· `POST /api/jobs/{report,allot,start,complete,review,extend}` · `PATCH /api/blocks` (drag-resize)
· `POST /api/mode` (fog/VIP/DTP) · `POST /api/veto` · `GET /api/ingest?system=…`
· `GET /api/trains?q=…` (citizen search) · `GET /api/trains/<number>` (citizen journey + maintenance impact)

## Performance & reliability notes

- Dashboards poll with **change detection** (signature compare) — zero re-render when idle.
- The SVG rail grid is memoized; heavy fog blur reduced for GPU repaint cost.
- Every async action has busy/disabled guards; every field photo has an error fallback.
- Self-healing seed: wiping the DB re-seeds automatically on next request.

## Report structure

- `src/db/schema.ts` — stations, sections, assets, defects, plans, block items, jobs, events, settings
- `src/lib/engine/` — ml, optimizer, simulate, livetrains, jobs, state, seed, network, types
- `src/components/` — map, feeds, boards, modals, role dashboards
- `scripts/verify.mjs` — executable invariant checks (run against any deployed URL)
