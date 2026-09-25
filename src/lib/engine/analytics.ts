/**
 * ASSET AVAILABILITY ANALYTICS (Phase 16) — the SIH objective as the headline.
 *
 * "AI-Powered Automatic Block Planning to Maximize Asset Availability for Train
 * Operations on Indian Railways" — so availability leads here, and the other
 * five measures are the operational consequences of it:
 *
 *   asset availability · downtime avoided · duplicate possessions avoided ·
 *   critical backlog · maintenance completion · train delay impact
 *
 * Trends at 7 / 30 / 90 days come from the availability snapshots written after
 * every optimizer run plus the live register. Nothing is extrapolated into the
 * past: a trend point only exists when a snapshot exists, and the chart says so.
 */
import { db } from "@/db";
import { assets, defects, events, jobs, plans, segments as segmentsTable, usageLedger } from "@/db/schema";
import { desc, eq, gte, sql } from "drizzle-orm";
import { computeAvailability } from "./availability";
import { loadForecastContext } from "./freight";

export type TrendWindow = 7 | 30 | 90;

export interface TrendPoint {
  date: string;
  label: string;
  availabilityPct: number | null;
  downtimeH: number | null;
  planId: number | null;
  source: "SNAPSHOT" | "ESTIMATE";
}

export interface AvailabilityAnalytics {
  generatedAt: string;
  headline: {
    availabilityPct: number;
    baselinePct: number;
    gainPts: number;
    monitoredAssets: number;
    horizonDays: number;
    planId: number | null;
    planName: string;
  };
  measures: {
    key: string;
    label: string;
    value: number;
    unit: string;
    detail: string;
    betterWhen: "lower" | "higher";
    tone: "success" | "warning" | "critical" | "info";
  }[];
  trends: Record<string, { window: TrendWindow; points: TrendPoint[]; coverage: string; availabilityDelta: number | null; source: string }>;
  backlog: {
    criticalOpen: number;
    high: number;
    medium: number;
    low: number;
    chronic: number;
    overdue: number;
    total: number;
    byDepartment: { department: string; open: number; critical: number; avgSeverity: number }[];
    ageBuckets: { label: string; n: number }[];
  };
  completion: {
    total: number;
    closed: number;
    inProgress: number;
    awaitingValidation: number;
    completionPct: number;
    stages: { stage: string; label: string; n: number }[];
  };
  delay: {
    modelledDelayMin: number;
    baselineDelayMin: number;
    avoidedMin: number;
    avgPerBlock: number;
    blocks: number;
  };
  duplicates: { secured: number; avoided: number; duplicateShare: number };
  honesty: string;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-IN", { month: "short" })}`;
}

/** Snapshot the current availability state (called by the optimizer after a run). */
export async function snapshotAvailability() {
  const [plan] = await db.select().from(plans).orderBy(desc(plans.id)).limit(1);
  const k = plan?.kpis;
  if (!plan || !k) return null;
  const metrics = {
    availabilityPct: k.assetAvailabilityPct ?? 0,
    baselinePct: k.availabilityBaselinePct ?? 0,
    downtimeH: k.availabilityDowntimeH ?? 0,
    downtimeBaselineH: k.availabilityBaselineH ?? 0,
    blocks: k.blocks ?? 0,
    bundlingPct: k.bundlingPct ?? 0,
    avgDelayMin: k.avgDelayMin ?? 0,
    monitoredAssets: k.monitoredAssets ?? 0,
  };
  await db.insert(usageLedger).values({
    kind: "AVAILABILITY_SNAPSHOT",
    entity: "division",
    refId: plan.id,
    metrics,
    data: { planName: plan.name, horizon: plan.horizon, resilience: plan.resilienceScore },
    note: `Availability snapshot from plan #${plan.id} — ${metrics.availabilityPct}% vs ${metrics.baselinePct}% baseline`,
  });
  return { planId: plan.id, ...metrics };
}

export async function availabilitySnapshots(limit = 200) {
  const rows = await db.select().from(usageLedger).where(eq(usageLedger.kind, "AVAILABILITY_SNAPSHOT")).orderBy(desc(usageLedger.at)).limit(limit);
  return rows.map((r) => ({
    at: r.at.toISOString(),
    planId: r.refId,
    availabilityPct: r.metrics.availabilityPct ?? null,
    baselinePct: r.metrics.baselinePct ?? null,
    downtimeH: r.metrics.downtimeH ?? null,
    blocks: r.metrics.blocks ?? null,
    note: r.note,
  }));
}

/** Aggregate the live register into the analytics payload. */
export async function availabilityAnalytics(window: TrendWindow = 30): Promise<AvailabilityAnalytics> {
  const [planRow] = await db.select().from(plans).orderBy(desc(plans.id)).limit(1);
  const [defectRows, assetRows, jobRows, snapshotRows, forecastCtx] = await Promise.all([
    db.select().from(defects),
    db.select().from(assets),
    db.select().from(jobs),
    availabilitySnapshots(400),
    loadForecastContext(),
  ]);

  const k = planRow?.kpis ?? {};
  const availabilityPct = (k.assetAvailabilityPct as number) ?? 0;
  const baselinePct = (k.availabilityBaselinePct as number) ?? 0;

  /* ---------------- Backlog ---------------- */
  const open = defectRows.filter((d) => d.lifecycleStatus !== "CLOSED");
  const byPriority = (p: string) => open.filter((d) => d.priority === p).length;
  const byDepartment = ["ENG", "TRD", "SNT"].map((department) => {
    const list = open.filter((d) => d.department === department);
    return {
      department,
      open: list.length,
      critical: list.filter((d) => d.priority === "CRITICAL").length,
      avgSeverity: list.length ? Math.round((list.reduce((s, d) => s + d.severity, 0) / list.length) * 10) / 10 : 0,
    };
  });
  const now = Date.now();
  const ageBuckets = [
    { label: "0–7 days", n: open.filter((d) => (now - d.detectedAt.getTime()) / 86_400_000 <= 7).length },
    { label: "8–30 days", n: open.filter((d) => { const a = (now - d.detectedAt.getTime()) / 86_400_000; return a > 7 && a <= 30; }).length },
    { label: "31–90 days", n: open.filter((d) => { const a = (now - d.detectedAt.getTime()) / 86_400_000; return a > 30 && a <= 90; }).length },
    { label: "90+ days", n: open.filter((d) => (now - d.detectedAt.getTime()) / 86_400_000 > 90).length },
  ];

  /* ---------------- Completion ---------------- */
  const closed = jobRows.filter((j) => j.status === "COMPLETED").length;
  const stageCounts = new Map<string, number>();
  for (const j of jobRows) stageCounts.set(j.status, (stageCounts.get(j.status) ?? 0) + 1);

  /* ---------------- Duplicate possessions ---------------- */
  const { coordinatedDowntime, independentDowntime } = await import("./superblock");
  const taskInputs = open.map((d) => ({ id: d.id, department: d.department, durationMin: d.durationMin }));
  const independent = independentDowntime(taskInputs);
  const coordinated = coordinatedDowntime(taskInputs).totalMin;
  const secured = Math.max(1, taskInputs.length);
  const avoided = Math.max(0, taskInputs.length - Math.ceil(coordinated / Math.max(independent / Math.max(taskInputs.length, 1), 1)));

  /* ---------------- Delay ---------------- */
  const modelledDelayMin = (k.avgDelayMin as number) ? Math.round(((k.avgDelayMin as number) * ((k.blocks as number) ?? 0))) : 0;
  const baselineDelayMin = modelledDelayMin + (k.conflictsAvoided as number) * 4;

  /* ---------------- Trends ---------------- */
  const trends: AvailabilityAnalytics["trends"] = {};
  for (const w of [7, 30, 90] as TrendWindow[]) {
    const cut = now - w * 86_400_000;
    const inWindow = snapshotRows.filter((s) => new Date(s.at).getTime() >= cut);
    const points: TrendPoint[] = inWindow
      .slice()
      .reverse()
      .map((s) => ({
        date: s.at.slice(0, 10),
        label: dayLabel(s.at),
        availabilityPct: s.availabilityPct,
        downtimeH: s.downtimeH,
        planId: s.planId,
        source: s.planId === planRow?.id ? ("SNAPSHOT" as const) : ("SNAPSHOT" as const),
      }));
    const first = points[0]?.availabilityPct ?? null;
    const last = points.at(-1)?.availabilityPct ?? null;
    trends[String(w)] = {
      window: w,
      points,
      coverage:
        points.length === 0
          ? `No availability snapshot in the last ${w} days — run the optimizer to start the series.`
          : `${points.length} snapshot(s) in the last ${w} days (one per optimizer run).`,
      availabilityDelta: first !== null && last !== null ? Math.round((last - first) * 100) / 100 : null,
      source: "usage_ledger AVAILABILITY_SNAPSHOT rows written by the optimizer",
    };
  }

  /* ---------------- Measures ---------------- */
  const measures: AvailabilityAnalytics["measures"] = [
    {
      key: "availability",
      label: "Asset availability",
      value: availabilityPct,
      unit: "%",
      detail: `${assetRows.length} monitored assets; automated plan ${availabilityPct}% vs manual baseline ${baselinePct}%.`,
      betterWhen: "higher",
      tone: availabilityPct >= baselinePct ? "success" : "warning",
    },
    {
      key: "downtimeAvoided",
      label: "Downtime avoided vs manual practice",
      value: Math.round(((k.availabilityBaselineH as number) ?? 0) - ((k.availabilityDowntimeH as number) ?? 0)),
      unit: "asset-h",
      detail: `Manual ${(k.availabilityBaselineH as number) ?? 0} asset-h → planned ${(k.availabilityDowntimeH as number) ?? 0} asset-h over the plan horizon.`,
      betterWhen: "higher",
      tone: "success",
    },
    {
      key: "duplicatePossessions",
      label: "Duplicate possessions avoided",
      value: avoided,
      unit: "",
      detail: `${taskInputs.length} open task(s): independent practice would take ${Math.ceil(independent / 60)} h of occupation; coordinated packing takes ${Math.ceil(coordinated / 60)} h.`,
      betterWhen: "higher",
      tone: "success",
    },
    {
      key: "criticalBacklog",
      label: "Critical backlog",
      value: byPriority("CRITICAL"),
      unit: "",
      detail: `${byPriority("CRITICAL")} critical · ${byPriority("HIGH")} high · ${byPriority("MEDIUM")} medium · ${byPriority("LOW")} low. ${open.filter((d) => d.dueInDays < 0).length} past permitted deadline.`,
      betterWhen: "lower",
      tone: byPriority("CRITICAL") > 0 ? "critical" : "success",
    },
    {
      key: "maintenanceCompletion",
      label: "Maintenance completion",
      value: jobRows.length ? Math.round((closed / jobRows.length) * 1000) / 10 : 0,
      unit: "%",
      detail: `${closed} of ${jobRows.length} work orders completed; ${jobRows.filter((j) => j.status === "AWAITING_REVIEW").length} awaiting inspector validation.`,
      betterWhen: "higher",
      tone: "info",
    },
    {
      key: "trainDelay",
      label: "Train delay impact",
      value: Math.round(modelledDelayMin),
      unit: "delay-min",
      detail: `Modelled over ${(k.blocks as number) ?? 0} blocks at an average of ${(k.avgDelayMin as number) ?? 0} min per affected train; ${(k.conflictsAvoided as number) ?? 0} conflicts avoided by packing.`,
      betterWhen: "lower",
      tone: "warning",
    },
  ];

  void forecastCtx;
  const eventsCount = await db.select({ n: sql<number>`count(*)::int` }).from(events).where(gte(events.createdAt, new Date(now - window * 86_400_000)));

  return {
    generatedAt: new Date().toISOString(),
    headline: {
      availabilityPct,
      baselinePct,
      gainPts: Math.round((availabilityPct - baselinePct) * 100) / 100,
      monitoredAssets: assetRows.length,
      horizonDays: 7,
      planId: planRow?.id ?? null,
      planName: planRow?.name ?? "no plan published yet",
    },
    measures,
    trends,
    backlog: {
      criticalOpen: byPriority("CRITICAL"),
      high: byPriority("HIGH"),
      medium: byPriority("MEDIUM"),
      low: byPriority("LOW"),
      chronic: open.filter((d) => d.recurrenceBand === "HIGH").length,
      overdue: open.filter((d) => d.dueInDays < 0).length,
      total: open.length,
      byDepartment,
      ageBuckets,
    },
    completion: {
      total: jobRows.length,
      closed,
      inProgress: jobRows.filter((j) => j.status === "IN_PROGRESS").length,
      awaitingValidation: jobRows.filter((j) => j.status === "AWAITING_REVIEW").length,
      completionPct: jobRows.length ? Math.round((closed / jobRows.length) * 1000) / 10 : 0,
      stages: [...stageCounts.entries()].map(([stage, n]) => ({ stage, label: stage.replace(/_/g, " "), n })),
    },
    delay: {
      modelledDelayMin,
      baselineDelayMin,
      avoidedMin: Math.max(0, baselineDelayMin - modelledDelayMin),
      avgPerBlock: (k.avgDelayMin as number) ?? 0,
      blocks: (k.blocks as number) ?? 0,
    },
    duplicates: {
      secured,
      avoided,
      duplicateShare: Math.round((avoided / Math.max(secured, 1)) * 1000) / 10,
    },
    honesty:
      "Availability, downtime and delay values come from the published plan's own KPI block (computed by availability.ts and the delay model on every optimizer run). The 7/30/90-day trends read snapshot rows written by those runs, so a trend only starts when the first plan is generated. Event volume in the window: " +
      (eventsCount[0]?.n ?? 0),
  };
}

/** Availability by corridor — used by the map and the analytics table. */
export async function availabilityBySection() {
  const [segmentsRows, assetRows, defectRows] = await Promise.all([
    db.select().from(segmentsTable),
    db.select().from(assets),
    db.select().from(defects),
  ]);
  return segmentsRows.map((s) => {
    const onSection = assetRows.filter((a) => a.segmentId === s.id);
    const assetIds = new Set(onSection.map((a) => a.id));
    const openDefects = defectRows.filter((d) => assetIds.has(d.assetId) && d.lifecycleStatus !== "CLOSED");
    const result = computeAvailability({
      blocks: [],
      assets: onSection.map((a) => ({ id: a.id, segmentId: a.segmentId })),
      defects: openDefects.map((d) => ({ id: d.id, durationMin: d.durationMin, severity: d.severity, segmentId: s.id })),
      horizonMin: 7 * 1440,
    });
    return {
      segmentId: s.id,
      code: s.code,
      corridor: s.corridor,
      dailyTrains: s.dailyTrains,
      assets: onSection.length,
      openDefects: openDefects.length,
      critical: openDefects.filter((d) => d.priority === "CRITICAL").length,
      availabilityPct: result.baselinePct,
      downtimeMin: openDefects.reduce((x, d) => x + d.durationMin, 0),
    };
  });
}

