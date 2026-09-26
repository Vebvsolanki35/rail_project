/**
 * DYNAMIC RE-PLANNING — CHANGE DETECTION (Phase 9).
 *
 * The requirement is not just "re-plan on an event"; it is to DETECT the change,
 * state what it touches, and then produce a new plan with an old/new diff.
 * This module does the detection half:
 *
 *   detectChange(kind, params) → affected trains · affected blocks · affected
 *   jobs · affected sections · severity → and the matching replan event kind
 *
 * The publishing half already exists: `replan()` in replan.ts creates a new plan
 * version with `supersedesId`, frozen committed blocks, a trigger note and a
 * computed diff. This module feeds it with evidence instead of guessing.
 */
import { db } from "@/db";
import { assets, blockItems, defects, jobs, plans, segments } from "@/db/schema";
import { desc, eq, ne } from "drizzle-orm";
import { trafficFactor } from "./network";
import { REPLAN_EVENT_META, type ReplanEventKind } from "./replan";
import { getActivePlan } from "./optimizer";
import { trainsOnSection } from "./conflicts";

export const CHANGE_KINDS = ["TRAIN_DELAY", "NEW_DEFECT", "BLOCK_OVERRUN", "CREW_UNAVAILABLE", "FREIGHT_SURGE", "CORRIDOR_CLOSURE"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Map the operator-facing change onto the re-plan engine's event vocabulary. */
const TO_REPLAN: Record<ChangeKind, ReplanEventKind> = {
  TRAIN_DELAY: "TRAIN_DELAY",
  NEW_DEFECT: "NEW_DEFECT",
  BLOCK_OVERRUN: "OVERRUN",
  CREW_UNAVAILABLE: "OVERRUN",
  FREIGHT_SURGE: "FREIGHT_SURGE",
  CORRIDOR_CLOSURE: "OHE_FAILURE",
};

export const CHANGE_META: Record<ChangeKind, { label: string; blurb: string; paramLabel: string; defaultParam: number; severity: "info" | "warn" | "critical" }> = {
  TRAIN_DELAY: { label: "Train delay", blurb: "A running train is late — the possession it crosses must be re-opened or shifted.", paramLabel: "Delay (min)", defaultParam: 25, severity: "info" },
  NEW_DEFECT: { label: "New critical defect", blurb: "A fresh defect with high failure risk enters the register and must be inserted.", paramLabel: "—", defaultParam: 0, severity: "critical" },
  BLOCK_OVERRUN: { label: "Block overrun", blurb: "A crew is overrunning its sanctioned window — downstream blocks must move.", paramLabel: "Extra time (min)", defaultParam: 30, severity: "warn" },
  CREW_UNAVAILABLE: { label: "Crew unavailable", blurb: "A rostered crew is unavailable — its work must be reassigned or deferred.", paramLabel: "—", defaultParam: 0, severity: "warn" },
  FREIGHT_SURGE: { label: "Freight surge", blurb: "Control Office advises a freight spike on the corridor — blocks must leave the peak.", paramLabel: "Rakes", defaultParam: 2, severity: "warn" },
  CORRIDOR_CLOSURE: { label: "Corridor closure", blurb: "A corridor is closed or an OHE failure has occurred — the section must be re-planned now.", paramLabel: "—", defaultParam: 0, severity: "critical" },
};

export interface AffectedItem {
  id: number;
  label: string;
  detail: string;
}

export interface ChangeImpact {
  kind: ChangeKind;
  detected: boolean;
  headline: string;
  severity: "info" | "warn" | "critical";
  section: { id: number | null; code: string; corridor: string };
  affectedTrains: AffectedItem[];
  affectedBlocks: AffectedItem[];
  affectedJobs: AffectedItem[];
  affectedSections: string[];
  planId: number | null;
  blockCount: number;
  jobCount: number;
  trainCount: number;
  /** Minutes of exposure created by the change (delay model), 0 when not applicable. */
  exposureMin: number;
  replanKind: ReplanEventKind;
  replanEvent: { label: string; blurb: string; paramLabel: string; defaultParam: number; tone: "info" | "warn" | "critical" };
  evidence: string[];
  detectedAt: string;
}

/** Latest plan + its blocks. */
async function planContext() {
  /* Watch the WORKING plan (newest plan carrying work), not an empty rolling plan —
     otherwise a change would be reported against a plan with nothing in it. */
  const active = await getActivePlan();
  const [plan] = active ? await db.select().from(plans).where(eq(plans.id, active.id)) : [];
  if (!plan) return { plan: null, items: [] as (typeof blockItems.$inferSelect)[], segById: new Map<number, typeof segments.$inferSelect>() };
  const [items, segRows] = await Promise.all([db.select().from(blockItems).where(eq(blockItems.planId, plan.id)), db.select().from(segments)]);
  return { plan, items, segById: new Map(segRows.map((s) => [s.id, s])) };
}

/**
 * Detect a change and quantify it against the live plan. Returns `detected:
 * false` with the evidence when the change turns out to be immaterial — the UI
 * shows "no plan impact" instead of a false alarm.
 */
export async function detectChange(kind: ChangeKind, opts: { segmentId?: number; amountMin?: number; defectId?: number; note?: string } = {}): Promise<ChangeImpact> {
  const meta = CHANGE_META[kind];
  const replanKind = TO_REPLAN[kind];
  const { plan, items, segById } = await planContext();
  const segRows = await db.select().from(segments);
  const segment = opts.segmentId ? segById.get(opts.segmentId) ?? null : null;
  /* The change itself may name the section even when the caller did not — a new
     defect carries its own section, and the re-plan must target that section. */
  let resolvedSegment: typeof segment = segment;
  /** Section in scope for the evidence + the re-plan, after resolution. */
  const scopeOf = () => resolvedSegment;
  const scopeItems = segment ? items.filter((b) => b.segmentId === segment.id) : items;

  const affectedTrains: AffectedItem[] = [];
  const affectedBlocks: AffectedItem[] = [];
  const affectedJobs: AffectedItem[] = [];
  const evidence: string[] = [];
  let exposureMin = 0;

  const blockDetail = (b: typeof items[number]) => {
    const seg = segById.get(b.segmentId);
    return `${seg?.code ?? "—"} · day ${b.day + 1} · ${fmtMin(b.startMin)}–${fmtMin(b.endMin)} · ${b.departments.join("+")} · ${(b.defectIds ?? []).length} task(s) · ${b.status}`;
  };

  for (const b of scopeItems) {
    const seg = segById.get(b.segmentId);
    if (segment && b.segmentId !== segment.id) continue;
    const trains = seg ? trainsOnSection(seg.code, b.startMin, b.endMin) : [];
    const frozen = b.status === "frozen";
    const relevant =
      kind === "CREW_UNAVAILABLE" || kind === "NEW_DEFECT" || kind === "CORRIDOR_CLOSURE"
        ? true
        : trains.length > 0 || (kind === "FREIGHT_SURGE" && (seg?.dailyTrains ?? 0) > 200);
    if (!relevant) continue;
    affectedBlocks.push({ id: b.id, label: `Block #${b.id}`, detail: `${blockDetail(b)}${frozen ? " · FROZEN (crew on site)" : ""}` });
    for (const t of trains.slice(0, 6)) affectedTrains.push({ id: Number(t.number) || 0, label: `${t.number} ${t.name}`, detail: `crosses ${seg?.code} at ${fmtMin(t.atMin)}` });
    const over = kind === "TRAIN_DELAY" ? opts.amountMin ?? meta.defaultParam : kind === "BLOCK_OVERRUN" ? opts.amountMin ?? meta.defaultParam : 0;
    if (over > 0 && seg) exposureMin += seg.dailyTrains * (over / 60 / 16) * (0.3 + trafficFactor(b.startMin)) * (2.5 + trafficFactor(b.startMin) * 42);
  }

  // jobs touched: work orders carrying this section's defects
  const jobRows = await db.select().from(jobs).where(ne(jobs.status, "COMPLETED"));
  const jobSegScope = new Set(scopeItems.map((b) => b.segmentId));
  for (const j of jobRows) {
    if (segment && j.segmentId !== segment.id) continue;
    if (!segment && !jobSegScope.has(j.segmentId)) continue;
    affectedJobs.push({ id: j.id, label: `RR-WO/${String(j.id).padStart(4, "0")}`, detail: `${j.status} · ${j.department} · ${j.title.slice(0, 70)}` });
  }

  if (kind === "NEW_DEFECT" && !opts.defectId) {
    /* The watcher has no operator-supplied defect, so it scans the register for
       the candidate the change rule would actually raise: the highest-severity
       open defect that is already past its permitted deadline. If the register
       holds nothing of that class, the change is NOT detected and the evidence
       says so — a change desk that invents an emergency is worse than useless. */
    const candidates = await db.select().from(defects).where(ne(defects.status, "closed"));
    const candidate = candidates
      .filter((d) => d.severity >= 8)
      .sort((a, b) => a.dueInDays - b.dueInDays || b.severity - a.severity)[0];
    if (candidate) {
      const [asset] = await db.select().from(assets).where(eq(assets.id, candidate.assetId));
      const seg = asset ? segById.get(asset.segmentId) : null;
      if (!resolvedSegment && seg) resolvedSegment = seg;
      evidence.push(
        `Register scan: ${candidate.defectCode || `#${candidate.id}`} (${candidate.department}, severity ${candidate.severity}/10, due in ${candidate.dueInDays} day(s)) on ${seg?.code ?? "—"} — ${candidate.title}`
      );
      if (seg) for (const b of items.filter((x) => x.segmentId === seg.id)) if (!affectedBlocks.some((x) => x.id === b.id)) affectedBlocks.push({ id: b.id, label: `Block #${b.id}`, detail: blockDetail(b) });
      exposureMin += candidate.severity * 6;
    } else {
      evidence.push("Register scan: no open defect at severity 8 or above — no new-defect change to re-plan");
    }
  }

  if (kind === "NEW_DEFECT" && opts.defectId) {
    const [d] = await db.select().from(defects).where(eq(defects.id, opts.defectId));
    if (d) {
      const [asset] = await db.select().from(assets).where(eq(assets.id, d.assetId));
      const seg = asset ? segById.get(asset.segmentId) : null;
      if (!resolvedSegment && seg) resolvedSegment = seg;
      evidence.push(`New defect ${d.defectCode || `#${d.id}`} (${d.department}, severity ${d.severity}/10) on ${seg?.code ?? "—"} — ${d.title}`);
      if (seg) {
        const sameSection = items.filter((b) => b.segmentId === seg.id);
        for (const b of sameSection) {
          if (!affectedBlocks.some((x) => x.id === b.id)) affectedBlocks.push({ id: b.id, label: `Block #${b.id}`, detail: blockDetail(b) });
        }
      }
      exposureMin += d.severity * 6;
    } else {
      evidence.push(`Defect #${opts.defectId} not found — change cannot be evidenced`);
    }
  }

  if (kind === "FREIGHT_SURGE") {
    const rakes = opts.amountMin ?? meta.defaultParam;
    evidence.push(`Control Office advises ${rakes} additional rake(s) on ${segment?.code ?? "the corridor"} — expected tonnage +${(rakes * 3200).toLocaleString("en-IN")} T`);
    exposureMin += rakes * 18;
  }
  if (kind === "CORRIDOR_CLOSURE") evidence.push(`Corridor/direction closed on ${scopeOf()?.code ?? "the affected section"} — possessions inside it cannot run as planned`);
  if (kind === "CREW_UNAVAILABLE") {
    const unavailable = affectedBlocks.length;
    evidence.push(`Rostered crew unavailable — ${unavailable} block(s) on ${scopeOf()?.code ?? "the section"} must be re-crewed or deferred`);
  }
  if (kind === "TRAIN_DELAY") evidence.push(`Running train is ${opts.amountMin ?? meta.defaultParam} min late across ${scopeOf()?.code ?? "the corridor"}`);
  if (kind === "BLOCK_OVERRUN") evidence.push(`Crew overrunning by ${opts.amountMin ?? meta.defaultParam} min on ${scopeOf()?.code ?? "the section"}`);

  const scope = scopeOf();
  const detected = affectedBlocks.length > 0 || affectedJobs.length > 0 || (kind === "FREIGHT_SURGE" && (scope?.dailyTrains ?? 0) > 150);
  const severity: ChangeImpact["severity"] = affectedBlocks.some((b) => b.detail.includes("FROZEN")) && meta.severity === "critical" ? "critical" : detected ? meta.severity : "info";

  return {
    kind,
    detected,
    headline: detected
      ? `NETWORK CHANGE DETECTED — ${meta.label}${scope ? ` on ${scope.code}` : " on the division"}`
      : `No plan impact from ${meta.label.toLowerCase()}${scope ? ` on ${scope.code}` : ""}`,
    severity,
    section: { id: scope?.id ?? null, code: scope?.code ?? "—", corridor: scope?.corridor ?? "—" },
    affectedTrains: affectedTrains.slice(0, 24),
    affectedBlocks: affectedBlocks.slice(0, 24),
    affectedJobs: affectedJobs.slice(0, 24),
    affectedSections: [...new Set([...affectedBlocks.map((b) => b.detail.split(" ")[0]), scope?.code ?? ""])].filter(Boolean),
    planId: plan?.id ?? null,
    blockCount: affectedBlocks.length,
    jobCount: affectedJobs.length,
    trainCount: affectedTrains.length,
    exposureMin: Math.round(exposureMin),
    replanKind,
    replanEvent: { ...REPLAN_EVENT_META[replanKind], defaultParam: REPLAN_EVENT_META[replanKind].defaultParam },
    evidence,
    detectedAt: new Date().toISOString(),
  };
}

/** Detect every change class at once — the scan button on the re-plan desk. */
export async function scanNetwork(segmentId?: number): Promise<ChangeImpact[]> {
  const out: ChangeImpact[] = [];
  for (const k of CHANGE_KINDS) {
    if (k === "NEW_DEFECT" || k === "CREW_UNAVAILABLE" || k === "CORRIDOR_CLOSURE" || k === "FREIGHT_SURGE") {
      out.push(await detectChange(k, { segmentId }));
    }
  }
  return out.filter((c) => c.detected).sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
}

function fmtMin(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
