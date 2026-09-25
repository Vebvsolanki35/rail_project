import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  real,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Stations on the REAL Delhi NCR grid — true lat/lng + projected map coords. */
export const stations = pgTable("stations", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("junction"), // terminal | junction | rapidx | halt
  x: real("x").notNull(),
  y: real("y").notNull(),
  lat: real("lat").notNull().default(0),
  lng: real("lng").notNull().default(0),
  dailyTrains: integer("daily_trains").notNull().default(0),
  vipZone: boolean("vip_zone").notNull().default(false),
});

/** Track segments / block sections between stations. */
export const segments = pgTable("segments", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  fromCode: text("from_code").notNull(),
  toCode: text("to_code").notNull(),
  corridor: text("corridor").notNull(), // DEL-HWH | DEL-BCT | DEL-KLK | RING | RRTS | DFC
  lengthKm: real("length_km").notNull(),
  isBridge: boolean("is_bridge").notNull().default(false),
  isLevelCrossing: boolean("is_level_crossing").notNull().default(false),
  dailyTrains: integer("daily_trains").notNull().default(50),
  criticality: integer("criticality").notNull().default(5), // 1..10
  maxSpeed: integer("max_speed").notNull().default(110),
});

/** Fixed assets (track, OHE, signalling) monitored by TMS / TDMS / SMMS. */
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id")
    .notNull()
    .references(() => segments.id),
  department: text("department").notNull(), // ENG | TRD | SNT
  assetType: text("asset_type").notNull(),
  label: text("label").notNull(),
  health: real("health").notNull().default(80), // 0..100
  sourceSystem: text("source_system").notNull(), // TMS | TDMS | SMMS | ITMS | RDPMS | REMMLOT
}, (t) => [
    index("assets_segment_idx").on(t.segmentId),
    index("assets_dept_idx").on(t.department),
    index("assets_type_idx").on(t.assetType),
  ],
);

/** Defects / overdue maintenance tasks flowing in from TMS, SMMS, TDMS. */
export const defects = pgTable("defects", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id),
  department: text("department").notNull(), // ENG | TRD | SNT
  sourceSystem: text("source_system").notNull(),
  title: text("title").notNull(),
  severity: integer("severity").notNull(), // 1..10
  overdueDays: integer("overdue_days").notNull().default(0),
  durationMin: integer("duration_min").notNull(),
  needsLineBlock: boolean("needs_line_block").notNull().default(true),
  needsPowerBlock: boolean("needs_power_block").notNull().default(false),
  inspectionMode: text("inspection_mode").notNull().default("physical"), // physical | remote | either
  failureProb72h: real("failure_prob_72h").notNull().default(0.1),
  status: text("status").notNull().default("open"), // open | scheduled | closed
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  /* ---- Smart Defect Lifecycle (PS #26027) ---- */
  defectCode: text("defect_code").notNull().default(""), // DEF-<SECTION>-<YEAR>-<SEQ> — stable human reference
  lifecycleStatus: text("lifecycle_status").notNull().default("REPORTED"), // REPORTED … CLOSED (see engine/lifecycleStages.ts)
  priority: text("priority").notNull().default("MEDIUM"), // CRITICAL | HIGH | MEDIUM | LOW
  detailedInspection: boolean("detailed_inspection").notNull().default(false),
  dueInDays: integer("due_in_days").notNull().default(7), // negative = overdue; drives the urgency engine
  recurrenceBand: text("recurrence_band").notNull().default("NONE"), // rule-based, NOT ML: NONE | LOW | MEDIUM | HIGH
  occurrences: integer("occurrences").notNull().default(1), // similar defects on this asset inside the window
  longTermMaintenance: jsonb("long_term_maintenance").$type<{ durationMin: number; note: string; plannedFor: string } | null>(),
  closedAt: timestamp("closed_at"),
}, (t) => [
    index("defects_asset_idx").on(t.assetId),
    index("defects_status_idx").on(t.status),
    index("defects_lifecycle_idx").on(t.lifecycleStatus),
    index("defects_dept_idx").on(t.department),
    uniqueIndex("defects_code_uq").on(t.defectCode),
  ],
);

/**
 * Immutable audit trail of every lifecycle transition — who moved the defect,
 * from which stage to which, and why. Append-only by convention.
 */
export const defectEvents = pgTable("defect_events", {
  id: serial("id").primaryKey(),
  defectId: integer("defect_id")
    .notNull()
    .references(() => defects.id),
  fromStage: text("from_stage").notNull(),
  toStage: text("to_stage").notNull(),
  actor: text("actor").notNull().default("system"),
  actorRole: text("actor_role").notNull().default("SYSTEM"),
  note: text("note").notNull().default(""),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [
    index("defect_events_defect_idx").on(t.defectId),
    index("defect_events_at_idx").on(t.at),
  ],
);

/** AI-generated block plans (4H rolling / weekly / monthly / crisis). */
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  horizon: text("horizon").notNull(), // ROLLING | WEEKLY | MONTHLY | CRISIS
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resilienceScore: real("resilience_score").notNull().default(0),
  kpis: jsonb("kpis").$type<Record<string, number>>().notNull(),
  /* ---- Dynamic Re-Planning lineage ---- */
  supersedesId: integer("supersedes_id"), // previous version this plan replaces
  triggerNote: text("trigger_note"), // why the re-plan fired (event + detail)
  diff: jsonb("diff").$type<{
    added: string[];
    removed: string[];
    moved: string[];
    frozen: string[];
    note: string;
  } | null>(),
});

/** Scheduled maintenance blocks inside a plan. */
export const blockItems = pgTable("block_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  segmentId: integer("segment_id")
    .notNull()
    .references(() => segments.id),
  day: integer("day").notNull().default(0), // day index inside horizon
  startMin: integer("start_min").notNull(), // minutes from 00:00
  endMin: integer("end_min").notNull(),
  departments: jsonb("departments").$type<string[]>().notNull(),
  defectIds: jsonb("defect_ids").$type<number[]>().notNull(),
  isSuperBlock: boolean("is_super_block").notNull().default(false),
  mode: text("mode").notNull().default("physical"), // physical | virtual
  window: text("window").notNull().default("GOLDEN"), // GOLDEN | SHOULDER | OFFPEAK
  delayCostMin: real("delay_cost_min").notNull().default(0),
  status: text("status").notNull().default("proposed"), // proposed | frozen (in execution) | superseded
  rationale: text("rationale").notNull().default(""), // why the optimizer chose this window (BlockExplain)
}, (t) => [
    index("block_items_plan_idx").on(t.planId),
    index("block_items_segment_idx").on(t.segmentId),
    index("block_items_plan_day_idx").on(t.planId, t.day),
  ],
);

/** Event / alert feed for the command center. */
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("info"), // info | warn | critical | ai
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("events_created_idx").on(t.createdAt)],
);

/** Key-value operational settings (fog mode, VIP alert, DTP red-zone…). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
}, (t) => [uniqueIndex("settings_key_uq").on(t.key)],
);

/** Field work orders — the 5-step maintenance lifecycle. */
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  defectId: integer("defect_id").references(() => defects.id, { onDelete: "set null" }),
  segmentId: integer("segment_id")
    .notNull()
    .references(() => segments.id),
  department: text("department").notNull(), // ENG | TRD | SNT
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  chainage: text("chainage").notNull().default(""),
  status: text("status").notNull().default("PENDING"), // PENDING | ALLOTTED | IN_PROGRESS | AWAITING_REVIEW | COMPLETED | REJECTED
  teamLeader: text("team_leader"),
  windowStart: integer("window_start"),
  windowEnd: integer("window_end"),
  isSuperBlock: boolean("is_super_block").notNull().default(false),
  reportPhoto: text("report_photo").notNull().default(""),
  reportGps: text("report_gps").notNull().default(""),
  reportAt: timestamp("report_at").notNull().defaultNow(),
  beforePhoto: text("before_photo"),
  beforeGps: text("before_gps"),
  beforeAt: timestamp("before_at"),
  afterPhoto: text("after_photo"),
  afterGps: text("after_gps"),
  afterAt: timestamp("after_at"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
    index("jobs_segment_idx").on(t.segmentId),
    index("jobs_defect_idx").on(t.defectId),
    index("jobs_status_idx").on(t.status),
  ],
);

/* ==========================================================================
   FEATURE EXPANSION (SIH26027) — additional operational models.
   Every table below backs a working engine: nothing here is UI-only.
   ========================================================================== */

/**
 * DATA INTEGRATION HUB (Phase 1) — one row per ingestion cycle against a
 * departmental contract, with the integrity proof for that cycle.
 *
 * `simulated` is ALWAYS true in this evaluation build: the platform reads
 * realistic synthetic payloads through the same adapter interface a production
 * connector would implement. The UI renders the "SIMULATED / DEMO DATA" label
 * from this column, so the label can never drift from the truth.
 */
export const feedSyncs = pgTable("feed_syncs", {
  id: serial("id").primaryKey(),
  system: text("system").notNull(), // TMS | SMMS | TDMS | COA | FOIS | TIMETABLE | IMD
  domain: text("domain").notNull(),
  endpoint: text("endpoint").notNull(),
  transport: text("transport").notNull(), // REST/JSON | KAFKA | SCADA-POLL | FILE-EXCHANGE
  contractVersion: text("contract_version").notNull(),
  state: text("state").notNull().default("CONNECTED"), // CONNECTED | DEGRADED | STALE | DISCONNECTED
  simulated: boolean("simulated").notNull().default(true),
  records: integer("records").notNull().default(0),
  validRecords: integer("valid_records").notNull().default(0),
  invalidRecords: integer("invalid_records").notNull().default(0),
  quarantined: integer("quarantined").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  checksum: text("checksum").notNull().default(""),
  freshnessSec: integer("freshness_sec").notNull().default(0),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => [index("feed_syncs_system_idx").on(t.system)],
);

/** NORMALIZED INGESTION RECORDS (Phase 1) — adapters resolve every system to this shape. */
export const ingestRecords = pgTable("ingest_records", {
  id: serial("id").primaryKey(),
  syncId: integer("sync_id").references(() => feedSyncs.id),
  system: text("system").notNull(),
  sourceRef: text("source_ref").notNull(), // natural key in the source system
  entity: text("entity").notNull(), // DEFECT | ASSET | OHE | CORRIDOR | RAKE | TIMETABLE | WEATHER
  sectionHint: text("section_hint").notNull().default(""),
  segmentId: integer("segment_id"),
  assetId: integer("asset_id"),
  department: text("department").notNull().default(""),
  severity: real("severity").notNull().default(0),
  quantity: real("quantity").notNull().default(0), // tonnage / trains / minutes, per entity
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("VALID"), // VALID | INVALID | DUPLICATE | QUARANTINED
  issues: jsonb("issues").$type<string[]>().notNull().default([]),
  observedAt: timestamp("observed_at").notNull().defaultNow(),
  ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
}, (t) => [
    index("ingest_records_sync_idx").on(t.syncId),
    index("ingest_records_system_idx").on(t.system),
    index("ingest_records_status_idx").on(t.status),
  ],
);

/**
 * GOODS TRAIN FORECAST (Phase 2) — internal freight-forecast model.
 * The optimizer consumes the SAME rows the forecast desk displays; expected
 * tonnage and corridor occupancy are computed, not decorative.
 */
export const freightForecasts = pgTable("freight_forecasts", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id")
    .notNull()
    .references(() => segments.id),
  source: text("source").notNull().default("FOIS"), // FOIS | COA
  rakeRef: text("rake_ref").notNull().default(""),
  expectedFreight: integer("expected_freight").notNull().default(0), // rakes in the window
  expectedTonnage: real("expected_tonnage").notNull().default(0),
  etaMin: integer("eta_min").notNull().default(0), // minutes from 00:00 of day 0
  day: integer("day").notNull().default(0),
  priority: text("priority").notNull().default("MEDIUM"), // CRITICAL | HIGH | MEDIUM | LOW
  predictedOccupancyPct: real("predicted_occupancy_pct").notNull().default(0),
  confidence: real("confidence").notNull().default(0.8),
  isSurge: boolean("is_surge").notNull().default(false),
  horizon: text("horizon").notNull().default("24h"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
    index("freight_segment_idx").on(t.segmentId),
    index("freight_segment_day_idx").on(t.segmentId, t.day),
  ],
);

/** BLOCK REQUEST EXCHANGE (Phase 3) — departmental maintenance block requests. */
export const blockRequests = pgTable("block_requests", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull(), // RR-BRQ-<year>-<seq>
  department: text("department").notNull(), // ENG | TRD | SNT
  segmentId: integer("segment_id")
    .notNull()
    .references(() => segments.id),
  assetId: integer("asset_id"),
  defectId: integer("defect_id"),
  durationMin: integer("duration_min").notNull().default(60),
  priority: text("priority").notNull().default("MEDIUM"), // CRITICAL | HIGH | MEDIUM | LOW
  resources: jsonb("resources").$type<string[]>().notNull().default([]),
  crewRequired: integer("crew_required").notNull().default(1),
  machineRequired: text("machine_required").notNull().default(""),
  powerIsolation: boolean("power_isolation").notNull().default(false),
  lineBlock: boolean("line_block").notNull().default(true),
  requestedDay: integer("requested_day").notNull().default(0),
  requestedStart: integer("requested_start").notNull().default(30),
  requestedEnd: integer("requested_end").notNull().default(210),
  status: text("status").notNull().default("DRAFT"), // DRAFT…COMPLETED (blockstatus.ts)
  requestedBy: text("requested_by").notNull().default("Desk Officer"),
  requestedRole: text("requested_role").notNull().default("CONTROL"),
  note: text("note").notNull().default(""),
  conflictNote: text("conflict_note").notNull().default(""),
  planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
  blockItemId: integer("block_item_id").references(() => blockItems.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
    index("block_requests_segment_idx").on(t.segmentId),
    index("block_requests_status_idx").on(t.status),
    index("block_requests_plan_idx").on(t.planId),
    index("block_requests_block_item_idx").on(t.blockItemId),
    uniqueIndex("block_requests_ref_uq").on(t.ref),
  ],
);

/** SHADOW / COMBINED-BLOCK INTELLIGENCE (Phase 4) — computed and persisted per analysis. */
export const shadowBlocks = pgTable("shadow_blocks", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull(), // RR-SHD-<year>-<seq>
  segmentId: integer("segment_id")
    .notNull()
    .references(() => segments.id),
  departmentSet: jsonb("department_set").$type<string[]>().notNull().default([]),
  taskIds: jsonb("task_ids").$type<number[]>().notNull().default([]),
  independentMin: integer("independent_min").notNull().default(0),
  combinedMin: integer("combined_min").notNull().default(0),
  savedMin: integer("saved_min").notNull().default(0),
  duplicatePossessionsAvoided: integer("duplicate_possessions_avoided").notNull().default(0),
  trainDelaySavedMin: real("train_delay_saved_min").notNull().default(0),
  breakdown: jsonb("breakdown").$type<{ department: string; durationMin: number; tasks: number }[]>().notNull().default([]),
  compatible: boolean("compatible").notNull().default(true),
  blockers: jsonb("blockers").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
    index("shadow_blocks_segment_idx").on(t.segmentId),
    uniqueIndex("shadow_blocks_ref_uq").on(t.ref),
  ],
);

/** RESOURCE POOL (Phase 7) — crew / machine / equipment capacity the optimizer checks. */
export const resourcePools = pgTable("resource_pools", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. ENG-CREW-01
  department: text("department").notNull(),
  kind: text("kind").notNull(), // CREW | MACHINE | EQUIPMENT
  name: text("name").notNull(),
  sectionScope: jsonb("section_scope").$type<string[]>().notNull().default([]), // empty = division-wide
  units: integer("units").notNull().default(1), // capacity per day
  shiftStart: integer("shift_start").notNull().default(360),
  shiftEnd: integer("shift_end").notNull().default(1320),
  maxShiftMin: integer("max_shift_min").notNull().default(480),
  available: boolean("available").notNull().default(true),
  unavailableReason: text("unavailable_reason").notNull().default(""),
}, (t) => [index("resource_pools_dept_kind_idx").on(t.department, t.kind)],
);

/** Multipurpose usage ledger — machine hours, crew shifts, alerts read-model, analytics snapshots. */
export const usageLedger = pgTable("usage_ledger", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // SYNTHETIC_ALERT | RESOURCE_REJECT | QUALITY_SNAPSHOT | AVAILABILITY_SNAPSHOT
  entity: text("entity").notNull().default(""),
  refId: integer("ref_id"),
  metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  note: text("note").notNull().default(""),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [
    index("usage_ledger_kind_idx").on(t.kind),
    index("usage_ledger_kind_at_idx").on(t.kind, t.at),
  ],
);

/** APPROVAL WORKFLOW (Phase 13) — ordered chain: AI → Technical → Section Controller → DRM → Published. */
export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(), // stages in approvalchain.ts
  seq: integer("seq").notNull().default(0),
  action: text("action").notNull().default("PENDING"), // PENDING | APPROVED | MODIFIED | REJECTED | REPLAN_REQUESTED | EMERGENCY_OVERRIDE
  actorName: text("actor_name").notNull().default(""),
  actorRole: text("actor_role").notNull().default(""),
  reason: text("reason").notNull().default(""),
  oldValue: jsonb("old_value").$type<Record<string, unknown>>(),
  newValue: jsonb("new_value").$type<Record<string, unknown>>(),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [
    index("approvals_plan_idx").on(t.planId),
    index("approvals_stage_idx").on(t.stage),
  ],
);

/** DIGITAL BLOCK AUTHORIZATION (Phase 14) — formal permit generated after approval. */
export const blockAuthorizations = pgTable("block_authorizations", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull(), // RR/AUTH/<year>/<seq>
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  blockItemId: integer("block_item_id")
    .notNull()
    .references(() => blockItems.id, { onDelete: "cascade" }),
  segmentId: integer("segment_id").notNull(),
  windowLabel: text("window_label").notNull().default(""),
  departments: jsonb("departments").$type<string[]>().notNull().default([]),
  tasks: jsonb("tasks").$type<{ defectCode: string; title: string; department: string; durationMin: number; chainage?: string }[]>().notNull().default([]),
  safetyRequirements: jsonb("safety_requirements").$type<string[]>().notNull().default([]),
  approvalChain: jsonb("approval_chain").$type<{ stage: string; actorName: string; actorRole: string; action: string; at: string }[]>().notNull().default([]),
  status: text("status").notNull().default("ISSUED"), // ISSUED | ACTIVE | COMPLETED | CANCELLED
  issuedBy: text("issued_by").notNull().default(""),
  issuedRole: text("issued_role").notNull().default(""),
  body: text("body").notNull().default(""),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => [
    index("authz_plan_idx").on(t.planId),
    index("authz_block_idx").on(t.blockItemId),
    uniqueIndex("authz_ref_uq").on(t.ref),
  ],
);

/**
 * AUDIT TRAIL (Phase 15) — the complete, append-only action ledger.
 * Distinct from the legacy `events` feed: this records structured
 * before/after values so a reviewer can reconstruct exactly what changed.
 */
export const auditTrail = pgTable("audit_trail", {
  id: serial("id").primaryKey(),
  at: timestamp("at").notNull().defaultNow(),
  actorName: text("actor_name").notNull().default("system"),
  actorRole: text("actor_role").notNull().default("SYSTEM"),
  action: text("action").notNull(), // AI_GENERATED | CONFLICT_DETECTED | AI_REPLANNED | MODIFIED | APPROVED | …
  entity: text("entity").notNull().default(""), // PLAN | BLOCK | REQUEST | DEFECT | FEED | RESOURCE
  entityRef: text("entity_ref").notNull().default(""),
  planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
  planVersion: integer("plan_version"),
  oldValue: jsonb("old_value").$type<Record<string, unknown>>(),
  newValue: jsonb("new_value").$type<Record<string, unknown>>(),
  reason: text("reason").notNull().default(""),
  severity: text("severity").notNull().default("info"), // info | warn | critical | ai
}, (t) => [
    index("audit_plan_idx").on(t.planId),
    index("audit_entity_idx").on(t.entity, t.entityRef),
    index("audit_action_idx").on(t.action),
    index("audit_at_idx").on(t.at),
  ],
);
