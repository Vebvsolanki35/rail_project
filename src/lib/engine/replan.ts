/**
 * DYNAMIC RE-PLANNING (PS #26027)
 *
 * A block plan is a live document. The moment something changes on the ground —
 * a train loses 20 minutes, a crew overruns, a new defect is found, OHE fails,
 * freight surges, or a sanctioned block is cancelled — the remaining plan must
 * be re-optimised WITHOUT disturbing work already committed.
 *
 * Rules implemented here:
 *  - Blocks whose crews are already on site (job IN_PROGRESS / AWAITING_REVIEW,
 *    or block status `frozen`) are FROZEN: they are carried into the new version
 *    byte-for-byte and never moved.
 *  - Everything else may be shifted, merged, split, cancelled or replaced.
 *  - Every version records `supersedesId` (lineage), `triggerNote` (why) and a
 *    structured `diff` (added / removed / moved / frozen) so the control office
 *    can see exactly what changed and why — full auditability of re-planning.
 */
import { eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { assets, blockItems, defects, events, jobs, plans, segments } from "@/db/schema";
import { getActivePlan, getLatestPlan, getPlanDTO, runOptimizer } from "./optimizer";
import { logLifecycleEvent } from "./defectlifecycle";
import { recordAudit } from "./audittrail";
import { markPlanGenerated } from "./approvals";
import { GOLDEN_CAP, SHOULDER_CAP, coordinatedDowntime, independentDowntime } from "./superblock";
import type { BlockItemDTO, PlanDTO } from "./types";

export const REPLAN_EVENTS = ["TRAIN_DELAY", "OVERRUN", "NEW_DEFECT", "OHE_FAILURE", "FREIGHT_SURGE", "BLOCK_CANCELLED"] as const;
export type ReplanEventKind = (typeof REPLAN_EVENTS)[number];

export const REPLAN_EVENT_META: Record<
  ReplanEventKind,
  { label: string; blurb: string; tone: "info" | "warn" | "critical"; defaultParam: number; paramLabel: string }
> = {
  TRAIN_DELAY: { label: "Train Delay", blurb: "A train is running late — re-open the window it occupies.", tone: "info", defaultParam: 25, paramLabel: "Delay (min)" },
  OVERRUN: { label: "Block Overrun", blurb: "A crew is overrunning its sanctioned window — extend and push the next block.", tone: "warn", defaultParam: 30, paramLabel: "Extra time (min)" },
  NEW_DEFECT: { label: "New Defect Found", blurb: "A fresh defect must be inserted into the live plan.", tone: "warn", defaultParam: 0, paramLabel: "—" },
  OHE_FAILURE: { label: "OHE Failure", blurb: "Traction failure — pull TRD work forward and give the section an emergency block.", tone: "critical", defaultParam: 0, paramLabel: "—" },
  FREIGHT_SURGE: { label: "Freight Surge", blurb: "Freight traffic spike — shift blocks away from the peak.", tone: "warn", defaultParam: 0, paramLabel: "—" },
  BLOCK_CANCELLED: { label: "Block Cancelled", blurb: "A sanctioned block was withdrawn — re-place its tasks.", tone: "info", defaultParam: 0, paramLabel: "—" },
};

const WIN_BOUNDS: Record<string, [number, number]> = { GOLDEN: [30, 300], SHOULDER: [630, 810], OFFPEAK: [0, 1440] };
const WINDOW_CAP: Record<string, number> = { GOLDEN: GOLDEN_CAP, SHOULDER: SHOULDER_CAP, OFFPEAK: 600 };

interface DraftBlock {
  segmentId: number;
  segmentCode: string;
  day: number;
  startMin: number;
  endMin: number;
  departments: string[];
  defectIds: number[];
  isSuperBlock: boolean;
  mode: string;
  window: string;
  delayCostMin: number;
  status: string;
  rationale: string;
}

export function blockSignature(b: { segmentCode: string; day: number; startMin: number; endMin: number }): string {
  const hh = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;
  return `${b.segmentCode} · D${b.day + 1} · ${hh(b.startMin)}–${hh(b.endMin)}`;
}

export function toDraft(b: BlockItemDTO, status = "proposed", rationale = ""): DraftBlock {
  return {
    segmentId: b.segmentId,
    segmentCode: b.segmentCode,
    day: b.day,
    startMin: b.startMin,
    endMin: b.endMin,
    departments: b.departments,
    defectIds: [],
    isSuperBlock: b.isSuperBlock,
    mode: b.mode,
    window: b.window,
    delayCostMin: b.delayCostMin,
    status,
    rationale,
  };
}

export interface ReplanDiff {
  added: string[];
  removed: string[];
  moved: string[];
  frozen: string[];
  note: string;
}

export function diffPlans(before: DraftBlock[], after: DraftBlock[]): ReplanDiff {
  const sig = (b: DraftBlock) => blockSignature(b);
  const beforeMap = new Map(before.map((b) => [sig(b), b]));
  const afterMap = new Map(after.map((b) => [sig(b), b]));

  const added: string[] = [];
  const removed: string[] = [];
  const moved: string[] = [];
  const frozen: string[] = [];

  for (const [s, b] of afterMap) if (!beforeMap.has(s)) added.push(`${s}${b.isSuperBlock ? " (super-block)" : ""}`);
  for (const [s, b] of beforeMap) if (!afterMap.has(s)) removed.push(`${s} — ${b.defectIds.length} task(s) re-placed`);

  // A "move" is the same task set appearing at a different time/section.
  const keyOf = (b: DraftBlock) => [...b.defectIds].sort((x, y) => x - y).join(",");
  const beforeByTasks = new Map(before.filter((b) => b.defectIds.length).map((b) => [keyOf(b), b]));
  for (const b of after) {
    if (b.defectIds.length === 0 || beforeMap.has(sig(b))) continue;
    const prev = beforeByTasks.get(keyOf(b));
    if (prev) moved.push(`${keyOf(b).split(",").length} task(s): ${sig(prev)} → ${sig(b)}`);
  }
  for (const b of after) if (b.status === "frozen") frozen.push(`${sig(b)} — crew committed, untouched`);

  return {
    added,
    removed,
    moved,
    frozen,
    note: `${added.length} added · ${removed.length} removed · ${moved.length} moved · ${frozen.length} frozen`,
  };
}

function placeInWindow(segment: { dailyTrains: number }, duration: number, preferred: string): { startMin: number; endMin: number; window: string } {
  const order = preferred === "GOLDEN" ? ["GOLDEN", "OFFPEAK", "SHOULDER"] : preferred === "SHOULDER" ? ["SHOULDER", "OFFPEAK", "GOLDEN"] : ["OFFPEAK", "GOLDEN", "SHOULDER"];
  for (const w of order) {
    const cap = WINDOW_CAP[w] ?? GOLDEN_CAP;
    if (duration > cap) continue;
    const [ws, we] = WIN_BOUNDS[w] ?? [0, 1440];
    // scan start times, keep the cheapest occupancy for this section
    let bestStart = ws;
    let bestCost = Number.MAX_VALUE;
    for (let s = ws; s + duration <= we; s += 15) {
      const mid = (s + s + duration) / 2;
      const tf = mid >= 60 && mid <= 300 ? 0.25 : mid >= 630 && mid <= 810 ? 0.55 : 0.95;
      const cost = segment.dailyTrains * ((duration / 60) / 16) * (0.3 + tf) * (2.5 + tf * 42);
      if (cost < bestCost) {
        bestCost = cost;
        bestStart = s;
      }
    }
    return { startMin: bestStart, endMin: bestStart + duration, window: w };
  }
  const [ws] = WIN_BOUNDS.OFFPEAK;
  return { startMin: ws, endMin: ws + duration, window: "OFFPEAK" };
}

export interface ReplanResult {
  plan: PlanDTO;
  supersedes: number | null;
  trigger: ReplanEventKind;
  triggerNote: string;
  diff: ReplanDiff;
  frozenCount: number;
  log: string[];
}

/**
 * Re-plan the latest version in response to a live event.
 */
export async function replan(input: {
  kind: ReplanEventKind;
  segmentId?: number;
  blockItemId?: number;
  defectId?: number;
  amountMin?: number;
  note?: string;
  actor?: { name: string; role: string };
}): Promise<ReplanResult> {
  const actor = input.actor ?? { name: "Control Office", role: "CONTROL" };
  const meta = REPLAN_EVENT_META[input.kind];
  const log: string[] = [];

  /* Base the new version on the plan that holds the work — never on an empty
     rolling plan that happens to be newer. */
  let latest = await getActivePlan();
  if (!latest) {
    const first = await runOptimizer("WEEKLY");
    latest = first.plan;
    log.push("No plan existed — generated a baseline weekly plan before re-planning.");
  }
  const oldPlanId = latest.id;

  const [segRows, assetRows, activeJobs] = await Promise.all([
    db.select().from(segments),
    db.select().from(assets),
    db.select().from(jobs).where(inArray(jobs.status, ["IN_PROGRESS", "AWAITING_REVIEW"])),
  ]);
  const segById = new Map(segRows.map((s) => [s.id, s]));
  const committedSegments = new Set(activeJobs.map((j) => j.segmentId));

  // Raw block rows of the current version (we need defectIds).
  const rawItems = await db.select().from(blockItems).where(eq(blockItems.planId, oldPlanId));
  const before: DraftBlock[] = rawItems.map((b) => ({
    segmentId: b.segmentId,
    segmentCode: segById.get(b.segmentId)?.code ?? "?",
    day: b.day,
    startMin: b.startMin,
    endMin: b.endMin,
    departments: b.departments,
    defectIds: b.defectIds,
    isSuperBlock: b.isSuperBlock,
    mode: b.mode,
    window: b.window,
    delayCostMin: b.delayCostMin,
    status: b.status,
    rationale: b.rationale,
  }));

  const frozen = before.filter((b) => b.status === "frozen" || committedSegments.has(b.segmentId));
  const frozenSignatures = new Set(frozen.map((b) => blockSignature(b)));
  let working: DraftBlock[] = before.map((b) => (frozenSignatures.has(blockSignature(b)) ? { ...b, status: "frozen", rationale: b.rationale || "Crew committed on site — frozen during re-planning." } : { ...b, status: "proposed" }));
  log.push(`${frozen.length} block(s) frozen (crew committed${committedSegments.size ? ` on ${[...committedSegments].map((id) => segById.get(id)?.code ?? id).join(", ")}` : ""})`);

  const targetSegments = input.segmentId
    ? [input.segmentId]
    : input.kind === "FREIGHT_SURGE"
      ? segRows.filter((s) => s.dailyTrains >= 240).map((s) => s.id)
      : [];

  const isTarget = (b: DraftBlock) => b.status !== "frozen" && (targetSegments.length === 0 || targetSegments.includes(b.segmentId));

  /* ---------------- event-specific transformations ---------------- */

  if (input.kind === "TRAIN_DELAY") {
    const shift = input.amountMin ?? meta.defaultParam;
    let n = 0;
    working = working.map((b) => {
      if (!isTarget(b)) return b;
      const dur = b.endMin - b.startMin;
      const [ws, we] = WIN_BOUNDS[b.window] ?? [0, 1440];
      if (b.startMin + shift + dur > we) {
        const placed = placeInWindow(segById.get(b.segmentId)!, dur, b.window === "GOLDEN" ? "OFFPEAK" : "SHOULDER");
        n += 1;
        return { ...b, day: Math.min(b.day + 1, latest!.blocks.length ? Math.max(...latest!.blocks.map((x) => x.day)) : b.day + 1), ...placed, rationale: `Shifted +${shift} min by train delay and re-placed in ${placed.window} — the ${b.window} window no longer fits.` };
      }
      n += 1;
      return { ...b, startMin: b.startMin + shift, endMin: b.endMin + shift, rationale: `Shifted +${shift} min by train delay; still inside the ${b.window} window (${ws}–${we} min).` };
    });
    log.push(`${n} block(s) shifted by ${shift} min for the delayed train`);
  }

  if (input.kind === "OVERRUN") {
    const extra = input.amountMin ?? meta.defaultParam;
    let extended = 0;
    let pushed = 0;
    const segId = input.segmentId ?? working.find((b) => b.status === "frozen")?.segmentId;
    working = working.map((b) => {
      if (b.segmentId !== segId) return b;
      if (b.status === "frozen" || activeJobs.some((j) => j.segmentId === b.segmentId)) {
        extended += 1;
        return { ...b, endMin: b.endMin + extra, status: "frozen", rationale: `Overrun: sanctioned window extended by ${extra} min; crew still on site, block remains frozen.` };
      }
      pushed += 1;
      return { ...b, startMin: b.startMin + extra, endMin: b.endMin + extra, rationale: `Pushed +${extra} min — the preceding block overran its window.` };
    });
    log.push(`Overrun of +${extra} min: ${extended} committed block extended, ${pushed} downstream block(s) pushed`);
  }

  if (input.kind === "NEW_DEFECT" || input.kind === "OHE_FAILURE") {
    const targetSeg = input.segmentId ?? segById.get(working[0]?.segmentId ?? 0)?.id ?? segRows[0]?.id;
    if (targetSeg) {
      const seg = segById.get(targetSeg)!;
      const defectList = await db.select().from(defects).where(ne(defects.status, "closed"));
      const assetIds = new Set(assetRows.filter((a) => a.segmentId === targetSeg).map((a) => a.id));
      const pool = defectList.filter((d) => assetIds.has(d.assetId));
      const chosen = input.defectId ? pool.find((d) => d.id === input.defectId) : pool.sort((a, b) => b.severity - a.severity)[0];
      if (chosen) {
        // merge into an existing non-frozen block on the section when it fits
        const host = working.find((b) => b.segmentId === targetSeg && b.status !== "frozen" && b.endMin - b.startMin + chosen.durationMin + 8 <= (WINDOW_CAP[b.window] ?? GOLDEN_CAP));
        if (host) {
          working = working.map((b) =>
            b === host
              ? {
                  ...b,
                  endMin: b.endMin + chosen.durationMin + 8,
                  defectIds: [...b.defectIds, chosen.id],
                  departments: [...new Set([...b.departments, chosen.department])].sort(),
                  isSuperBlock: new Set([...b.departments, chosen.department]).size >= 2,
                  rationale: `Absorbed ${chosen.title} (+${chosen.durationMin} min) into an existing ${b.window} occupancy — no extra setup, no second block.`,
                }
              : b
          );
          log.push(`${chosen.title} absorbed into an existing block on ${seg.code} (+${chosen.durationMin} min, no extra section occupancy)`);
        } else {
          const placed = placeInWindow(seg, chosen.durationMin + 15, input.kind === "OHE_FAILURE" ? "GOLDEN" : "SHOULDER");
          working.push({
            segmentId: targetSeg,
            segmentCode: seg.code,
            day: 0,
            ...placed,
            departments: [chosen.department],
            defectIds: [chosen.id],
            isSuperBlock: false,
            mode: "physical",
            delayCostMin: Math.round(seg.dailyTrains * 0.6),
            status: "proposed",
            rationale:
              input.kind === "OHE_FAILURE"
                ? `Emergency TRD block created after the OHE failure on ${seg.code} — traction work must not wait for the next cycle.`
                : `New block created for ${chosen.title} — no existing occupancy on ${seg.code} had capacity.`,
          });
          log.push(
            input.kind === "OHE_FAILURE"
              ? `Emergency TRD block created on ${seg.code} in the ${placed.window} window`
              : `New block created for ${chosen.title} on ${seg.code} in the ${placed.window} window`
          );
        }
      }
    }
  }

  if (input.kind === "FREIGHT_SURGE") {
    let shifted = 0;
    working = working.map((b) => {
      if (!isTarget(b)) return b;
      const seg = segById.get(b.segmentId)!;
      const dur = b.endMin - b.startMin;
      if (b.window === "OFFPEAK") return b;
      const placed = placeInWindow(seg, dur, "OFFPEAK");
      shifted += 1;
      return { ...b, day: b.day + 1, ...placed, rationale: `Moved out of the ${b.window} window into OFFPEAK — freight surge on ${seg.corridor} (${seg.dailyTrains} trains/day).` };
    });
    log.push(`${shifted} block(s) moved to OFFPEAK windows to clear the freight surge`);
  }

  if (input.kind === "BLOCK_CANCELLED") {
    // Locate the withdrawn block: explicit id, else the first movable block.
    const rawVictim = input.blockItemId ? rawItems.find((r) => r.id === input.blockItemId) : rawItems.find((r) => r.status !== "frozen");
    if (rawVictim) {
      const sig = blockSignature({ segmentCode: segById.get(rawVictim.segmentId)?.code ?? "?", day: rawVictim.day, startMin: rawVictim.startMin, endMin: rawVictim.endMin });
      const seg = segById.get(rawVictim.segmentId)!;
      const orphanTasks = rawVictim.defectIds;
      working = working.filter((b) => blockSignature(b) !== sig);
      // re-place the orphaned tasks into OFFPEAK (they lost their sanctioned slot)
      if (orphanTasks.length > 0) {
        const defectRows = await db.select().from(defects).where(inArray(defects.id, orphanTasks));
        const duration = Math.max(20, independentDowntime(defectRows.map((d) => ({ durationMin: d.durationMin }))));
        const placed = placeInWindow(seg, Math.min(duration, WINDOW_CAP.OFFPEAK), "OFFPEAK");
        working.push({
          segmentId: seg.id,
          segmentCode: seg.code,
          day: rawVictim.day + 1,
          ...placed,
          departments: [...new Set(defectRows.map((d) => d.department))].sort(),
          defectIds: orphanTasks,
          isSuperBlock: new Set(defectRows.map((d) => d.department)).size >= 2,
          mode: rawVictim.mode,
          delayCostMin: Math.round(rawVictim.delayCostMin * 1.15),
          status: "proposed",
          rationale: `Re-placed after the ${sig} block was cancelled — tasks moved to the next OFFPEAK window.`,
        });
        log.push(`Cancelled ${sig} — ${orphanTasks.length} task(s) re-placed in the ${placed.window} window`);
        for (const id of orphanTasks) {
          await logLifecycleEvent({
            defectId: id,
            fromStage: "BLOCK_PLANNED",
            toStage: "BLOCK_PLANNED",
            actor: actor.name,
            actorRole: actor.role,
            note: `Re-planned: the block ${sig} was cancelled; task moved to a new window.`,
          });
        }
      }
    }
  }

  /* ---------------- KPI recomputation ---------------- */

  const allDefectRows = await db.select().from(defects).where(ne(defects.status, "closed"));
  const defectById = new Map(allDefectRows.map((d) => [d.id, d]));
  const scheduledIds = new Set(working.flatMap((b) => b.defectIds));
  const optimMin = working.reduce((s, b) => s + (b.endMin - b.startMin), 0);
  const baselineMin = [...scheduledIds].reduce((s, id) => {
    const d = defectById.get(id);
    return s + (d ? d.durationMin + 40 : 0);
  }, 0);
  const superMin = working.filter((b) => b.isSuperBlock).reduce((s, b) => s + (b.endMin - b.startMin), 0);
  const totalDelay = working.reduce((s, b) => s + b.delayCostMin, 0);
  const estAffected = working.reduce((s, b) => s + Math.max(1, segById.get(b.segmentId)?.dailyTrains ?? 40) * ((b.endMin - b.startMin) / 60 / 16), 0);
  const resiliencePenalty = meta.tone === "critical" ? 9 : meta.tone === "warn" ? 5 : 2;
  const resilience = Math.max(40, Math.round(((latest.resilienceScore || 72) - resiliencePenalty) * 10) / 10);

  const kpis: Record<string, number> = {
    ...latest.kpis,
    downtimeBaselineH: Math.round((baselineMin / 60) * 10) / 10,
    downtimeOptimizedH: Math.round((optimMin / 60) * 10) / 10,
    reductionPct: Math.round((1 - optimMin / Math.max(baselineMin, 1)) * 100),
    bundlingPct: Math.round((superMin / Math.max(optimMin, 1)) * 100),
    blocks: working.length,
    superBlocks: working.filter((b) => b.isSuperBlock).length,
    avgDelayMin: Math.round((totalDelay / Math.max(estAffected, 1)) * 10) / 10,
    defectsCleared: scheduledIds.size,
    replanCount: (latest.kpis.replanCount ?? 0) + 1,
    frozenBlocks: working.filter((b) => b.status === "frozen").length,
  };

  const triggerNote = `${meta.label}${input.amountMin ? ` (${input.amountMin} min)` : ""}${input.segmentId ? ` on ${segById.get(input.segmentId)?.code ?? input.segmentId}` : ""}${input.note ? ` — ${input.note}` : ""}`;

  /* ---------------- persist the new version ---------------- */

  const [newPlan] = await db
    .insert(plans)
    .values({
      name: `${latest.name.replace(/ · revised \d+.*$/, "")}${latest.horizon === "ROLLING" ? "" : ""} · revised ${new Date().toISOString().slice(11, 16)}`,
      horizon: latest.horizon,
      resilienceScore: resilience,
      kpis,
      supersedesId: oldPlanId,
      triggerNote,
      diff: null,
    })
    .returning();

  /* A re-planned version is a NEW plan: it supersedes the approved one on the
     planning side, but it carries no human approval of its own. The decision
     state is reset here so the new version must clear technical review → section
     controller → DRM before any block from it can be authorised. */
  await markPlanGenerated(newPlan.id, `Plan #${newPlan.id} re-planned (supersedes #${oldPlanId}) — ${triggerNote.slice(0, 140)}`);

  if (working.length > 0) {
    await db.insert(blockItems).values(
      working.map((b) => ({
        planId: newPlan.id,
        segmentId: b.segmentId,
        day: b.day,
        startMin: b.startMin,
        endMin: b.endMin,
        departments: b.departments,
        defectIds: b.defectIds,
        isSuperBlock: b.isSuperBlock,
        mode: b.mode,
        window: b.window,
        delayCostMin: b.delayCostMin,
        status: b.status,
        rationale: b.rationale,
      }))
    );
  }

  // Supersede the previous version's movable blocks; frozen ones remain meaningful.
  if (rawItems.length > 0) {
    await db
      .update(blockItems)
      .set({ status: "superseded" })
      .where(eq(blockItems.planId, oldPlanId));
  }

  const diff = diffPlans(before, working);
  await db.update(plans).set({ diff }).where(eq(plans.id, newPlan.id));

  await db.insert(events).values({
    kind: meta.tone === "critical" ? "critical" : "ai",
    message: `DYNAMIC RE-PLAN (${meta.label}): version #${newPlan.id} supersedes #${oldPlanId} — ${diff.note}. Trigger: ${triggerNote}. Committed blocks kept frozen; ${kpis.blocks} blocks, downtime ${kpis.downtimeOptimizedH} h (↓${kpis.reductionPct}%)`,
  });

  /* Phase 15 — the re-plan is an auditable act, with the old and new version,
     the frozen commitments and the computed diff recorded in one row. */
  await recordAudit({
    actorName: input.actor?.name ?? "Control Office",
    actorRole: input.actor?.role ?? "CONTROL",
    action: "AI_REPLANNED",
    entity: "PLAN",
    entityRef: `P${newPlan.id}`,
    planId: newPlan.id,
    planVersion: newPlan.id,
    oldValue: { planId: oldPlanId, blocks: before.length },
    newValue: { planId: newPlan.id, blocks: working.length, added: diff.added, removed: diff.removed, moved: diff.moved, frozen: diff.frozen },
    reason: `${triggerNote} — ${diff.note}`,
    severity: meta.tone === "critical" ? "critical" : "warn",
  });

  const plan = await getPlanDTO(newPlan.id);
  return { plan, supersedes: oldPlanId, trigger: input.kind, triggerNote, diff, frozenCount: working.filter((b) => b.status === "frozen").length, log };
}

/** Plan version history with lineage, newest first. */
export async function planHistory(limit = 8) {
  const rows = await db.select().from(plans).orderBy(plans.id);
  return rows
    .slice(-limit)
    .reverse()
    .map((p) => ({
      id: p.id,
      name: p.name,
      horizon: p.horizon,
      createdAt: p.createdAt.toISOString(),
      supersedesId: p.supersedesId,
      triggerNote: p.triggerNote,
      diff: p.diff,
      resilienceScore: p.resilienceScore,
      kpis: p.kpis,
    }));
}
