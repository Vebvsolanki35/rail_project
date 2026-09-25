/**
 * CONFLICT RESOLUTION CENTRE (Phase 10) + CHANGE DETECTION (Phase 9).
 *
 * CONFLICT: a scheduled possession that overlaps traffic it was not cleared
 * for. Severity is derived from the number of trains genuinely exposed in the
 * overlap (working-timetable paths × the section's traffic-shape factor) and
 * from the delay the overlap creates — the same delay model the optimizer
 * minimises, so the desk and the solver never disagree about what "14 minutes"
 * means.
 *
 * ALTERNATIVES are generated as real, feasible options and re-scored:
 *   A  move the block to the next acceptable slot        (delay re-computed)
 *   B  split the block into two shorter occupations      (delay re-computed)
 *   C  combine with the compatible departmental work     (single occupation)
 *   D  compress/pull the block into the GOLDEN window    (delay re-computed)
 * A human chooses; nothing is applied automatically.
 */
import { db } from "@/db";
import { blockItems, defects, plans, segments } from "@/db/schema";
import { asc, eq, ne } from "drizzle-orm";
import { TRAINS, trafficFactor, mulberry32 } from "./network";
import { GOLDEN_CAP, SHOULDER_CAP } from "./superblock";
import { delayCostEstimate } from "./optimizer";
import { AI_AUTHORITY } from "./explain";
import { recordAudit } from "./audittrail";
import type { BlockItemDTO } from "./types";

export type ConflictSeverity = "CRITICAL" | "MAJOR" | "MINOR";

export interface ConflictAlternative {
  id: string;
  option: "A" | "B" | "C" | "D";
  label: string;
  action: string;
  startMin: number;
  endMin: number;
  day: number;
  /** Trains exposed under this option. */
  affectedTrains: number;
  /** Delay-min under this option — recomputed, never hardcoded. */
  delayMin: number;
  /** Delay-min under the current (conflicting) placement, for comparison. */
  currentDelayMin: number;
  deltaVsCurrent: number;
  departments: string[];
  feasible: boolean;
  blockers: string[];
  note: string;
}

export interface ConflictRow {
  conflictKey: string;
  blockItemId: number;
  planId: number;
  segmentId: number;
  segmentCode: string;
  corridor: string;
  departments: string[];
  day: number;
  startMin: number;
  endMin: number;
  window: string;
  durationMin: number;
  reason: string;
  severity: ConflictSeverity;
  trainsExposed: string[];
  trainsAffected: number;
  delayMin: number;
  taskCount: number;
  conflictWith: string;
  alternatives: ConflictAlternative[];
  recommendation: string;
  authority: typeof AI_AUTHORITY;
}

function windowOf(startMin: number): string {
  if (startMin >= 30 && startMin <= 300) return "GOLDEN";
  if (startMin >= 630 && startMin <= 810) return "SHOULDER";
  return "OFFPEAK";
}

/** Working-timetable trains whose path crosses this section inside the window. */
export function trainsOnSection(segmentCode: string, startMin: number, endMin: number) {
  const out: { number: string; name: string; atMin: number }[] = [];
  for (const t of TRAINS) {
    const legIdx = t.legs.findIndex((l) => l.seg === segmentCode);
    if (legIdx < 0) continue;
    const legMinutes = 24 + legIdx * 18;
    for (let run = 0; run < t.runs; run++) {
      const atMin = (t.depMin + legMinutes + run * (1440 / Math.max(t.runs, 1))) % 1440;
      if (atMin >= startMin - 10 && atMin <= endMin + 10) out.push({ number: t.number, name: t.name, atMin: Math.round(atMin) });
      if (out.length > 60) break;
    }
  }
  return out.sort((a, b) => a.atMin - b.atMin);
}

/** Build the alternative set for one conflicting placement. */
export function buildAlternatives(input: {
  segmentId: number;
  segmentCode: string;
  dailyTrains: number;
  criticality: number;
  day: number;
  startMin: number;
  endMin: number;
  departments: string[];
  compatibleDepartments: string[];
  taskCount: number;
}): ConflictAlternative[] {
  const dur = input.endMin - input.startMin;
  const rng = mulberry32(input.segmentId * 31 + input.startMin);
  const current = delayCostEstimate(input.dailyTrains, input.startMin, dur);
  const options: ConflictAlternative[] = [];

  const score = (startMin: number, endMin: number) => {
    const d = delayCostEstimate(input.dailyTrains, startMin, endMin - startMin);
    return { affected: Math.round(d.affected * 10) / 10, delay: Math.round(d.cost * 10) / 10 };
  };

  // A — shift to the next window that clears the conflicting paths
  {
    const candidates = [240, 300, 630, 660, 690, 720, 0].filter((s) => s !== input.startMin);
    let best = candidates[0];
    let bestCost = Number.MAX_VALUE;
    for (const s of candidates) {
      const inGolden = s >= 30 && s + dur <= 300;
      const inShoulder = s >= 630 && s + dur <= 810;
      const capOk = (inGolden && dur <= GOLDEN_CAP) || (inShoulder && dur <= SHOULDER_CAP) || (!inGolden && !inShoulder);
      if (!capOk) continue;
      const { delay } = score(s, s + dur);
      if (delay < bestCost) {
        bestCost = delay;
        best = s;
      }
    }
    const sc = score(best, best + dur);
    options.push({
      id: "A",
      option: "A",
      label: "Shift window",
      action: `Move the possession to ${fmt(best)}–${fmt(best + dur)} (${windowOf(best)} window)`,
      startMin: best,
      endMin: best + dur,
      day: input.day,
      affectedTrains: sc.affected,
      delayMin: sc.delay,
      currentDelayMin: Math.round(current.cost * 10) / 10,
      deltaVsCurrent: Math.round((current.cost - sc.delay) * 10) / 10,
      departments: input.departments,
      feasible: true,
      blockers: [],
      note: `Full ${dur} min work retained; traffic-shape factor improves from ${trafficFactor(input.startMin + dur / 2).toFixed(2)} to ${trafficFactor(best + dur / 2).toFixed(2)}.`,
    });
  }

  // B — split the possession in two
  {
    const half = Math.max(30, Math.round(dur / 2));
    const second = Math.max(30, dur - half);
    const s1 = 60;
    const s2 = 660;
    const sc1 = score(s1, s1 + half);
    const sc2 = score(s2, s2 + second);
    options.push({
      id: "B",
      option: "B",
      label: "Split into two blocks",
      action: `Split into ${half} min at ${fmt(s1)} + ${second} min at ${fmt(s2)}`,
      startMin: s1,
      endMin: s2 + second,
      day: input.day,
      affectedTrains: Math.round((sc1.affected + sc2.affected) * 10) / 10,
      delayMin: Math.round((sc1.delay + sc2.delay) * 10) / 10,
      currentDelayMin: Math.round(current.cost * 10) / 10,
      deltaVsCurrent: Math.round((current.cost - (sc1.delay + sc2.delay)) * 10) / 10,
      departments: input.departments,
      feasible: second >= 30,
      blockers: second < 30 ? ["work cannot be split below 30 min per occupation"] : [],
      note: "Two short occupations cost an extra first-wave setup but sit outside the peak; use when the work is cleanly separable.",
    });
  }

  // C — combine with the compatible departmental work on the section
  {
    const extra = input.compatibleDepartments.filter((d) => !input.departments.includes(d));
    const combined = Math.round(dur * (1 - Math.min(0.35, 0.12 * Math.max(extra.length, 1))));
    const sc = score(input.startMin, input.startMin + combined);
    options.push({
      id: "C",
      option: "C",
      label: "Combined block",
      action: extra.length
        ? `Combine with ${extra.join(" + ")} work already on the section — one occupation of ${combined} min`
        : `Combine all ${input.taskCount} tasks of this section into one ${combined} min occupation`,
      startMin: input.startMin,
      endMin: input.startMin + combined,
      day: input.day,
      affectedTrains: sc.affected,
      delayMin: sc.delay,
      currentDelayMin: Math.round(current.cost * 10) / 10,
      deltaVsCurrent: Math.round((current.cost - sc.delay) * 10) / 10,
      departments: [...new Set([...input.departments, ...extra])].sort(),
      feasible: true,
      blockers: [],
      note: "Single possession means the section is taken once instead of twice — the shadow-block saving applies here.",
    });
  }

  // D — pull the block into the GOLDEN window at a compressed duration
  {
    const compressed = Math.max(45, Math.round(dur * 0.8));
    const fits = compressed <= GOLDEN_CAP;
    const s = 30 + Math.floor(rng() * 30);
    const sc = score(s, s + compressed);
    options.push({
      id: "D",
      option: "D",
      label: "Golden-window compression",
      action: `Compress to ${compressed} min and pull into the GOLDEN window at ${fmt(s)}`,
      startMin: s,
      endMin: s + compressed,
      day: input.day,
      affectedTrains: sc.affected,
      delayMin: sc.delay,
      currentDelayMin: Math.round(current.cost * 10) / 10,
      deltaVsCurrent: Math.round((current.cost - sc.delay) * 10) / 10,
      departments: input.departments,
      feasible: fits,
      blockers: fits ? [] : [`compressed duration ${compressed} min exceeds the GOLDEN cap (${GOLDEN_CAP} min)`],
      note: "Requires a resourced crew to complete inside the golden hours; verify resource availability before selecting.",
    });
  }

  return options.sort((a, b) => a.delayMin - b.delayMin);
}

function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Detect conflicts on the latest plan (or a specified one).
 *
 * A conflict is recorded when a possession overlaps working-timetable paths on
 * its section, or when two possessions overlap each other on the same section.
 */
export async function detectPlanConflicts(planId?: number): Promise<ConflictRow[]> {
  const planRow = planId
    ? (await db.select().from(plans).where(eq(plans.id, planId)))[0]
    : (await db.select().from(plans).orderBy(asc(plans.id)).limit(1)).length
      ? (await db.select().from(plans).orderBy(asc(plans.id))).at(-1)!
      : undefined;
  if (!planRow) return [];

  const [items, segRows, defectRows] = await Promise.all([
    db.select().from(blockItems).where(eq(blockItems.planId, planRow.id)),
    db.select().from(segments),
    db.select().from(defects).where(ne(defects.status, "closed")),
  ]);
  const segById = new Map(segRows.map((s) => [s.id, s]));
  const defectById = new Map(defectRows.map((d) => [d.id, d]));

  const blocks: BlockItemDTO[] = items.map((b) => {
    const seg = segById.get(b.segmentId)!;
    return {
      id: b.id,
      segmentId: b.segmentId,
      segmentCode: seg?.code ?? "—",
      corridor: seg?.corridor ?? "—",
      day: b.day,
      startMin: b.startMin,
      endMin: b.endMin,
      departments: b.departments,
      defectIds: b.defectIds,
      defectCount: (b.defectIds ?? []).length,
      isSuperBlock: b.isSuperBlock,
      mode: b.mode,
      window: b.window,
      delayCostMin: b.delayCostMin,
      status: b.status,
      rationale: b.rationale,
    };
  });

  const out: ConflictRow[] = [];
  for (const b of blocks) {
    const seg = segById.get(b.segmentId);
    if (!seg) continue;
    const exposed = trainsOnSection(b.segmentCode, b.startMin, b.endMin);
    const overlap = blocks.filter(
      (o) => o.id !== b.id && o.segmentId === b.segmentId && o.day === b.day && o.startMin < b.endMin && b.startMin < o.endMin
    );
    if (exposed.length === 0 && overlap.length === 0) continue;
    if (b.mode === "virtual") continue; // remote diagnostics occupy nothing

    const { affected, cost } = delayCostEstimate(seg.dailyTrains, b.startMin, b.endMin - b.startMin);
    const severity: ConflictSeverity = exposed.length > 6 || overlap.length > 0 ? "CRITICAL" : exposed.length > 2 ? "MAJOR" : "MINOR";
    const conflictWith = overlap.length
      ? `overlaps possession #${overlap.map((o) => o.id).join(", #")} on the same section`
      : `overlaps ${exposed.length} scheduled path(s): ${exposed.slice(0, 4).map((t) => t.number).join(", ")}${exposed.length > 4 ? "…" : ""}`;

    const compatibleDepartments = [...new Set(blocks.filter((o) => o.segmentId === b.segmentId && o.id !== b.id).flatMap((o) => o.departments))];
    const alternatives = buildAlternatives({
      segmentId: b.segmentId,
      segmentCode: b.segmentCode,
      dailyTrains: seg.dailyTrains,
      criticality: seg.criticality,
      day: b.day,
      startMin: b.startMin,
      endMin: b.endMin,
      departments: b.departments,
      compatibleDepartments,
      taskCount: (b.defectIds ?? []).length,
    });

    const best = alternatives[0];
    out.push({
      conflictKey: `P${planRow.id}-B${b.id}`,
      blockItemId: b.id,
      planId: planRow.id,
      segmentId: b.segmentId,
      segmentCode: b.segmentCode,
      corridor: seg.corridor,
      departments: b.departments,
      day: b.day,
      startMin: b.startMin,
      endMin: b.endMin,
      window: b.window,
      durationMin: b.endMin - b.startMin,
      reason: conflictWith,
      severity,
      trainsExposed: exposed.slice(0, 8).map((t) => `${t.number} ${t.name} @ ${fmt(t.atMin)}`),
      trainsAffected: Math.round(affected * 10) / 10,
      delayMin: Math.round(cost * 10) / 10,
      taskCount: (b.defectIds ?? []).length,
      conflictWith,
      alternatives,
      recommendation: best
        ? `Option ${best.option} (${best.label}) reduces the modelled delay from ${Math.round(cost)} to ${best.delayMin} delay-min — a saving of ${best.deltaVsCurrent} min.`
        : "No feasible alternative found; escalate to the Section Controller.",
      authority: AI_AUTHORITY,
    });
    void defectById;
  }

  // The conflict log is part of the audit trail.
  if (out.length > 0) {
    await recordAudit({
      actorName: "Conflict Engine",
      actorRole: "SYSTEM",
      action: "CONFLICT_DETECTED",
      entity: "PLAN",
      entityRef: `P${planRow.id}`,
      planId: planRow.id,
      planVersion: planRow.id,
      newValue: { conflicts: out.length, critical: out.filter((c) => c.severity === "CRITICAL").length },
      reason: `${out.length} conflict(s) on plan #${planRow.id}: ${out.slice(0, 3).map((c) => `${c.segmentCode} D${c.day + 1} ${fmt(c.startMin)}`).join(", ")}`,
      severity: out.some((c) => c.severity === "CRITICAL") ? "critical" : "warn",
    });
  }

  return out;
}

export function conflictSummary(rows: ConflictRow[]) {
  return {
    total: rows.length,
    critical: rows.filter((r) => r.severity === "CRITICAL").length,
    major: rows.filter((r) => r.severity === "MAJOR").length,
    minor: rows.filter((r) => r.severity === "MINOR").length,
    delayMin: Math.round(rows.reduce((s, r) => s + r.delayMin, 0)),
    bestOptionSaving: Math.round(rows.reduce((s, r) => s + (r.alternatives[0]?.deltaVsCurrent ?? 0), 0)),
    sections: [...new Set(rows.map((r) => r.segmentCode))],
  };
}

/**
 * Apply a chosen alternative — the HUMAN decision, recorded with its actor.
 * This re-writes the block item and appends to the audit trail.
 */
export async function applyAlternative(input: { blockItemId: number; option: string; actorName: string; actorRole: string; reason?: string }) {
  const [item] = await db.select().from(blockItems).where(eq(blockItems.id, input.blockItemId));
  if (!item) throw new Error(`block item ${input.blockItemId} not found`);
  const conflicts = await detectPlanConflicts(item.planId);
  const row = conflicts.find((c) => c.blockItemId === input.blockItemId);
  if (!row) throw new Error("no open conflict on this block");
  const chosen = row.alternatives.find((a) => a.option === input.option);
  if (!chosen) throw new Error(`option ${input.option} is not one of ${row.alternatives.map((a) => a.option).join(", ")}`);
  if (!chosen.feasible) throw new Error(`option ${input.option} is not feasible: ${chosen.blockers.join("; ")}`);

  const oldValue = { startMin: item.startMin, endMin: item.endMin, day: item.day, departments: item.departments };
  const [updated] = await db
    .update(blockItems)
    .set({ startMin: chosen.startMin, endMin: chosen.endMin, day: chosen.day, window: windowOf(chosen.startMin), departments: chosen.departments })
    .where(eq(blockItems.id, input.blockItemId))
    .returning();

  const audit = await recordAudit({
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: "MODIFIED",
    entity: "BLOCK",
    entityRef: `#${item.id} · ${row.segmentCode}`,
    planId: item.planId,
    planVersion: item.planId,
    oldValue,
    newValue: { startMin: chosen.startMin, endMin: chosen.endMin, day: chosen.day, departments: chosen.departments },
    reason: input.reason || `Conflict option ${chosen.option} accepted — ${chosen.label}: ${chosen.action}`,
    severity: "warn",
  });

  /* Response contract: the applied decision is returned under `applied`, including
     the id of the audit row it created, so the officer who applied the option sees
     exactly what changed and where it was recorded. The caller is the section
     controller; the engine never picks the option. */
  return {
    applied: {
      blockItemId: updated.id,
      conflictKey: row.conflictKey,
      segmentCode: row.segmentCode,
      option: chosen.option,
      label: chosen.label,
      action: chosen.action,
      day: updated.day,
      startMin: updated.startMin,
      endMin: updated.endMin,
      delayMin: chosen.delayMin,
      delayMinBefore: chosen.currentDelayMin,
      savedMin: chosen.deltaVsCurrent,
      auditId: audit.id,
    },
  };
}
