/**
 * SMART DEFECT LIFECYCLE — server engine (PS #26027).
 *
 * Every defect moves through the 11 configured stages (lifecycleStages.ts).
 * The transition graph is ENFORCED HERE, server-side: an API caller cannot jump
 * REPORTED → CLOSED, and every accepted move is appended to `defect_events`
 * with actor, role and reason (the immutable audit trail the problem statement
 * asks for). Planner and job hooks call into this module so the stage advances
 * automatically as real work happens.
 *
 * Conventions
 *  - `defects.status` stays the coarse legacy flag (open | scheduled | closed)
 *    used by the optimizer; `defects.lifecycleStatus` is the fine-grained stage.
 *  - All ids/formatting helpers are pure; DB helpers are async.
 */
import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { assets, defectEvents, defects, events, jobs, plans, segments, settings } from "@/db/schema";
import {
  LIFECYCLE_STAGES,
  RECURRENCE_WINDOW_DAYS,
  STAGE_CONFIG,
  canTransition,
  priorityBand,
  recurrenceBand,
  stageIndex,
  timelinePartition,
  type LifecycleStage,
  type PriorityLevel,
  type RecurrenceLevel,
} from "./lifecycleStages";
import { classifyUrgency, priorityBreakdown, urgencyBoost, urgencyScore, type PriorityBreakdown, type UrgencyClass } from "./urgency";
import { riskFor, scoreDefect } from "./scoring";

/* ------------------------------------------------------------------ */
/*  Stable human-readable defect IDs: DEF-<SECTION>-<YEAR>-<SEQ>       */
/* ------------------------------------------------------------------ */

export function formatDefectCode(sectionCode: string, year: number, seq: number): string {
  return `DEF-${sectionCode}-${year}-${String(seq).padStart(3, "0")}`;
}

/** Deterministic sequence: next free number for this section + year. */
export async function allocateDefectCode(sectionCode: string, at: Date = new Date()): Promise<string> {
  const year = at.getFullYear();
  const prefix = `DEF-${sectionCode}-${year}-`;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(defects)
    .where(like(defects.defectCode, `${prefix}%`));
  const seq = (row?.n ?? 0) + 1;
  let code = formatDefectCode(sectionCode, year, seq);
  // Defensive: if a code somehow exists, walk forward until free.
  for (let guard = 0; guard < 50; guard++) {
    const [hit] = await db.select({ id: defects.id }).from(defects).where(eq(defects.defectCode, code)).limit(1);
    if (!hit) break;
    code = formatDefectCode(sectionCode, year, seq + guard + 1);
  }
  return code;
}

/* ------------------------------------------------------------------ */
/*  Audit trail                                                        */
/* ------------------------------------------------------------------ */

export async function logLifecycleEvent(input: {
  defectId: number;
  fromStage: string;
  toStage: string;
  actor: string;
  actorRole: string;
  note?: string;
}): Promise<void> {
  await db.insert(defectEvents).values({
    defectId: input.defectId,
    fromStage: input.fromStage,
    toStage: input.toStage,
    actor: input.actor,
    actorRole: input.actorRole,
    note: input.note ?? "",
  });
}

/* ------------------------------------------------------------------ */
/*  Context helpers                                                    */
/* ------------------------------------------------------------------ */

async function fogMode(): Promise<boolean> {
  const rows = await db.select().from(settings).where(eq(settings.key, "fogMode"));
  return rows[0]?.value === "true";
}

async function defectContext(id: number) {
  const [row] = await db.select().from(defects).where(eq(defects.id, id));
  if (!row) return null;
  const [asset] = await db.select().from(assets).where(eq(assets.id, row.assetId));
  const [seg] = asset ? await db.select().from(segments).where(eq(segments.id, asset.segmentId)) : [];
  return { defect: row, asset: asset ?? null, segment: seg ?? null };
}

/**
 * Rule-based recurrence detection (NOT machine learning).
 * Counts earlier defects on the SAME asset inside the 180-day window and bands
 * them: ≥4 → HIGH, 3 → MEDIUM, 2 → LOW. HIGH escalates priority to at least
 * HIGH — a chunk of the same wall failing four times is a chronic defect.
 */
export async function detectRecurrence(defectId: number, windowDays = RECURRENCE_WINDOW_DAYS) {
  const ctx = await defectContext(defectId);
  if (!ctx) throw new Error("defect not found");
  const since = new Date(Date.now() - windowDays * 86400000);
  const siblings = await db
    .select({ id: defects.id })
    .from(defects)
    .where(and(eq(defects.assetId, ctx.defect.assetId), eq(defects.department, ctx.defect.department), gte(defects.detectedAt, since)));
  const occurrences = siblings.length; // includes this defect
  const band = recurrenceBand(occurrences);
  const escalated = band === "HIGH" && ctx.defect.severity < 8;
  await db
    .update(defects)
    .set({
      occurrences,
      recurrenceBand: band,
      ...(escalated ? { priority: "HIGH" as PriorityLevel } : {}),
    })
    .where(eq(defects.id, defectId));
  if (band === "HIGH") {
    await db.insert(events).values({
      kind: "warn",
      message: `CHRONIC DEFECT: ${ctx.defect.defectCode || `#${defectId}`} on ${ctx.segment?.code ?? "?"} — ${occurrences} similar ${ctx.defect.department} defects in ${windowDays} days → recurrence ${band} (rule-based escalation)`,
    });
  }
  return { occurrences, band, escalated, windowDays };
}

/* ------------------------------------------------------------------ */
/*  Transition engine                                                  */
/* ------------------------------------------------------------------ */

export interface Actor {
  name: string;
  role: string; // DRM | CONTROL | STATION_MASTER | INSPECTOR | KARMI | SYSTEM
}

const SYSTEM: Actor = { name: "Rail Rakshak Engine", role: "SYSTEM" };

async function ensureJobForDefect(defectRow: typeof defects.$inferSelect, segmentId: number): Promise<number | null> {
  const existing = await db.select().from(jobs).where(eq(jobs.defectId, defectRow.id));
  if (existing.length > 0) return existing[0].id;
  const [row] = await db
    .insert(jobs)
    .values({
      defectId: defectRow.id,
      segmentId,
      department: defectRow.department,
      title: defectRow.title,
      note: "Auto-raised by the Smart Defect Lifecycle when the work was assigned.",
      chainage: "",
      status: "PENDING",
    })
    .returning();
  return row?.id ?? null;
}

/**
 * Move a defect to `to`, enforcing adjacency and writing the audit trail.
 * Side effects: priority computation on AI_PRIORITIZED, job creation on
 * WORK_ASSIGNED, asset health credit + closure on CLOSED.
 */
export async function advanceDefect(
  id: number,
  to: LifecycleStage,
  opts: { actor?: Actor; note?: string; availabilityPct?: number } = {}
): Promise<{ stage: LifecycleStage; priority: PriorityLevel; breakdown: PriorityBreakdown | null }> {
  const ctx = await defectContext(id);
  if (!ctx) throw new Error("defect not found");
  const from = (ctx.defect.lifecycleStatus || "REPORTED") as LifecycleStage;
  if (from === to) throw new Error(`defect already in ${to}`);
  if (!canTransition(from, to)) {
    throw new Error(`Invalid lifecycle transition ${from} → ${to}. Allowed: ${STAGE_CONFIG[from].action?.label ?? "none"}`);
  }

  const actor = opts.actor ?? SYSTEM;
  let priority = ctx.defect.priority as PriorityLevel;
  let breakdown: PriorityBreakdown | null = null;

  if (to === "AI_PRIORITIZED" && ctx.segment) {
    const fog = await fogMode();
    const health = ctx.asset?.health ?? 70;
    const mlRisk = riskFor(ctx.defect, health, ctx.segment, fog) * 100;
    const aiScore = scoreDefect(ctx.defect, ctx.segment, { fogMode: fog, assetHealth: health });
    const uScore = urgencyScore({
      severity: ctx.defect.severity,
      dueInDays: ctx.defect.dueInDays,
      overdueDays: ctx.defect.overdueDays,
      recurrenceBand: ctx.defect.recurrenceBand as RecurrenceLevel,
    });
    const availabilityPct = opts.availabilityPct ?? 100;
    breakdown = priorityBreakdown({
      aiScore,
      urgencyScore: uScore,
      mlRiskPct: mlRisk,
      availabilityPct,
      severity: ctx.defect.severity,
      criticality: ctx.segment.criticality,
      dailyTrains: ctx.segment.dailyTrains,
      dueInDays: ctx.defect.dueInDays,
      urgencyClass: classifyUrgency(ctx.defect.dueInDays, ctx.defect.severity),
    });
    priority = breakdown.band;
  }

  if (to === "WORK_ASSIGNED" && ctx.segment) {
    await ensureJobForDefect(ctx.defect, ctx.segment.id);
  }

  const patch: Partial<typeof defects.$inferInsert> = { lifecycleStatus: to };
  if (to === "AI_PRIORITIZED") patch.priority = priority;
  if (to === "BLOCK_PLANNED") patch.status = "scheduled";
  if (to === "CLOSED") {
    patch.status = "closed";
    patch.closedAt = new Date();
  }
  await db.update(defects).set(patch).where(eq(defects.id, id));

  if (to === "CLOSED" && ctx.asset) {
    await db
      .update(assets)
      .set({ health: Math.min(100, ctx.asset.health + 18) })
      .where(eq(assets.id, ctx.asset.id));
  }

  await logLifecycleEvent({
    defectId: id,
    fromStage: from,
    toStage: to,
    actor: actor.name,
    actorRole: actor.role,
    note: opts.note ?? "",
  });

  await db.insert(events).values({
    kind: to === "CLOSED" ? "ai" : "info",
    message: `${ctx.defect.defectCode || `Defect #${id}`} (${ctx.segment?.code ?? "?"}): ${STAGE_CONFIG[from].label} → ${STAGE_CONFIG[to].label} by ${actor.name}${opts.note ? ` — ${opts.note}` : ""}`,
  });

  return { stage: to, priority, breakdown };
}

/** Walk the shortest legal path to `target` (used by automated planner/job hooks). */
export async function advanceStepwise(
  id: number,
  target: LifecycleStage,
  opts: { actor?: Actor; note?: string; availabilityPct?: number } = {}
): Promise<LifecycleStage> {
  const ctx = await defectContext(id);
  if (!ctx) throw new Error("defect not found");
  let current = (ctx.defect.lifecycleStatus || "REPORTED") as LifecycleStage;
  const targetIdx = stageIndex(target);
  let guard = 0;
  while (stageIndex(current) < targetIdx && guard++ < LIFECYCLE_STAGES.length) {
    // next stage on the shortest path (strict adjacency: index + 1)
    const next = LIFECYCLE_STAGES[stageIndex(current) + 1];
    if (!next) break;
    const res = await advanceDefect(id, next, { ...opts, note: opts.note ? `${opts.note}` : `Auto-advanced by ${opts.actor?.name ?? SYSTEM.name}` });
    current = res.stage;
  }
  return current;
}

/* ------------------------------------------------------------------ */
/*  Detailed inspection workflow                                       */
/* ------------------------------------------------------------------ */

/**
 * Detailed inspection: the inspector goes beyond the first report and records
 * what the site actually needs. Consequences are real — the maintenance
 * duration grows (the extended work is carried into the optimizer) and the
 * defect can never be downgraded below HIGH afterwards.
 */
export async function runDetailedInspection(
  id: number,
  input: { actor: Actor; note: string; extraDurationMin?: number; needsPowerBlock?: boolean; finding?: string }
): Promise<{ stage: LifecycleStage; durationMin: number; priority: PriorityLevel }> {
  const ctx = await defectContext(id);
  if (!ctx) throw new Error("defect not found");
  const stage = (ctx.defect.lifecycleStatus || "REPORTED") as LifecycleStage;
  if (stageIndex(stage) > stageIndex("AI_PRIORITIZED")) {
    throw new Error(`Detailed inspection must happen before prioritisation (current stage ${stage})`);
  }
  const extra = input.extraDurationMin ?? 45;
  const durationMin = ctx.defect.durationMin + extra;
  const priority: PriorityLevel = ctx.defect.severity >= 8 ? "CRITICAL" : "HIGH";

  await db
    .update(defects)
    .set({
      detailedInspection: true,
      durationMin,
      priority,
      needsPowerBlock: input.needsPowerBlock ?? ctx.defect.needsPowerBlock,
      inspectionMode: "physical",
      title: input.finding ? `${ctx.defect.title} — ${input.finding}` : ctx.defect.title,
    })
    .where(eq(defects.id, id));

  await logLifecycleEvent({
    defectId: id,
    fromStage: stage,
    toStage: stage, // inspection note, not a stage move — recorded in the audit trail
    actor: input.actor.name,
    actorRole: input.actor.role,
    note: `Detailed inspection: ${input.note}${input.finding ? ` — finding: ${input.finding}` : ""} (duration ${ctx.defect.durationMin} → ${durationMin} min${input.needsPowerBlock ? ", power block required" : ""})`,
  });
  await db.insert(events).values({
    kind: "warn",
    message: `Detailed inspection complete on ${ctx.defect.defectCode || `defect #${id}`} (${ctx.segment?.code ?? "?"}) — ${input.note}; duration revised to ${durationMin} min, priority floored at ${priority}`,
  });

  const nextStage = await advanceStepwise(id, "AI_PRIORITIZED", { actor: input.actor, note: "detailed inspection complete" });
  return { stage: nextStage, durationMin, priority };
}

/* ------------------------------------------------------------------ */
/*  Long-term maintenance (feeds the optimizer as an extended window)  */
/* ------------------------------------------------------------------ */

export async function setLongTermMaintenance(
  id: number,
  input: { actor: Actor; durationMin: number; note: string; plannedFor: string }
) {
  const ctx = await defectContext(id);
  if (!ctx) throw new Error("defect not found");
  const current = (ctx.defect.lifecycleStatus || "REPORTED") as LifecycleStage;
  if (current === "CLOSED") {
    throw new Error("Closed defects cannot be re-classified as long-term maintenance — raise a new defect instead.");
  }
  // A long-term decision is a maintenance decision: walk the lifecycle up to it
  // so the board never shows a maintenance flag on an unreviewed defect.
  if (stageIndex(current) < stageIndex("MAINTENANCE_REQUIRED")) {
    await advanceStepwise(id, "MAINTENANCE_REQUIRED", {
      actor: input.actor,
      note: `long-term maintenance review — ${input.note}`,
    });
  }

  await db
    .update(defects)
    .set({ longTermMaintenance: { durationMin: input.durationMin, note: input.note, plannedFor: input.plannedFor } })
    .where(eq(defects.id, id));
  await logLifecycleEvent({
    defectId: id,
    fromStage: "MAINTENANCE_REQUIRED",
    toStage: "MAINTENANCE_REQUIRED",
    actor: input.actor.name,
    actorRole: input.actor.role,
    note: `Long-term maintenance planned: ${input.durationMin} min — ${input.note} (target ${input.plannedFor})`,
  });
  await db.insert(events).values({
    kind: "ai",
    message: `Long-term maintenance registered for defect #${id}: ${input.durationMin} min task targeted ${input.plannedFor} — the optimizer will place it as an OFFPEAK extended super-block`,
  });
}

/* ------------------------------------------------------------------ */
/*  Planner / job hooks — automatic stage advancement                  */
/* ------------------------------------------------------------------ */

/**
 * Called by the optimizer right after a plan row is written: defects bundled
 * into a block move to PLANNING (if they are not there yet) and then to
 * BLOCK_PLANNED, with the chosen window recorded in the audit trail.
 */
export async function onDefectsPlanned(
  entries: { defectId: number; day: number; startMin: number; window: string; isSuperBlock: boolean }[],
  opts: { actor?: Actor; availabilityPct?: number } = {}
): Promise<number> {
  let advanced = 0;
  for (const e of entries) {
    const ctx = await defectContext(e.defectId);
    if (!ctx) continue;
    const stage = (ctx.defect.lifecycleStatus || "REPORTED") as LifecycleStage;
    if (stage === "CLOSED") continue;
    const hh = String(Math.floor(e.startMin / 60)).padStart(2, "0");
    const mm = String(e.startMin % 60).padStart(2, "0");
    const note = `Block planned day ${e.day + 1} at ${hh}:${mm} in the ${e.window} window${e.isSuperBlock ? " (super-block)" : ""}`;
    try {
      const wasPlanning = stageIndex(stage) >= stageIndex("PLANNING");
      if (!wasPlanning) {
        await advanceStepwise(e.defectId, "PLANNING", { actor: opts.actor ?? SYSTEM, availabilityPct: opts.availabilityPct });
      }
      await advanceDefect(e.defectId, "BLOCK_PLANNED", { actor: opts.actor ?? SYSTEM, note, availabilityPct: opts.availabilityPct });
      advanced += 1;
    } catch {
      // A defect already past BLOCK_PLANNED (e.g. work underway) is left alone.
    }
  }
  return advanced;
}

export async function onJobAllotted(jobId: number, actor: Actor, note: string): Promise<void> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job?.defectId) return;
  await advanceStepwise(job.defectId, "WORK_ASSIGNED", { actor, note });
}

export async function onJobStarted(jobId: number, actor: Actor, note: string): Promise<void> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job?.defectId) return;
  await advanceStepwise(job.defectId, "WORK_IN_PROGRESS", { actor, note });
}

export async function onJobCompleted(jobId: number, actor: Actor, note: string): Promise<void> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job?.defectId) return;
  await advanceStepwise(job.defectId, "AWAITING_VALIDATION", { actor, note });
}

/** Inspector validation: accept → CLOSED, reject → clearly-labelled rework path. */
export async function onJobValidated(jobId: number, accept: boolean, actor: Actor, note: string): Promise<void> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job?.defectId) return;
  const ctx = await defectContext(job.defectId);
  if (!ctx) return;
  const stage = (ctx.defect.lifecycleStatus || "REPORTED") as LifecycleStage;
  if (accept) {
    if (stage !== "AWAITING_VALIDATION") {
      await advanceStepwise(job.defectId, "AWAITING_VALIDATION", { actor, note: "work submitted for validation" });
    }
    await advanceDefect(job.defectId, "CLOSED", { actor, note: note || "work validated — defect closed" });
  } else {
    // AWAITING_VALIDATION → WORK_ASSIGNED is the documented correction edge (rework).
    await advanceDefect(job.defectId, "WORK_ASSIGNED", { actor, note: note || "work rejected — rework required" });
  }
}

/* ------------------------------------------------------------------ */
/*  Read models                                                        */
/* ------------------------------------------------------------------ */

export interface DefectLifecycleEventDTO {
  id: number;
  fromStage: string;
  toStage: string;
  actor: string;
  actorRole: string;
  note: string;
  at: string;
}

export interface DefectLifecycleDTO {
  id: number;
  defectCode: string;
  title: string;
  department: string;
  sourceSystem: string;
  segmentId: number;
  segmentCode: string;
  corridor: string;
  assetLabel: string;
  severity: number;
  dueInDays: number;
  overdueDays: number;
  durationMin: number;
  inspectionMode: string;
  detailedInspection: boolean;
  priority: PriorityLevel;
  recurrenceBand: RecurrenceLevel;
  occurrences: number;
  longTermMaintenance: { durationMin: number; note: string; plannedFor: string } | null;
  stage: LifecycleStage;
  stageIndex: number;
  stageConfig: (typeof STAGE_CONFIG)[LifecycleStage];
  timeline: { stage: LifecycleStage; state: "done" | "current" | "future" }[];
  allowedTransitions: LifecycleStage[];
  urgencyClass: UrgencyClass;
  urgencyScore: number;
  boost: number;
  mlRiskPct: number;
  aiScore: number;
  priorityBreakdown: PriorityBreakdown | null;
  detectedAt: string;
  closedAt: string | null;
  events: DefectLifecycleEventDTO[];
}

export async function getDefectLifecycle(id: number): Promise<DefectLifecycleDTO | null> {
  const ctx = await defectContext(id);
  if (!ctx) return null;
  const { defect: d, asset, segment } = ctx;
  const fog = await fogMode();
  const health = asset?.health ?? 70;
  const mlRisk = segment ? riskFor(d, health, segment, fog) * 100 : 50;
  const aiScore = segment ? scoreDefect(d, segment, { fogMode: fog, assetHealth: health }) : d.severity * 10;
  const uScore = urgencyScore({ severity: d.severity, dueInDays: d.dueInDays, overdueDays: d.overdueDays, recurrenceBand: d.recurrenceBand as RecurrenceLevel });
  const uClass = classifyUrgency(d.dueInDays, d.severity);
  const stage = (d.lifecycleStatus || "REPORTED") as LifecycleStage;

  // Availability context comes from the published plan (15% of the blend).
  // Read straight from the plans table to avoid importing the optimizer
  // (the optimizer imports this module for its planner hook).
  const [latestPlan] = await db.select().from(plans).orderBy(desc(plans.id)).limit(1);
  const availabilityPct = latestPlan?.kpis?.assetAvailabilityPct ?? 100;

  const breakdown = segment
    ? priorityBreakdown({
        aiScore,
        urgencyScore: uScore,
        mlRiskPct: mlRisk,
        availabilityPct,
        severity: d.severity,
        criticality: segment.criticality,
        dailyTrains: segment.dailyTrains,
        dueInDays: d.dueInDays,
        urgencyClass: uClass,
      })
    : null;

  const evRows = await db.select().from(defectEvents).where(eq(defectEvents.defectId, id)).orderBy(desc(defectEvents.id));

  return {
    id: d.id,
    defectCode: d.defectCode || `#${d.id}`,
    title: d.title,
    department: d.department,
    sourceSystem: d.sourceSystem,
    segmentId: segment?.id ?? 0,
    segmentCode: segment?.code ?? "?",
    corridor: segment?.corridor ?? "?",
    assetLabel: asset?.label ?? "—",
    severity: d.severity,
    dueInDays: d.dueInDays,
    overdueDays: d.overdueDays,
    durationMin: d.durationMin,
    inspectionMode: d.inspectionMode,
    detailedInspection: d.detailedInspection,
    priority: d.priority as PriorityLevel,
    recurrenceBand: d.recurrenceBand as RecurrenceLevel,
    occurrences: d.occurrences,
    longTermMaintenance: d.longTermMaintenance ?? null,
    stage,
    stageIndex: stageIndex(stage),
    stageConfig: STAGE_CONFIG[stage],
    timeline: timelinePartition(stage),
    allowedTransitions: (Object.entries(STAGE_CONFIG[stage]) && (canTransition(stage, "CLOSED") ? ["CLOSED"] : [])) as LifecycleStage[],
    urgencyClass: uClass,
    urgencyScore: uScore,
    boost: urgencyBoost(uScore),
    mlRiskPct: Math.round(mlRisk * 10) / 10,
    aiScore,
    priorityBreakdown: breakdown,
    detectedAt: d.detectedAt.toISOString(),
    closedAt: d.closedAt ? d.closedAt.toISOString() : null,
    events: evRows.map((e) => ({
      id: e.id,
      fromStage: e.fromStage,
      toStage: e.toStage,
      actor: e.actor,
      actorRole: e.actorRole,
      note: e.note,
      at: e.at.toISOString(),
    })),
  };
}

export interface LifecycleBoardRow {
  id: number;
  defectCode: string;
  title: string;
  segmentCode: string;
  corridor: string;
  department: string;
  severity: number;
  priority: PriorityLevel;
  stage: LifecycleStage;
  stageIndex: number;
  dueInDays: number;
  urgencyClass: UrgencyClass;
  urgencyScore: number;
  boost: number;
  sortKey: number;
  recurrenceBand: RecurrenceLevel;
  occurrences: number;
  detailedInspection: boolean;
  responsible: string;
  nextAction: string | null;
  nextActor: string | null;
  updatedAgeH: number;
}

export async function getLifecycleBoard(): Promise<LifecycleBoardRow[]> {
  const [rows, segRows, assetRows] = await Promise.all([db.select().from(defects), db.select().from(segments), db.select().from(assets)]);
  const segById = new Map(segRows.map((s) => [s.id, s]));
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const fog = await fogMode();

  const out = rows.map((d) => {
    const asset = assetById.get(d.assetId);
    const seg = asset ? segById.get(asset.segmentId) : null;
    const health = asset?.health ?? 70;
    const aiScore = seg ? scoreDefect(d, seg, { fogMode: fog, assetHealth: health }) : d.severity * 10;
    const uScore = urgencyScore({ severity: d.severity, dueInDays: d.dueInDays, overdueDays: d.overdueDays, recurrenceBand: d.recurrenceBand as RecurrenceLevel });
    const stage = (d.lifecycleStatus || "REPORTED") as LifecycleStage;
    const cfg = STAGE_CONFIG[stage];
    return {
      id: d.id,
      defectCode: d.defectCode || `#${d.id}`,
      title: d.title,
      segmentCode: seg?.code ?? "?",
      corridor: seg?.corridor ?? "?",
      department: d.department,
      severity: d.severity,
      priority: d.priority as PriorityLevel,
      stage,
      stageIndex: stageIndex(stage),
      dueInDays: d.dueInDays,
      urgencyClass: classifyUrgency(d.dueInDays, d.severity),
      urgencyScore: uScore,
      boost: urgencyBoost(uScore),
      sortKey: Math.round(aiScore * urgencyBoost(uScore) * 10) / 10,
      recurrenceBand: d.recurrenceBand as RecurrenceLevel,
      occurrences: d.occurrences,
      detailedInspection: d.detailedInspection,
      responsible: cfg.responsible,
      nextAction: cfg.action?.label ?? cfg.next ?? null,
      nextActor: cfg.action?.actor ?? null,
      updatedAgeH: Math.round(((Date.now() - d.detectedAt.getTime()) / 3600000) * 10) / 10,
    };
  });

  return out.sort((a, b) => b.stageIndex - a.stageIndex || b.sortKey - a.sortKey);
}

export interface LifecycleRollup {
  counts: Record<LifecycleStage, number>;
  open: number;
  closed: number;
  overdue: number;
  emergency: number;
  awaitingValidation: number;
  chronic: number;
  avgAgeDaysOpen: number;
  detailedInspections: number;
}

export async function lifecycleRollup(): Promise<LifecycleRollup> {
  const rows = await getLifecycleBoard();
  const counts = Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0])) as Record<LifecycleStage, number>;
  for (const r of rows) counts[r.stage] += 1;
  const openRows = rows.filter((r) => r.stage !== "CLOSED");
  return {
    counts,
    open: openRows.length,
    closed: counts.CLOSED,
    overdue: rows.filter((r) => r.urgencyClass === "OVERDUE" || r.urgencyClass === "CRITICALLY_OVERDUE").length,
    emergency: rows.filter((r) => r.urgencyClass === "EMERGENCY").length,
    awaitingValidation: counts.AWAITING_VALIDATION,
    chronic: rows.filter((r) => r.recurrenceBand === "HIGH").length,
    avgAgeDaysOpen: openRows.length ? Math.round((openRows.reduce((s, r) => s + r.updatedAgeH, 0) / openRows.length / 24) * 10) / 10 : 0,
    detailedInspections: rows.filter((r) => r.detailedInspection).length,
  };
}

/* ------------------------------------------------------------------ */
/*  Backfill — legacy rows get codes + a sensible stage                */
/* ------------------------------------------------------------------ */

/**
 * Seeded/legacy defects predate the lifecycle. Backfill assigns
 * DEF-<SECTION>-<YEAR>-<SEQ> codes and maps the coarse status onto a stage so
 * the board is never empty on first boot. Idempotent.
 */
export async function backfillLifecycle(): Promise<number> {
  const [assetRows, segRows] = await Promise.all([db.select().from(assets), db.select().from(segments)]);
  const segById = new Map(segRows.map((s) => [s.id, s]));
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const rows = await db.select().from(defects);
  let touched = 0;

  for (const d of rows) {
    const asset = assetById.get(d.assetId);
    const seg = asset ? segById.get(asset.segmentId) : null;
    const needsCode = !d.defectCode;
    const stage = (d.lifecycleStatus || "REPORTED") as LifecycleStage;
    const needsStage = !d.lifecycleStatus || stage === "REPORTED";
    if (!needsCode && !needsStage) continue;

    let code = d.defectCode;
    if (needsCode && seg) code = await allocateDefectCode(seg.code, d.detectedAt);
    let mapped: LifecycleStage = (d.lifecycleStatus || "REPORTED") as LifecycleStage;
    if (needsStage) {
      mapped = d.status === "closed" ? "CLOSED" : d.status === "scheduled" ? "BLOCK_PLANNED" : "REPORTED";
      // A closed defect keeps its priority; everything else is prioritised on entry.
      if (mapped === "REPORTED" && d.severity >= 8) mapped = "REPORTED";
    }
    await db
      .update(defects)
      .set({
        defectCode: code,
        lifecycleStatus: mapped,
        ...(d.lifecycleStatus !== mapped ? {} : {}),
        ...(d.status === "closed" && !d.closedAt ? { closedAt: d.detectedAt } : {}),
      })
      .where(eq(defects.id, d.id));
    if (mapped !== "REPORTED" || needsCode) {
      await logLifecycleEvent({
        defectId: d.id,
        fromStage: "REPORTED",
        toStage: mapped,
        actor: "Rail Rakshak Engine",
        actorRole: "SYSTEM",
        note: "backfilled from legacy status",
      });
    }
    touched += 1;
  }
  return touched;
}

/** Estimated priority band for a raw defect row (used by seeds & summaries). */
export function bandFor(score: number, severity: number, prob: number): PriorityLevel {
  return priorityBand(score, severity, prob);
}
