/**
 * SUPER BLOCK INTELLIGENCE (PS #26027)
 *
 * A "super block" bundles maintenance tasks from several departments (ENG/TRD/SNT)
 * into ONE corridor occupancy. The problem statement's core efficiency claim is
 * exactly this: coordinating blocks maximises asset availability.
 *
 * This module answers three operational questions:
 *
 *  1. QUEUE OPPORTUNITIES — which open defects on the SAME section can be
 *     coordinated, and how much downtime does that actually save?
 *       independent  (today's manual practice) = Σ (task duration + 40 min setup)
 *       coordinated  (Rail Rakshak super block) = packWaves(...) + 15 min first
 *                                                setup + 8 min spacing per wave
 *  2. PLANNED SUPER BLOCKS — what the optimizer already bundled.
 *  3. SPLIT-BLOCK ANALYSIS — the reverse waste: one section blocked on several
 *     nearby days because tasks arrived separately; merging them frees a window.
 *
 * Every opportunity carries a transparent FEASIBILITY score with the sub-weights
 * 25 / 15 / 25 / 20 / 15 and COMPUTED rejection reasons (window caps, dense-corridor
 * restrictions, minimum block interval, no cross-department gain). Nothing is
 * "rejected" without a stated reason.
 */
import { trafficFactor } from "./network";
import type { BlockItemDTO } from "./types";

/* ------------------------------------------------------------------ */
/*  Window model — shared with the optimizer                           */
/* ------------------------------------------------------------------ */

export const GOLDEN_START = 30; // 00:30 — the classic traffic vacuum
export const GOLDEN_CAP = 215; // max block minutes inside 00:30–04:30
export const SHOULDER_START = 645; // 10:45 — post-peak shoulder
export const SHOULDER_CAP = 150;
/** Standalone-block setup/mobilization overhead used by the manual baseline. */
export const SETUP_MIN = 40;
/** First-wave setup + per-wave spacing inside a coordinated super block. */
export const FIRST_WAVE_SETUP_MIN = 15;
export const WAVE_SPACING_MIN = 8;
/** Corridors above this many trains/day are "dense": only the low-impact window. */
export const DENSE_TRAINS_PER_DAY = 240;
/** Minimum interval before the same section may be blocked again (days). */
export const MIN_BLOCK_INTERVAL_DAYS = 7;

export const FEASIBILITY_WEIGHTS = {
  windowFit: 25,
  trafficImpact: 25,
  safetyCriticality: 20,
  resourceReadiness: 15,
  maintenanceRecency: 15,
} as const;

/* ------------------------------------------------------------------ */
/*  Crew-wave packing (one crew per department per wave)               */
/* ------------------------------------------------------------------ */

export interface Wave {
  duration: number;
  depts: Set<string>;
  ids: number[];
}

/**
 * Pack tasks into sequential waves where no department runs twice in a wave.
 * Departments execute in parallel inside a wave, so the wave lasts as long as
 * its longest task.
 */
export function packWaves(ds: { id: number; department: string; durationMin: number }[]): { waves: Wave[]; total: number } {
  const sorted = [...ds].sort((a, b) => b.durationMin - a.durationMin);
  const waves: Wave[] = [];
  for (const t of sorted) {
    const w = waves.find((wave) => !wave.depts.has(t.department));
    if (w) {
      w.depts.add(t.department);
      w.ids.push(t.id);
      w.duration = Math.max(w.duration, t.durationMin);
    } else {
      waves.push({ duration: t.durationMin, depts: new Set([t.department]), ids: [t.id] });
    }
  }
  const total = waves.reduce((s, w) => s + w.duration, 0);
  return { waves, total };
}

/** Σ (duration + standalone setup) — the manual, one-task-per-block baseline. */
export function independentDowntime(defects: { durationMin: number }[]): number {
  return defects.reduce((s, d) => s + d.durationMin + SETUP_MIN, 0);
}

/** Sequential waves + first setup + per-wave spacing — the coordinated plan. */
export function coordinatedDowntime(defects: { id: number; department: string; durationMin: number }[]): { totalMin: number; waves: Wave[] } {
  const { waves, total } = packWaves(defects);
  const totalMin = total <= 0 ? 0 : total + FIRST_WAVE_SETUP_MIN + WAVE_SPACING_MIN * Math.max(0, waves.length - 1);
  return { totalMin, waves };
}

/* ------------------------------------------------------------------ */
/*  Inputs / outputs                                                   */
/* ------------------------------------------------------------------ */

export interface SBDefectInput {
  id: number;
  title: string;
  department: string;
  durationMin: number;
  severity: number;
  dueInDays: number;
  assetHealth: number;
  isLongTerm?: boolean;
}

export interface SBCandidate {
  segmentId: number;
  segmentCode: string;
  corridor: string;
  dailyTrains: number;
  criticality: number;
  isBridge: boolean;
  isLevelCrossing: boolean;
  /** Days since this section was last blocked, when known. */
  lastBlockedDaysAgo: number | null;
  defects: SBDefectInput[];
}

export interface FeasibilityFactor {
  key: string;
  label: string;
  weight: number; // 25/25/20/15/15
  pct: number; // 0–100
  note: string;
}

export interface SBOpportunity {
  id: string;
  segmentId: number;
  segmentCode: string;
  corridor: string;
  /** Trains/day on the section — drives the traffic-impact factor. */
  dailyTrains: number;
  isBridge: boolean;
  isLevelCrossing: boolean;
  lastBlockedDaysAgo: number | null;
  departments: string[];
  defectCount: number;
  defects: SBDefectInput[];
  independentMin: number;
  coordinatedMin: number;
  savingMin: number;
  savingPct: number;
  waves: number;
  window: "GOLDEN" | "SHOULDER" | "OFFPEAK";
  feasibility: {
    score: number;
    factors: FeasibilityFactor[];
    reasons: string[];
    decision: "RECOMMEND" | "CONDITIONAL" | "REJECT";
    recommendation: string;
  };
}

export interface SplitFinding {
  segmentId: number;
  segmentCode: string;
  blocks: { id: number; day: number; startMin: number; endMin: number; defectCount: number; isSuperBlock: boolean }[];
  mergeSavingMin: number;
  note: string;
}

/* ------------------------------------------------------------------ */
/*  Feasibility                                                        */
/* ------------------------------------------------------------------ */

function clamp(v: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, v));
}

export function feasibility(cand: SBCandidate, coordinatedMin: number, waveCount: number, departments: string[]) {
  const factors: FeasibilityFactor[] = [];
  const reasons: string[] = [];

  /* 1. Window fit — does the coordinated block fit a sanctioned window? (25) */
  let window: SBOpportunity["window"] = "GOLDEN";
  let windowPct = 0;
  let windowNote = "";
  if (coordinatedMin <= GOLDEN_CAP) {
    windowPct = coordinatedMin <= GOLDEN_CAP * 0.75 ? 100 : 82;
    windowNote = `Fits the GOLDEN vacuum (00:30–04:30, cap ${GOLDEN_CAP} min) with ${GOLDEN_CAP - coordinatedMin} min headroom`;
  } else if (coordinatedMin <= SHOULDER_CAP) {
    window = "SHOULDER";
    windowPct = 68;
    windowNote = `Too long for GOLDEN (${coordinatedMin} > ${GOLDEN_CAP} min) — fits the SHOULDER window 10:45–13:15 (cap ${SHOULDER_CAP} min)`;
    reasons.push(`Coordinated block is ${coordinatedMin} min — exceeds the GOLDEN cap of ${GOLDEN_CAP} min`);
  } else {
    window = "OFFPEAK";
    windowPct = 42;
    windowNote = `Requires an extended OFFPEAK block (${coordinatedMin} min) beyond the sanctioned GOLDEN/SHOULDER caps`;
    reasons.push(`Exceeds the SHOULDER cap of ${SHOULDER_CAP} min — needs a rare extended OFFPEAK window or splitting into two blocks`);
  }
  factors.push({ key: "windowFit", label: "Window Fit", weight: FEASIBILITY_WEIGHTS.windowFit, pct: windowPct, note: windowNote });

  /* 2. Traffic impact — how many trains does this occupancy expose? (25) */
  const tf = trafficFactor(GOLDEN_START + coordinatedMin / 2);
  const impacted = Math.round(cand.dailyTrains * ((coordinatedMin / 60) / 16) * (0.3 + tf));
  let trafficPct = clamp(100 - impacted * 1.6);
  let trafficNote = `${impacted} trains exposed inside the coordinated occupancy (${cand.dailyTrains} trains/day on ${cand.corridor})`;
  if (cand.dailyTrains >= DENSE_TRAINS_PER_DAY) {
    trafficPct = Math.min(trafficPct, 45);
    trafficNote = `Dense corridor: ${cand.dailyTrains} trains/day — only the low-impact 00:30–04:30 window is viable`;
    reasons.push(`Section carries ${cand.dailyTrains} trains/day (≥ ${DENSE_TRAINS_PER_DAY}) — restrict the super block to the low-impact 00:30–04:30 window`);
  }
  if (cand.isLevelCrossing && window !== "GOLDEN") {
    trafficPct = Math.min(trafficPct, 55);
    trafficNote += "; level crossing inside the section — DTP red-zone rules apply outside the GOLDEN window";
    reasons.push("Level crossing inside the section — road-traffic restrictions (DTP red zone) apply outside the GOLDEN window");
  }
  if (cand.isBridge) {
    trafficNote += "; bridge section — single point of failure, keep the occupancy short";
  }
  factors.push({ key: "trafficImpact", label: "Traffic Impact", weight: FEASIBILITY_WEIGHTS.trafficImpact, pct: Math.round(trafficPct), note: trafficNote });

  /* 3. Safety criticality — is this work worth a coordinated window? (20) */
  const maxSeverity = Math.max(...cand.defects.map((d) => d.severity));
  const minHealth = Math.min(...cand.defects.map((d) => d.assetHealth));
  const overdue = cand.defects.filter((d) => d.dueInDays <= 0).length;
  const safetyPct = clamp(maxSeverity * 8 + (100 - minHealth) * 0.5 + overdue * 6);
  factors.push({
    key: "safetyCriticality",
    label: "Safety Criticality",
    weight: FEASIBILITY_WEIGHTS.safetyCriticality,
    pct: Math.round(safetyPct),
    note: `Peak severity ${maxSeverity}/10, weakest asset health ${Math.round(minHealth)}/100, ${overdue} task(s) past deadline`,
  });

  /* 4. Resource readiness — cross-department bundling is the whole point. (15) */
  const deptCount = departments.length;
  let resourcePct = deptCount >= 3 ? 100 : deptCount === 2 ? 85 : 45;
  let resourceNote = `${deptCount} department(s) in one occupancy (${departments.join(" + ") || "—"}) across ${waveCount} crew wave(s)`;
  if (deptCount === 1) {
    resourceNote += " — single department, no coordination gain over a normal block";
    reasons.push(`All ${cand.defects.length} task(s) belong to ${departments[0] ?? "one department"} — no cross-department bundling gain`);
  }
  if (waveCount > 2) {
    resourcePct -= 15;
    resourceNote += "; more than two sequential waves — crew availability across the whole occupancy must be confirmed";
  }
  if (cand.defects.some((d) => d.isLongTerm)) {
    resourceNote += "; includes long-term maintenance work sized for an extended window";
  }
  factors.push({ key: "resourceReadiness", label: "Resource Readiness", weight: FEASIBILITY_WEIGHTS.resourceReadiness, pct: clamp(resourcePct), note: resourceNote });

  /* 5. Maintenance recency — don't re-block a section we just occupied. (15) */
  let recencyPct = 100;
  let recencyNote = "Section has no recent block on record";
  if (cand.lastBlockedDaysAgo != null) {
    const d = cand.lastBlockedDaysAgo;
    recencyPct = d >= 30 ? 92 : d >= 14 ? 78 : d >= MIN_BLOCK_INTERVAL_DAYS ? 55 : 18;
    recencyNote = `Section last blocked ${d} day(s) ago`;
    if (d < MIN_BLOCK_INTERVAL_DAYS) {
      recencyNote += ` — below the ${MIN_BLOCK_INTERVAL_DAYS}-day minimum interval`;
      reasons.push(`Section was blocked ${d} day(s) ago — minimum block interval of ${MIN_BLOCK_INTERVAL_DAYS} days not met`);
    }
  }
  factors.push({ key: "maintenanceRecency", label: "Maintenance Recency", weight: FEASIBILITY_WEIGHTS.maintenanceRecency, pct: recencyPct, note: recencyNote });

  /* A clean recommendation still has to justify itself: when nothing blocked the
   * bundle we state the positive case instead of showing an empty reason list. */
  if (reasons.length === 0) {
    const saving = independentDowntime(cand.defects) - coordinatedMin;
    reasons.push(
      `${departments.length} discipline(s) bundled on ${cand.segmentCode} — ${coordinatedMin} min of combined occupancy in the ${window} window saves ${saving} min of separate blocks (${Math.round((saving / Math.max(1, independentDowntime(cand.defects))) * 100)}% of the section's downtime)`
    );
  }

  const score = Math.round(factors.reduce((s, f) => s + f.pct * (f.weight / 100), 0));
  const decision: SBOpportunity["feasibility"]["decision"] = score >= 70 ? "RECOMMEND" : score >= 50 ? "CONDITIONAL" : "REJECT";
  const recommendation =
    decision === "RECOMMEND"
      ? `Coordinate in the ${window} window — ${coordinatedMin} min single occupancy instead of ${independentDowntime(cand.defects)} min of separate blocks.`
      : decision === "CONDITIONAL"
        ? `Feasible with conditions: place it in the ${window} window and confirm crew availability for ${waveCount} wave(s).`
        : `Do not coordinate yet — ${reasons[0] ?? "feasibility is too low"}. Schedule the highest-severity task alone for now.`;

  return { score, factors, reasons, decision, recommendation, window };
}

/* ------------------------------------------------------------------ */
/*  Opportunity discovery                                              */
/* ------------------------------------------------------------------ */

export function analyzeSuperBlocks(candidates: SBCandidate[]): SBOpportunity[] {
  const out: SBOpportunity[] = [];
  for (const cand of candidates) {
    if (cand.defects.length < 2) continue;
    const independentMin = independentDowntime(cand.defects);
    const { totalMin, waves } = coordinatedDowntime(cand.defects);
    const departments = [...new Set(cand.defects.map((d) => d.department))].sort();
    const savingMin = Math.max(0, independentMin - totalMin);
    const f = feasibility(cand, totalMin, waves.length, departments);
    if (savingMin <= 0 && f.decision === "REJECT") continue;
    out.push({
      id: `SB-${cand.segmentCode}`,
      segmentId: cand.segmentId,
      segmentCode: cand.segmentCode,
      corridor: cand.corridor,
      dailyTrains: cand.dailyTrains,
      isBridge: cand.isBridge,
      isLevelCrossing: cand.isLevelCrossing,
      lastBlockedDaysAgo: cand.lastBlockedDaysAgo,
      departments,
      defectCount: cand.defects.length,
      defects: [...cand.defects].sort((a, b) => b.severity - a.severity || a.dueInDays - b.dueInDays),
      independentMin,
      coordinatedMin: totalMin,
      savingMin,
      savingPct: independentMin > 0 ? Math.round((savingMin / independentMin) * 100) : 0,
      waves: waves.length,
      window: f.window,
      feasibility: { score: f.score, factors: f.factors, reasons: f.reasons, decision: f.decision, recommendation: f.recommendation },
    });
  }
  return out.sort(
    (a, b) => b.savingMin - a.savingMin || b.feasibility.score - a.feasibility.score
  );
}

/* ------------------------------------------------------------------ */
/*  Split-block analysis — the opposite of coordination                */
/* ------------------------------------------------------------------ */

/**
 * The existing plan sometimes blocks the same section on two nearby days
 * because tasks arrived in separate batches. Those are exactly the windows a
 * super block would have freed.
 */
export function splitBlockAnalysis(blocks: BlockItemDTO[], maxGapDays = 3): SplitFinding[] {
  const bySeg = new Map<number, BlockItemDTO[]>();
  for (const b of blocks) {
    const list = bySeg.get(b.segmentId) ?? [];
    list.push(b);
    bySeg.set(b.segmentId, list);
  }
  const findings: SplitFinding[] = [];
  for (const [segmentId, list] of bySeg) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.day - b.day || a.startMin - b.startMin);
    const mergeable: BlockItemDTO[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (cur.day - prev.day <= maxGapDays) mergeable.push(prev, cur);
    }
    if (mergeable.length < 2) continue;
    const uniq = [...new Map(mergeable.map((b) => [b.id, b])).values()];
    // Merging removes one first-wave setup (15 min) and one block's worth of
    // occupancy overhead — the coordinator's measurable saving.
    const mergeSavingMin = (uniq.length - 1) * FIRST_WAVE_SETUP_MIN + Math.round((uniq.length - 1) * 27);
    findings.push({
      segmentId,
      segmentCode: uniq[0].segmentCode,
      blocks: uniq.map((b) => ({ id: b.id, day: b.day, startMin: b.startMin, endMin: b.endMin, defectCount: b.defectCount, isSuperBlock: b.isSuperBlock })),
      mergeSavingMin,
      note: `${uniq.length} separate blocks on ${uniq[0].segmentCode} inside ${maxGapDays} days — a single coordinated super block would recover ~${mergeSavingMin} min of section availability.`,
    });
  }
  return findings.sort((a, b) => b.mergeSavingMin - a.mergeSavingMin);
}

/* ------------------------------------------------------------------ */
/*  KPI roll-up for the dashboard panel                                */
/* ------------------------------------------------------------------ */

export interface SuperBlockKpi {
  opportunities: number;
  recommended: number;
  conditional: number;
  rejected: number;
  potentialSavingMin: number;
  potentialSavingH: number;
  plannedSuperBlocks: number;
  plannedCoordinationMin: number;
  splitFindings: number;
  goldenUtilisationPct: number;
  topOpportunity: SBOpportunity | null;
}

export function superBlockKpis(state: { candidates: SBCandidate[]; plannedBlocks: BlockItemDTO[] }): SuperBlockKpi {
  const opportunities = analyzeSuperBlocks(state.candidates);
  const recommended = opportunities.filter((o) => o.feasibility.decision === "RECOMMEND");
  const potentialSavingMin = opportunities.reduce((s, o) => s + o.savingMin, 0);
  const superBlocks = state.plannedBlocks.filter((b) => b.isSuperBlock);
  const golden = state.plannedBlocks.filter((b) => b.window === "GOLDEN");
  return {
    opportunities: opportunities.length,
    recommended: recommended.length,
    conditional: opportunities.filter((o) => o.feasibility.decision === "CONDITIONAL").length,
    rejected: opportunities.filter((o) => o.feasibility.decision === "REJECT").length,
    potentialSavingMin,
    potentialSavingH: Math.round((potentialSavingMin / 60) * 10) / 10,
    plannedSuperBlocks: superBlocks.length,
    plannedCoordinationMin: superBlocks.reduce((s, b) => s + (b.endMin - b.startMin), 0),
    splitFindings: splitBlockAnalysis(state.plannedBlocks).length,
    goldenUtilisationPct: state.plannedBlocks.length
      ? Math.round((golden.reduce((s, b) => s + (b.endMin - b.startMin), 0) / (GOLDEN_CAP * Math.max(golden.length, 1))) * 100)
      : 0,
    topOpportunity: opportunities[0] ?? null,
  };
}
