import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  real,
  timestamp,
  jsonb,
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
});

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
});

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
});

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
    .references(() => plans.id),
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
});

/** Event / alert feed for the command center. */
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("info"), // info | warn | critical | ai
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Key-value operational settings (fog mode, VIP alert, DTP red-zone…). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Field work orders — the 5-step maintenance lifecycle. */
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  defectId: integer("defect_id"),
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
});
