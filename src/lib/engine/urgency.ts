/**
 * URGENCY ENGINE — how soon does this defect become a safety risk? (PS #26027)
 *
 * The problem statement asks for defects to be prioritised by BOTH:
 *   (a) engineering criticality (severity, asset health, train density), and
 *   (b) urgency — how close the defect is to its permitted rectification
 *       deadline (`defects.dueInDays`, negative = already overdue).
 *
 * This module is deliberately small, deterministic and explainable:
 *   - classifyUrgency()      → EMERGENCY | CRITICALLY_OVERDUE | OVERDUE | DUE_SOON | UPCOMING | NORMAL
 *   - urgencyScore()         → 0–100 urgency index from the deadline + severity + history
 *   - finalPriorityScore()   → 35% criticality · 30% urgency · 20% ML risk · 15% availability
 *   - urgencyBoost()         → 0.70–1.30 multiplier applied to the optimizer's sort key so a
 *                              due-tomorrow low-severity defect can outrank a next-month high one.
 *
 * Nothing here calls the ML model: the ML failure-risk probability is passed IN
 * (predictRisk → failureProb72h) and blended, so the two signals stay separable
 * in the UI breakdown (ML risk vs. rule-based urgency).
 */
import { priorityBand, type PriorityLevel, type RecurrenceLevel } from "./lifecycleStages";

/** Ordered worst → best. */
export const URGENCY_CLASSES = [
  "EMERGENCY",
  "CRITICALLY_OVERDUE",
  "OVERDUE",
  "DUE_SOON",
  "UPCOMING",
  "NORMAL",
] as const;

export type UrgencyClass = (typeof URGENCY_CLASSES)[number];

export const URGENCY_META: Record<
  UrgencyClass,
  { label: string; tone: "critical" | "warn" | "amber" | "info" | "muted"; sla: string; hint: string }
> = {
  EMERGENCY: {
    label: "Emergency",
    tone: "critical",
    sla: "Act today",
    hint: "Safety-critical defect at/before its permitted deadline — immediate block or speed restriction.",
  },
  CRITICALLY_OVERDUE: {
    label: "Critically Overdue",
    tone: "warn",
    sla: "Escalate",
    hint: "Overdue by more than a week — escalate to the DRM dashboard.",
  },
  OVERDUE: { label: "Overdue", tone: "amber", sla: "This block cycle", hint: "Past the permitted rectification deadline." },
  DUE_SOON: { label: "Due Soon", tone: "info", sla: "Within 3 days", hint: "Deadline inside the current planning window." },
  UPCOMING: { label: "Upcoming", tone: "muted", sla: "This fortnight", hint: "Plan into the next maintenance cycle." },
  NORMAL: { label: "Normal", tone: "muted", sla: "Routine", hint: "Routine maintenance — schedule opportunistically." },
};

export const URGENCY_ORDER: Record<UrgencyClass, number> = {
  EMERGENCY: 0,
  CRITICALLY_OVERDUE: 1,
  OVERDUE: 2,
  DUE_SOON: 3,
  UPCOMING: 4,
  NORMAL: 5,
};

/** Weight blend for the final priority score — SUM = 1.00. */
export const PRIORITY_WEIGHTS = {
  criticality: 0.35, // engineering severity + asset health + train density (shared AI score)
  urgency: 0.3, // deadline proximity (this engine)
  mlRisk: 0.2, // trained failure-risk model, 72 h horizon (ml.ts)
  availability: 0.15, // current asset availability — scarce windows prioritise hard
} as const;

/**
 * Rule-based urgency classification from the rectification deadline.
 * `dueInDays` counts calendar days to the permitted deadline (negative = overdue).
 */
export function classifyUrgency(dueInDays: number, severity: number): UrgencyClass {
  if (dueInDays <= 0 && severity >= 8) return "EMERGENCY";
  if (dueInDays <= -21) return "EMERGENCY";
  if (dueInDays <= -7) return "CRITICALLY_OVERDUE";
  if (dueInDays < 0) return "OVERDUE";
  if (dueInDays <= 3) return "DUE_SOON";
  if (dueInDays <= 14) return "UPCOMING";
  return "NORMAL";
}

function dueBase(dueInDays: number): number {
  if (dueInDays <= -14) return 100;
  if (dueInDays <= -7) return 88;
  if (dueInDays <= 0) return 74;
  if (dueInDays <= 3) return 58;
  if (dueInDays <= 7) return 44;
  if (dueInDays <= 14) return 30;
  if (dueInDays <= 30) return 18;
  return 8;
}

export interface UrgencyInput {
  severity: number; // 1..10
  dueInDays: number; // permitted rectification deadline (negative = overdue)
  overdueDays: number; // days already past the original scheduled date
  recurrenceBand?: RecurrenceLevel; // rule-based recurrence detection (lifecycle)
}

/** 0–100 urgency index: deadline proximity + severity + chronic lateness + recurrence. */
export function urgencyScore(input: UrgencyInput): number {
  const recurrenceBonus = input.recurrenceBand === "HIGH" ? 6 : input.recurrenceBand === "MEDIUM" ? 4 : input.recurrenceBand === "LOW" ? 2 : 0;
  const raw =
    dueBase(input.dueInDays) +
    (input.severity - 5) * 2.5 +
    Math.min(Math.max(input.overdueDays, 0), 60) / 6 +
    recurrenceBonus;
  return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
}

/** 0.70 – 1.30 multiplier used on the optimizer's sort key (never on the KPI maths). */
export function urgencyBoost(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  return Math.round((0.7 + (s / 100) * 0.6) * 1000) / 1000;
}

export interface PriorityBreakdown {
  final: number; // 0–100 blended priority
  band: PriorityLevel;
  criticalityPct: number;
  urgencyPct: number;
  mlRiskPct: number;
  availabilityPct: number;
  reasons: string[];
}

/**
 * Final priority = 35% criticality / 30% urgency / 20% ML risk / 15% availability.
 * Every input is normalized to 0–100 so the blend stays explainable in the UI.
 */
export function priorityBreakdown(input: {
  aiScore: number; // criticality score from the shared AI criticality model (scoring.ts)
  urgencyScore: number;
  mlRiskPct: number; // 0–100 failure probability, next 72 h
  availabilityPct: number; // 0–100 current asset availability
  severity: number;
  criticality: number;
  dailyTrains: number;
  dueInDays: number;
  urgencyClass: UrgencyClass;
}): PriorityBreakdown {
  const criticalityPct = Math.max(0, Math.min(100, input.aiScore));
  const urgencyPct = Math.max(0, Math.min(100, input.urgencyScore));
  const mlRiskPct = Math.max(0, Math.min(100, input.mlRiskPct));
  const availabilityPct = Math.max(0, Math.min(100, input.availabilityPct));

  const final =
    Math.round(
      (criticalityPct * PRIORITY_WEIGHTS.criticality +
        urgencyPct * PRIORITY_WEIGHTS.urgency +
        mlRiskPct * PRIORITY_WEIGHTS.mlRisk +
        availabilityPct * PRIORITY_WEIGHTS.availability) *
        10
    ) / 10;

  const reasons: string[] = [];
  reasons.push(`Criticality ${Math.round(criticalityPct)}/100 (severity ${input.severity}, section criticality ${input.criticality}, ${input.dailyTrains} trains/day)`);
  reasons.push(
    `Urgency ${Math.round(urgencyPct)}/100 — ${URGENCY_META[input.urgencyClass].label} (${
      input.dueInDays < 0 ? `${Math.abs(input.dueInDays)} d overdue` : `due in ${input.dueInDays} d`
    })`
  );
  reasons.push(`ML failure risk ${Math.round(mlRiskPct)}% over the next 72 h`);
  reasons.push(`Asset availability context ${Math.round(availabilityPct)}% — ${availabilityPct < 90 ? "windows are scarce, prioritise hard" : "healthy availability"}`);

  return {
    final,
    band: priorityBand(final, input.severity, mlRiskPct / 100),
    criticalityPct: Math.round(criticalityPct * 10) / 10,
    urgencyPct,
    mlRiskPct,
    availabilityPct,
    reasons,
  };
}

export interface UrgencyQueueItem {
  id: number;
  defectCode: string;
  title: string;
  segmentCode: string;
  department: string;
  severity: number;
  dueInDays: number;
  urgencyClass: UrgencyClass;
  urgencyScore: number;
  boost: number;
  sortKey: number; // aiScore × boost — the optimizer's ordering key
  aiScore: number;
  priority: PriorityLevel;
  recurrenceBand: RecurrenceLevel;
  lifecycleStatus: string;
}

export function scoreForQueue(input: {
  id: number;
  defectCode: string;
  title: string;
  segmentCode: string;
  department: string;
  severity: number;
  dueInDays: number;
  overdueDays: number;
  aiScore: number;
  recurrenceBand: RecurrenceLevel;
  priority: PriorityLevel;
  lifecycleStatus: string;
}): UrgencyQueueItem {
  const urgencyClass = classifyUrgency(input.dueInDays, input.severity);
  const score = urgencyScore({ severity: input.severity, dueInDays: input.dueInDays, overdueDays: input.overdueDays, recurrenceBand: input.recurrenceBand });
  const boost = urgencyBoost(score);
  return {
    ...input,
    urgencyClass,
    urgencyScore: score,
    boost,
    sortKey: Math.round(input.aiScore * boost * 10) / 10,
  };
}

/** Ordered urgency queue — worst first, ties broken by the boosted sort key. */
export function urgencyQueue(items: UrgencyQueueItem[]): UrgencyQueueItem[] {
  return [...items].sort(
    (a, b) => URGENCY_ORDER[a.urgencyClass] - URGENCY_ORDER[b.urgencyClass] || b.sortKey - a.sortKey
  );
}

export interface UrgencySummary {
  total: number;
  counts: Record<UrgencyClass, number>;
  overdueCount: number;
  emergencyCount: number;
  avgUrgency: number;
  top: UrgencyQueueItem | null;
}

export function urgencySummary(items: UrgencyQueueItem[]): UrgencySummary {
  const counts = Object.fromEntries(URGENCY_CLASSES.map((c) => [c, 0])) as Record<UrgencyClass, number>;
  for (const i of items) counts[i.urgencyClass] += 1;
  const overdueCount = counts.OVERDUE + counts.CRITICALLY_OVERDUE;
  const sorted = urgencyQueue(items);
  return {
    total: items.length,
    counts,
    overdueCount,
    emergencyCount: counts.EMERGENCY,
    avgUrgency: items.length ? Math.round((items.reduce((s, i) => s + i.urgencyScore, 0) / items.length) * 10) / 10 : 0,
    top: sorted[0] ?? null,
  };
}
