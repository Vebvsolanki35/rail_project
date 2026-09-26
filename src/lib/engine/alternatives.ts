/**
 * ALTERNATIVE PLAN GENERATION + COMPARISON (PS #26027)
 *
 * One plan is never the only defensible answer. Railway decisions trade off
 * safety against traffic throughput, and the right balance changes with the day.
 * This module produces three coherent planning strategies over the same live
 * defect set (plus a custom, caller-supplied weight profile) and scores them on
 * the SAME KPIs so the controller can compare like with like:
 *
 *   BALANCED           35 / 30 / 20 / 15 — criticality · urgency · ML risk · availability
 *   SAFETY FIRST       45 / 35 / 15 / 5  — clears the most dangerous work, whatever it costs
 *   TRAFFIC FIRST      25 / 20 / 15 / 40 — protects line capacity, pushes work off-peak
 *
 * Deliberately PURE: no database access, so the same function powers the API
 * route, the What-If lab and the unit tests.
 */
import { trafficFactor } from "./network";

export interface AlternativeDefect {
  id: number;
  title: string;
  department: string;
  severity: number; // 1..10
  durationMin: number;
  dueInDays: number;
  overdueDays: number;
  assetHealth: number;
  aiScore: number; // criticality model output (0–100)
  mlRiskPct: number; // failure probability next 72 h (0–100)
  recurrenceBand?: string;
  segmentId: number;
  segmentCode: string;
  corridor: string;
  dailyTrains: number;
  criticality: number; // section criticality 1..10
  isBridge: boolean;
  isLevelCrossing: boolean;
}

export interface WeightProfile {
  key: "balanced" | "safety" | "traffic" | "custom";
  name: string;
  blurb: string;
  weights: { criticality: number; urgency: number; risk: number; availability: number };
  windowPreference: "GOLDEN" | "SHOULDER" | "OFFPEAK" | "AUTO";
  denseCorridorOffPeak: boolean;
  maxDurationsPerBlock: "include-all" | "trim-lowest";
  /**
   * How much total section occupancy this strategy is willing to spend, as a
   * fraction of the theoretical independent downtime of everything in scope.
   * >1 means "accept more downtime to clear more work" (safety), <1 means
   * "protect capacity and defer the least urgent work" (traffic).
   */
  occupancyBudget: number;
  /** Day placement: earliest days, spread, or pushed late into the horizon. */
  daySpread: "earliest" | "spread" | "late";
}

export const WEIGHT_PROFILES: WeightProfile[] = [
  {
    key: "balanced",
    name: "Balanced",
    blurb: "Rail Rakshak default — weighs safety criticality, deadline urgency, failure risk and asset availability evenly.",
    weights: { criticality: 0.35, urgency: 0.3, risk: 0.2, availability: 0.15 },
    windowPreference: "AUTO",
    denseCorridorOffPeak: false,
    maxDurationsPerBlock: "include-all",
    occupancyBudget: 0.95,
    daySpread: "spread",
  },
  {
    key: "safety",
    name: "Safety First",
    blurb: "Clears the most dangerous defects first and accepts longer occupancies to finish them in one window.",
    weights: { criticality: 0.45, urgency: 0.35, risk: 0.15, availability: 0.05 },
    windowPreference: "GOLDEN",
    denseCorridorOffPeak: false,
    maxDurationsPerBlock: "include-all",
    occupancyBudget: 1.12,
    daySpread: "earliest",
  },
  {
    key: "traffic",
    name: "Traffic First",
    blurb: "Protects line capacity — dense corridors move to off-peak and low-severity tasks are trimmed out of busy windows.",
    weights: { criticality: 0.25, urgency: 0.2, risk: 0.15, availability: 0.4 },
    windowPreference: "OFFPEAK",
    denseCorridorOffPeak: true,
    maxDurationsPerBlock: "trim-lowest",
    occupancyBudget: 0.72,
    daySpread: "late",
  },
];

export function normalizeWeights(w: Partial<WeightProfile["weights"]>): WeightProfile["weights"] {
  const base = { criticality: 0.35, urgency: 0.3, risk: 0.2, availability: 0.15 };
  const merged = { ...base, ...w };
  const sum = Object.values(merged).reduce((s, v) => s + Math.max(0, v), 0) || 1;
  return {
    criticality: merged.criticality / sum,
    urgency: merged.urgency / sum,
    risk: merged.risk / sum,
    availability: merged.availability / sum,
  };
}

/* ---------------- window model (mirrors superblock.ts caps) ---------------- */

const GOLDEN_CAP = 215;
const SHOULDER_CAP = 150;
const OFFPEAK_CAP = 600;
const WINDOW_BOUNDS: Record<string, [number, number]> = { GOLDEN: [30, 300], SHOULDER: [630, 810], OFFPEAK: [0, 1440] };

function dueBase(dueInDays: number): number {
  if (dueInDays <= -14) return 100;
  if (dueInDays <= -7) return 88;
  if (dueInDays <= 0) return 74;
  if (dueInDays <= 3) return 58;
  if (dueInDays <= 7) return 44;
  if (dueInDays <= 14) return 30;
  return 18;
}

function urgencyOf(d: AlternativeDefect): number {
  return Math.max(0, Math.min(100, dueBase(d.dueInDays) + (d.severity - 5) * 2.5 + Math.min(Math.max(d.overdueDays, 0), 60) / 6));
}

export interface AlternativeBlock {
  segmentId: number;
  segmentCode: string;
  corridor: string;
  day: number;
  startMin: number;
  endMin: number;
  window: string;
  departments: string[];
  defectIds: number[];
  isSuperBlock: boolean;
  delayCostMin: number;
  estAffected: number;
  rationale: string;
}

export interface AlternativePlan {
  key: WeightProfile["key"];
  name: string;
  blurb: string;
  weights: WeightProfile["weights"];
  blocks: AlternativeBlock[];
  kpis: {
    downtimeBaselineH: number;
    downtimeOptimizedH: number;
    reductionPct: number;
    blocks: number;
    superBlocks: number;
    defectsCleared: number;
    coveragePct: number;
    avgDelayMin: number;
    delayExposureMin: number;
    highRiskCoveredPct: number;
    overdueCovered: number;
    unplaced: number;
    /** Days until the last severity ≥ 8 task is cleared. */
    criticalClearanceDays: number;
  };
  score: number; // 0–100 composite, same weights as the profile
  tradeoff: string;
  unplacedIds: number[];
}

function scoreDefect(d: AlternativeDefect, w: WeightProfile["weights"], sectionAvailabilityPct: number): number {
  return (
    d.aiScore * w.criticality +
    urgencyOf(d) * w.urgency +
    d.mlRiskPct * w.risk +
    sectionAvailabilityPct * w.availability
  );
}

function pack(ds: AlternativeDefect[]): { waves: { duration: number; depts: Set<string>; ids: number[] }[]; total: number } {
  const sorted = [...ds].sort((a, b) => b.durationMin - a.durationMin);
  const waves: { duration: number; depts: Set<string>; ids: number[] }[] = [];
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
  return { waves, total: waves.reduce((s, w) => s + w.duration, 0) };
}

function bestStart(dailyTrains: number, duration: number, window: string): { startMin: number; cost: number; affected: number } {
  const [ws, we] = WINDOW_BOUNDS[window] ?? [0, 1440];
  let best = { startMin: ws, cost: Number.MAX_VALUE, affected: 1 };
  for (let s = ws; s + duration <= we; s += 15) {
    const tf = trafficFactor(s + duration / 2);
    const trains = dailyTrains * ((duration / 60) / 16) * (0.3 + tf);
    const perTrain = 2.5 + tf * 42;
    const affected = Math.max(1, trains * (0.5 + tf * 0.2));
    const cost = affected * perTrain;
    if (cost < best.cost) best = { startMin: s, cost: Math.round(cost * 10) / 10, affected };
  }
  return best;
}

/**
 * Build one alternative plan for a weight profile. Deterministic: same input →
 * same plan, which is what makes the comparison reproducible in a demo.
 */
export function generateAlternative(defects: AlternativeDefect[], profile: WeightProfile, days = 7): AlternativePlan {
  const w = normalizeWeights(profile.weights);

  // section availability proxy: a section already carrying many open defects has
  // fewer usable windows left (it is "more occupied" in planning terms).
  const bySegmentAll = new Map<number, AlternativeDefect[]>();
  for (const d of defects) {
    const list = bySegmentAll.get(d.segmentId) ?? [];
    list.push(d);
    bySegmentAll.set(d.segmentId, list);
  }
  const availabilityOf = (segmentId: number) => Math.max(40, 100 - (bySegmentAll.get(segmentId)?.length ?? 0) * 4);

  const ranked = [...defects].sort((a, b) => scoreDefect(b, w, availabilityOf(b.segmentId)) - scoreDefect(a, w, availabilityOf(a.segmentId)));

  const bySegment = new Map<number, AlternativeDefect[]>();
  for (const d of ranked) {
    const list = bySegment.get(d.segmentId) ?? [];
    list.push(d);
    bySegment.set(d.segmentId, list);
  }

  const blocks: AlternativeBlock[] = [];
  const unplacedIds: number[] = [];
  /** "Clear the dangerous work first": pack every section across consecutive days. */
  const multiPass = profile.daySpread === "earliest";
  let segIdx = 0;

  for (const [segmentId, list] of bySegment) {
    const head = list[0];
    const dense = head.dailyTrains >= 240;
    const window =
      profile.denseCorridorOffPeak && dense
        ? "OFFPEAK"
        : profile.windowPreference === "AUTO"
          ? dense
            ? "OFFPEAK"
            : "GOLDEN"
          : profile.windowPreference;
    const cap = window === "GOLDEN" ? GOLDEN_CAP : window === "SHOULDER" ? SHOULDER_CAP : OFFPEAK_CAP;

    let remaining = [...list];
    const passes = multiPass ? Math.min(days, 4) : 1;

    for (let pass = 0; pass < passes && remaining.length > 0; pass++) {
      const accepted: AlternativeDefect[] = [];
      const rejected: AlternativeDefect[] = [];
      for (const d of remaining) {
        const trial = [...accepted, d];
        const { waves, total } = pack(trial);
        const need = total + 15 + 8 * Math.max(0, waves.length - 1);
        if (need <= cap) accepted.push(d);
        else rejected.push(d);
      }
      if (accepted.length === 0) {
        // Nothing fits: the highest-ranked task gets its own minimal block.
        accepted.push(remaining[0]);
        rejected.splice(0, 1);
      }

      // "trim-lowest": traffic optimization deliberately defers low-severity work
      // that would otherwise keep a busy window occupied.
      let finalAccepted = accepted;
      if (profile.maxDurationsPerBlock === "trim-lowest" && accepted.length > 1) {
        const keep = accepted.filter((d) => d.severity >= 6 || d.dueInDays <= 7);
        finalAccepted = keep.length > 0 ? keep : [accepted[0]];
      }

      const { waves, total } = pack(finalAccepted);
      const duration = total + 15 + 8 * Math.max(0, waves.length - 1);
      const day =
        profile.daySpread === "earliest"
          ? (segIdx + pass) % Math.max(2, Math.min(days, 3))
          : profile.daySpread === "late"
            ? (days - 1 - (segIdx % Math.max(2, Math.min(days, 3)))) % days
            : (segIdx * 2 + pass) % days;
      const placed = bestStart(head.dailyTrains, duration, window);
      const departments = [...new Set(finalAccepted.map((d) => d.department))].sort();

      blocks.push({
        segmentId,
        segmentCode: head.segmentCode,
        corridor: head.corridor,
        day,
        startMin: placed.startMin,
        endMin: placed.startMin + duration,
        window,
        departments,
        defectIds: finalAccepted.map((d) => d.id),
        isSuperBlock: departments.length >= 2,
        delayCostMin: placed.cost,
        estAffected: Math.round(placed.affected),
        rationale: `Ranked by ${profile.name.toLowerCase()} weights (${Object.entries(w)
          .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
          .join(" · ")}). ${finalAccepted.length} task(s) in ${waves.length} wave(s), ${window} window, day ${day + 1}${multiPass ? " — dangerous work cleared on the earliest feasible days" : ""}${profile.maxDurationsPerBlock === "trim-lowest" ? "; low-severity work deliberately deferred" : ""}.`,
      });

      remaining = remaining.filter((d) => !finalAccepted.includes(d));
      if (!multiPass) break;
    }
    unplacedIds.push(...remaining.map((d) => d.id));
    segIdx += 1;
  }

  /* ---- Occupancy budget: this is what separates the strategies ----------
   * When the strategy's budget is smaller than the packed plan, the lowest-ranked
   * tasks are deferred (not silently dropped): they stay in the queue and are
   * reported as `unplacedIds` with an explicit count in the KPI panel. */
  const totalPackedMin = blocks.reduce((s, b) => s + (b.endMin - b.startMin), 0);
  const budgetMin = Math.round(defects.reduce((s, d) => s + d.durationMin + 40, 0) * profile.occupancyBudget);
  if (totalPackedMin > budgetMin) {
    const lowestFirst = [...ranked].reverse();
    for (const d of lowestFirst) {
      const current = blocks.reduce((s, b) => s + (b.endMin - b.startMin), 0);
      if (current <= budgetMin) break;
      const host = blocks.find((b) => b.defectIds.includes(d.id) && b.defectIds.length > 1);
      if (!host) continue;
      host.defectIds = host.defectIds.filter((id) => id !== d.id);
      const { waves, total } = pack(defects.filter((x) => host.defectIds.includes(x.id)));
      const trimmed = total + 15 + 8 * Math.max(0, waves.length - 1);
      host.endMin = host.startMin + trimmed;
      host.departments = [...new Set(defects.filter((x) => host.defectIds.includes(x.id)).map((x) => x.department))].sort();
      host.isSuperBlock = host.departments.length >= 2;
      host.rationale = `${host.rationale} Deferred ${d.title} (severity ${d.severity}) to fit the ${profile.name} occupancy budget of ${Math.round(profile.occupancyBudget * 100)}% — it stays queued for the next cycle.`;
      if (!unplacedIds.includes(d.id)) unplacedIds.push(d.id);
    }
  }

  const scheduled = blocks.flatMap((b) => b.defectIds);
  const scheduledSet = new Set(scheduled);
  const scheduledDefects = defects.filter((d) => scheduledSet.has(d.id));
  const baselineMin = scheduledDefects.reduce((s, d) => s + d.durationMin + 40, 0);
  const optimMin = blocks.reduce((s, b) => s + (b.endMin - b.startMin), 0);
  const totalDelay = blocks.reduce((s, b) => s + b.delayCostMin, 0);
  const totalAffected = blocks.reduce((s, b) => s + b.estAffected, 0);
  const highRisk = defects.filter((d) => d.mlRiskPct >= 50);
  const highRiskCovered = highRisk.filter((d) => scheduledSet.has(d.id)).length;

  const kpis = {
    downtimeBaselineH: Math.round((baselineMin / 60) * 10) / 10,
    downtimeOptimizedH: Math.round((optimMin / 60) * 10) / 10,
    reductionPct: Math.round((1 - optimMin / Math.max(baselineMin, 1)) * 100),
    blocks: blocks.length,
    superBlocks: blocks.filter((b) => b.isSuperBlock).length,
    defectsCleared: scheduled.length,
    coveragePct: defects.length ? Math.round((scheduled.length / defects.length) * 100) : 0,
    avgDelayMin: Math.round((totalDelay / Math.max(totalAffected, 1)) * 10) / 10,
    delayExposureMin: Math.round(totalDelay),
    highRiskCoveredPct: highRisk.length ? Math.round((highRiskCovered / highRisk.length) * 100) : 100,
    overdueCovered: scheduledDefects.filter((d) => d.dueInDays <= 0).length,
    unplaced: unplacedIds.length,
    /** Days until the last severity ≥ 8 task is cleared (1 = today's cycle). */
    criticalClearanceDays:
      blocks
        .filter((b) => b.defectIds.some((id) => (defects.find((d) => d.id === id)?.severity ?? 0) >= 8))
        .reduce((max, b) => Math.max(max, b.day + 1), 0),
  };

  // Composite score: safety coverage, downtime reduction, delay, coverage.
  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        kpis.highRiskCoveredPct * 0.3 +
          kpis.reductionPct * 0.2 +
          Math.max(0, 100 - kpis.avgDelayMin * 8) * 0.2 +
          kpis.coveragePct * 0.15 +
          Math.max(0, 100 - kpis.criticalClearanceDays * 15) * 0.15
      )
    )
  );

  const budgetNote = `occupancy budget ${Math.round(profile.occupancyBudget * 100)}% of independent downtime`;
  const tradeoff =
    profile.key === "safety"
      ? `Clears ${kpis.defectsCleared} tasks including ${kpis.highRiskCoveredPct}% of high-risk work; downtime ↓${kpis.reductionPct}%, average delay ${kpis.avgDelayMin} min.`
      : profile.key === "traffic"
        ? `Holds delay to ${kpis.avgDelayMin} min average by deferring low-severity work (${kpis.unplaced} task(s) deferred); coverage ${kpis.coveragePct}%.`
        : `Balanced outcome: ${kpis.defectsCleared} tasks cleared, downtime ↓${kpis.reductionPct}%, average delay ${kpis.avgDelayMin} min.`;
  const tradeoffWithBudget = `${tradeoff} (${budgetNote})`;

  return {
    key: profile.key,
    name: profile.name,
    blurb: profile.blurb,
    weights: w,
    blocks,
    kpis: { ...kpis, delayExposureMin: kpis.delayExposureMin, unplaced: unplacedIds.length },
    score,
    tradeoff: tradeoffWithBudget,
    unplacedIds,
  };
}

export function generateAlternatives(defects: AlternativeDefect[], days = 7, custom?: Partial<WeightProfile["weights"]>): AlternativePlan[] {
  const profiles = [...WEIGHT_PROFILES];
  if (custom) {
    profiles.push({
      key: "custom",
      name: "Custom Weights",
      blurb: `Operator-supplied weighting: ${Object.entries(normalizeWeights(custom))
        .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
        .join(" · ")}.`,
      weights: normalizeWeights(custom),
      windowPreference: custom.availability && custom.availability > 0.3 ? "OFFPEAK" : "AUTO",
      denseCorridorOffPeak: (custom.availability ?? 0) > 0.3,
      maxDurationsPerBlock: (custom.availability ?? 0) > 0.3 ? "trim-lowest" : "include-all",
      occupancyBudget: custom.criticality && custom.criticality > 0.4 ? 1.05 : 0.85,
      daySpread: custom.availability && custom.availability > 0.3 ? "late" : "spread",
    });
  }
  return profiles.map((p) => generateAlternative(defects, p, days));
}

export interface AlternativeComparison {
  ranked: {
    key: AlternativePlan["key"];
    name: string;
    score: number;
    deltas: {
      downtimeH: number;
      avgDelayMin: number;
      coveragePct: number;
      highRiskCoveredPct: number;
      criticalClearanceDays: number;
    };
    verdict: string;
  }[];
  best: AlternativePlan["key"];
  note: string;
}

/** Rank alternatives against the balanced baseline and explain each verdict. */
export function compareAlternatives(plans: AlternativePlan[]): AlternativeComparison {
  const baseline = plans.find((p) => p.key === "balanced") ?? plans[0];
  const ranked = [...plans]
    .sort((a, b) => b.score - a.score)
    .map((p) => {
      const deltas = {
        downtimeH: Math.round((p.kpis.downtimeOptimizedH - baseline.kpis.downtimeOptimizedH) * 10) / 10,
        avgDelayMin: Math.round((p.kpis.avgDelayMin - baseline.kpis.avgDelayMin) * 10) / 10,
        coveragePct: p.kpis.coveragePct - baseline.kpis.coveragePct,
        highRiskCoveredPct: p.kpis.highRiskCoveredPct - baseline.kpis.highRiskCoveredPct,
        criticalClearanceDays: p.kpis.criticalClearanceDays - baseline.kpis.criticalClearanceDays,
      };
      const verdict =
        p.key === baseline.key
          ? `Reference plan — ${baseline.kpis.defectsCleared} tasks, ${baseline.kpis.avgDelayMin} min average delay, dangerous work cleared by day ${baseline.kpis.criticalClearanceDays || 1}.`
          : deltas.criticalClearanceDays < 0
            ? `Faster on safety: clears every severity ≥ 8 defect ${Math.abs(deltas.criticalClearanceDays)} day(s) sooner than the reference${deltas.coveragePct < 0 ? ` at the cost of ${Math.abs(deltas.coveragePct)}% coverage` : ""}.`
            : deltas.avgDelayMin < 0 && deltas.coveragePct >= 0
            ? `Strictly better exposure: ${Math.abs(deltas.avgDelayMin)} min less average delay with equal or wider coverage.`
            : deltas.highRiskCoveredPct > 0
              ? `Safer: covers ${deltas.highRiskCoveredPct}% more high-risk work${deltas.avgDelayMin > 0 ? ` for ${deltas.avgDelayMin} min more average delay` : ""}.`
              : `Narrower plan: ${Math.abs(deltas.coveragePct)}% less coverage${deltas.downtimeH < 0 ? ` but ${Math.abs(deltas.downtimeH)} h less downtime` : ""}.`;
      return { key: p.key, name: p.name, score: p.score, deltas, verdict };
    });
  return {
    ranked,
    best: ranked[0].key,
    note: `${ranked.length} planning strategies generated over the same live defect set; scores are computed from identical KPI formulas so they compare like with like.`,
  };
}
