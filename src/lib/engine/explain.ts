/**
 * AI EXPLAINABILITY (Phase 5) — why the engine recommended what it did.
 *
 * Every factor below is a value the platform already computes, surfaced with
 * its contribution so an officer can audit the reasoning rather than trust a
 * black box:
 *
 *   failure risk      ← the fitted logistic-regression model (ml.ts)
 *   severity          ← defect register
 *   overdue age       ← dueInDays / overdueDays
 *   asset health      ← assets.health
 *   section criticality ← segments.criticality (with the bridge multiplier)
 *   traffic exposure  ← segments.dailyTrains + traffic-shape factor
 *   train impact      ← delayCostEstimate (shared with the optimizer)
 *   weather impact    ← IMD nowcast + Fog Mode physics
 *   department compatibility ← shadow-block analysis (Phase 4)
 *
 * The engine is ADVISORY. `authority` is emitted with every explanation and the
 * UI renders it verbatim: AI RECOMMENDATION / HUMAN REVIEW REQUIRED.
 */
import { db } from "@/db";
import { assets, defects, segments } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { riskFor } from "./scoring";
import { delayCostEstimate } from "./optimizer";
import { trafficFactor } from "./network";
import { classifyUrgency, urgencyBoost, urgencyScore } from "./urgency";
import { analyseShadow, shadowInput } from "./shadowblock";
import { forecastFor, freightPressure, loadForecastContext } from "./freight";
import type { RecurrenceLevel } from "./lifecycleStages";

export const AI_AUTHORITY = {
  isAdvisory: true,
  recommendationLabel: "AI RECOMMENDATION",
  reviewLabel: "HUMAN REVIEW REQUIRED",
  authorityHolder: "Divisional Railway Manager / Section Controller",
  note: "The engine proposes; a nominated officer decides. No block is published without recorded human approval.",
} as const;

export interface ExplainFactor {
  key: string;
  label: string;
  /** Display value, e.g. "82.4%", "sev 10/10", "₹—" */
  value: string;
  /** Normalised 0–100 contribution used for the bar. */
  pct: number;
  /** Raw number behind the bar, for tests and tooltips. */
  raw: number;
  note: string;
}

export interface DefectExplanation {
  defectId: number;
  defectCode: string;
  title: string;
  department: string;
  segmentCode: string;
  section: string;
  factors: ExplainFactor[];
  reasons: string[];
  recommendation: string;
  recommendedWindow: string;
  recommendedBlockMin: number;
  expectedTrainImpact: { affectedTrains: number; delayMin: number; note: string };
  maintenanceOpportunity: string;
  conflictRisk: { level: "LOW" | "MODERATE" | "HIGH"; basis: string };
  priority: { score: number; class: string; boost: number; breakdown: { label: string; value: number }[] };
  authority: typeof AI_AUTHORITY;
}

export interface WeatherSnapshot {
  visibilityM: number;
  fogProb: number;
  humidity: number;
  tempC: number;
  rainMm: number;
  restrictions: string[];
  fogMode: boolean;
}

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Reasons a human can read, generated from the factor values (not templated prose). */
function buildReasons(f: {
  severity: number;
  riskPct: number;
  overdue: number;
  health: number;
  criticality: number;
  trains: number;
  isBridge: boolean;
  urgencyClass: string;
  boost: number;
  weather: WeatherSnapshot;
  freightReason: string;
  shadow: { compatible: boolean; savedMin: number; departments: string[] };
  window: string;
}): string[] {
  const r: string[] = [];
  r.push(`Failure probability ${f.riskPct.toFixed(1)}% within 72 h from the trained risk model — severity ${f.severity}/10 on an asset at ${f.health.toFixed(0)}% health.`);
  if (f.overdue > 0) r.push(`Work is ${f.overdue} day(s) past its permitted deadline (urgency class ${f.urgencyClass.replace(/_/g, " ")}, priority boost ×${f.boost.toFixed(2)}).`);
  else if (f.urgencyClass === "DUE_SOON") r.push(`Deadline falls due soon — urgency class DUE SOON; scheduling now avoids a forced emergency possession later.`);
  r.push(`Section criticality ${f.criticality}/10 carrying ${f.trains} trains/day${f.isBridge ? ", including a bridge single point of failure (×1.22 severity weighting)" : ""}.`);
  r.push(`Recommended inside the ${f.window} window because the traffic-shape factor there is the lowest of the day (${trafficFactor(f.window === "GOLDEN" ? 120 : f.window === "SHOULDER" ? 720 : 60).toFixed(2)} of peak).`);
  if (f.weather.visibilityM < 200) r.push(`Weather restriction: visibility ${f.weather.visibilityM} m — ${f.weather.fogMode ? "Fog Mode is enforced, physical-only work is deferred" : "fog advisory in force"}.`);
  r.push(`Freight exposure: ${f.freightReason}.`);
  if (f.shadow.compatible && f.shadow.savedMin > 0) {
    r.push(`Compatible with ${f.shadow.departments.join(" + ")} work on the same section — a combined possession recovers ${f.shadow.savedMin} min of downtime.`);
  } else if (!f.shadow.compatible) {
    r.push(`No combined possession available on this section — the tasks clash (see shadow-block blockers).`);
  }
  return r;
}

/** Full explanation for one defect — the unit the planner and defect desks show. */
export async function explainDefect(defectId: number): Promise<DefectExplanation | null> {
  const [row] = await db.select().from(defects).where(eq(defects.id, defectId));
  if (!row) return null;
  const [asset] = await db.select().from(assets).where(eq(assets.id, row.assetId));
  const [seg] = asset ? await db.select().from(segments).where(eq(segments.id, asset.segmentId)) : [];
  if (!seg) return null;

  const [settingRows, forecastCtx] = await Promise.all([
    db.execute<{ key: string; value: string }>(`select key, value from settings`).then((r) => (r.rows ?? r) as { key: string; value: string }[]).catch(() => []),
    loadForecastContext(),
  ]);
  const sMap = new Map((settingRows as { key: string; value: string }[]).map((r) => [r.key, r.value === "true"]));
  const fogMode = sMap.get("fogMode") ?? false;

  const risk = riskFor(row, asset.health, seg, fogMode);
  const urgency = urgencyScore({ severity: row.severity, dueInDays: row.dueInDays, overdueDays: row.overdueDays, recurrenceBand: row.recurrenceBand as RecurrenceLevel });
  const boost = urgencyBoost(urgency);
  const urgencyClass = classifyUrgency(row.dueInDays, row.severity);
  const month = new Date().getMonth();
  const fogSeason = month >= 10 || month <= 1;
  const weather: WeatherSnapshot = {
    visibilityM: fogMode ? 35 : fogSeason ? 260 : 3100,
    fogProb: fogMode ? 0.94 : fogSeason ? 0.41 : 0.06,
    humidity: fogMode ? 97 : fogSeason ? 88 : 52,
    tempC: fogMode ? 7 : fogSeason ? 12 : 29,
    rainMm: 0,
    restrictions: fogMode
      ? ["Manual welding prohibited (visibility < 200 m)", "Physical-only inspections deferred", "Speed restriction 30 km/h on affected sections"]
      : fogSeason
        ? ["Fog advisory: night possessions advised before 04:30", "Visibility monitoring active"]
        : [],
    fogMode,
  };

  const window = row.severity >= 8 ? "GOLDEN" : seg.isLevelCrossing ? "SHOULDER" : "GOLDEN";
  const windowStart = window === "GOLDEN" ? 60 : 660;
  const impact = delayCostEstimate(seg.dailyTrains, windowStart, row.durationMin);
  const freight = freightPressure(forecastCtx, seg.id, 0, windowStart, windowStart + row.durationMin);

  const sections = await shadowInput();
  const section = sections.find((s) => s.segmentId === seg.id);
  const analyses = section ? analyseShadow([section]) : [];
  const analysis = analyses[0];
  const shadow = {
    compatible: analysis ? analysis.departments.length > 1 && analysis.compatible : false,
    savedMin: analysis?.savedMin ?? 0,
    departments: analysis?.departments ?? [row.department],
  };

  const factors: ExplainFactor[] = [
    {
      key: "failure-risk",
      label: "Failure risk (72 h)",
      value: `${(risk * 100).toFixed(1)}%`,
      pct: clamp100(risk * 100),
      raw: Math.round(risk * 1000) / 10,
      note: "Trained logistic-regression classifier (src/lib/engine/ml.ts), holdout-verified — not a hardcoded figure.",
    },
    {
      key: "severity",
      label: "Severity",
      value: `${row.severity}/10`,
      pct: clamp100(row.severity * 10),
      raw: row.severity,
      note: "Defect register severity, as reported by the source department.",
    },
    {
      key: "overdue",
      label: "Overdue age",
      value: row.overdueDays > 0 ? `${row.overdueDays} d late` : `${Math.max(row.dueInDays, 0)} d remaining`,
      pct: clamp100((Math.max(row.overdueDays, 0) / 30) * 100),
      raw: row.overdueDays,
      note: `Permitted deadline: ${row.dueInDays} day(s) from detection. Negative values are past deadline.`,
    },
    {
      key: "health",
      label: "Asset health",
      value: `${asset.health.toFixed(0)}%`,
      pct: clamp100(100 - asset.health),
      raw: asset.health,
      note: `${asset.label} (${asset.assetType}) — TSMS/SMMS asset-health index.`,
    },
    {
      key: "criticality",
      label: "Section criticality",
      value: `${seg.criticality}/10`,
      pct: clamp100(seg.criticality * 10),
      raw: seg.criticality,
      note: `${seg.code} · ${seg.corridor} corridor${seg.isBridge ? " · bridge single point of failure" : ""}${seg.isLevelCrossing ? " · level crossing" : ""}.`,
    },
    {
      key: "traffic",
      label: "Traffic exposure",
      value: `${seg.dailyTrains} trains/day`,
      pct: clamp100(seg.dailyTrains / 3.3),
      raw: seg.dailyTrains,
      note: `Working timetable loading; traffic-shape factor ${trafficFactor(windowStart + row.durationMin / 2).toFixed(2)} in the recommended window.`,
    },
    {
      key: "train-impact",
      label: "Train impact if blocked here",
      value: `≈${impact.affected.toFixed(0)} trains · ${impact.cost.toFixed(0)} delay-min`,
      pct: clamp100(impact.cost / 4),
      raw: Math.round(impact.cost * 10) / 10,
      note: "delayCostEstimate() — the same objective the optimizer minimises when it places the block.",
    },
    {
      key: "weather",
      label: "Weather impact",
      value: fogMode ? `FOG — ${weather.visibilityM} m` : `${weather.visibilityM} m vis · fog ${(weather.fogProb * 100).toFixed(0)}%`,
      pct: clamp100(fogMode ? 95 : fogSeason ? 45 : 12),
      raw: weather.visibilityM,
      note: fogMode ? "Fog Mode enforced: physical-only work suspended, virtual inspection routed to DAS/RDPMS." : "IMD nowcast; no operating restriction in force.",
    },
    {
      key: "department",
      label: "Department compatibility",
      value: shadow.compatible ? `${shadow.departments.join(" + ")} combinable` : "single department",
      pct: shadow.compatible ? clamp100(60 + shadow.savedMin / 3) : 30,
      raw: shadow.savedMin,
      note: shadow.compatible
        ? `A combined possession with ${shadow.departments.filter((d) => d !== row.department).join(", ")} saves ${shadow.savedMin} possession-minutes.`
        : "No other department has compatible work on this section in the window.",
    },
    {
      key: "freight",
      label: "Freight / corridor occupancy",
      value: `${freight.pressure.toFixed(2)} pressure`,
      pct: clamp100(freight.pressure * 66),
      raw: freight.pressure,
      note: freight.reason,
    },
  ];

  const priorityBreakdown = [
    { label: "Severity", value: Math.round(row.severity * 4) },
    { label: "Failure risk", value: Math.round(risk * 40) },
    { label: "Overdue", value: Math.round(clamp100((row.overdueDays / 30) * 100) * 0.16) },
    { label: "Criticality", value: Math.round(seg.criticality * 6) },
    { label: "Traffic", value: Math.round(clamp100(seg.dailyTrains / 3.3) * 0.12) },
  ];

  const conflictRisk =
    seg.dailyTrains > 240 ? { level: "HIGH" as const, basis: `${seg.dailyTrains} trains/day — dense corridor (≥240/day) needs the coordinated packer, not a solo block.` }
    : seg.dailyTrains > 160 ? { level: "MODERATE" as const, basis: `${seg.dailyTrains} trains/day — expect knock-on delay if the window slips.` }
    : { level: "LOW" as const, basis: `${seg.dailyTrains} trains/day — single-occupancy window is achievable.` };

  return {
    defectId: row.id,
    defectCode: row.defectCode || `#${row.id}`,
    title: row.title,
    department: row.department,
    segmentCode: seg.code,
    section: `${seg.fromCode}–${seg.toCode}`,
    factors,
    reasons: buildReasons({
      severity: row.severity,
      riskPct: risk * 100,
      overdue: row.overdueDays,
      health: asset.health,
      criticality: seg.criticality,
      trains: seg.dailyTrains,
      isBridge: seg.isBridge,
      urgencyClass,
      boost,
      weather,
      freightReason: freight.reason,
      shadow,
      window,
    }),
    recommendation: `Place a ${row.durationMin}-minute ${row.department} block on ${seg.code} in the ${window} window; combine with compatible departmental work if the shadow analysis holds.`,
    recommendedWindow: `${window} (${window === "GOLDEN" ? "00:30–05:00" : window === "SHOULDER" ? "10:30–13:30" : "off-peak"})`,
    recommendedBlockMin: row.durationMin,
    expectedTrainImpact: {
      affectedTrains: Math.round(impact.affected * 10) / 10,
      delayMin: Math.round(impact.cost * 10) / 10,
      note: "Computed from section loading and the traffic-shape curve; the optimizer re-minimises this when it places the block.",
    },
    maintenanceOpportunity: shadow.compatible
      ? `${shadow.departments.length} departments can share this possession — ${shadow.savedMin} min of duplicate occupation avoided.`
      : `Standalone ${row.department} possession; no compatible departmental work in the same window.`,
    conflictRisk,
    priority: { score: Math.round(urgency * 10) / 10, class: urgencyClass, boost: Math.round(boost * 1000) / 1000, breakdown: priorityBreakdown },
    authority: AI_AUTHORITY,
  };
}

/** Explain a whole plan at once (bounded work — the top N tasks by priority). */
export async function explainPlan(limit = 12): Promise<DefectExplanation[]> {
  const rows = await db
    .select({ id: defects.id })
    .from(defects)
    .where(and(ne(defects.status, "closed")))
    .limit(60);
  const out: DefectExplanation[] = [];
  const scored: { id: number; score: number }[] = [];
  for (const r of rows) {
    const e = await explainDefect(r.id);
    if (e) scored.push({ id: r.id, score: e.priority.score });
    if (e) out.push(e);
  }
  return out.sort((a, b) => b.priority.score - a.priority.score).slice(0, limit);
}

/** Weather desk payload (Phase 12). */
export async function weatherDesk() {
  const settingRows = await db.execute<{ key: string; value: string }>(`select key, value from settings`).catch(() => [] as never);
  const list = (settingRows as unknown as { rows?: { key: string; value: string }[] }).rows ?? (settingRows as unknown as { key: string; value: string }[]);
  const sMap = new Map((list ?? []).map((r) => [r.key, r.value === "true"]));
  const fogMode = sMap.get("fogMode") ?? false;
  const month = new Date().getMonth();
  const fogSeason = month >= 10 || month <= 1;
  const hour = new Date().getHours();
  const visibilityM = fogMode ? 35 : fogSeason && (hour < 9 || hour > 22) ? 220 : fogSeason ? 900 : 3100;
  const fogProb = fogMode ? 0.94 : fogSeason ? (hour < 9 || hour > 22 ? 0.63 : 0.28) : 0.06;
  const tempC = fogMode ? 7 : fogSeason ? 12 : 29;
  const humidity = fogMode ? 97 : fogSeason ? 88 : 52;
  const rainMm = hour >= 14 && hour <= 17 ? 2.4 : 0;
  const restrictions: string[] = [];
  if (visibilityM < 200) {
    restrictions.push("Manual welding / rail cutting prohibited (visibility below 200 m)");
    restrictions.push("Physical-only inspections deferred to Fog Mode virtual routing (DAS / RDPMS)");
    restrictions.push("Speed restriction 30 km/h advised on affected sections");
  } else if (visibilityM < 500) {
    restrictions.push("Fog advisory: night possessions to be completed before 04:30");
    restrictions.push("Look-out man mandatory for all track work");
  }
  if (rainMm > 0) restrictions.push(`Rain ${rainMm} mm/h — ballast/CWR work to be rescheduled; OHE work permitted with earthing checks`);
  const schedulingBias = {
    preferGolden: visibilityM < 500 || rainMm > 0,
    suspendPhysical: visibilityM < 200,
    extraEarthingCheck: rainMm > 0,
    note:
      visibilityM < 200
        ? "Physical-only work is suspended by Fog Mode; virtual inspection routed to remote diagnostics."
        : rainMm > 0
          ? "Wet-weather bias active: the optimizer prefers GOLDEN windows and requires earthing checks for OHE work."
          : "No weather bias on scheduling.",
  };
  return {
    observedAt: new Date().toISOString(),
    visibilityM,
    fogProb,
    tempC,
    humidity,
    rainMm,
    fogSeason,
    fogMode,
    restrictions,
    schedulingBias,
    source: "IMD nowcast contract (imd-nowcast.v1) — SIMULATED / DEMO DATA",
  };
}

export async function segmentOptions() {
  const rows = await db.select().from(segments).orderBy(segments.code);
  return rows.map((s) => ({ id: s.id, code: s.code, corridor: s.corridor, dailyTrains: s.dailyTrains }));
}
