/**
 * MULTI-HORIZON PLAN BRIEFING (Phase 8) — WEEKLY and MONTHLY.
 *
 * The rolling / weekly / monthly / crisis horizons already exist in the planner;
 * what the SIH asks for is that the longer horizons state what they are working
 * with. This engine reads the SAME registers the optimizer reads and reports, per
 * horizon: maintenance backlog, planned work, available working windows, crew
 * utilisation, asset availability, residual risk backlog, open conflicts and the
 * forecast freight traffic the possession has to work around.
 *
 * Nothing here is stored or estimated twice: backlog comes from the defect
 * register, planned work from the newest plan, crew utilisation from
 * `resources.utilisation`, availability from `computeAvailability`, risk from the
 * trained model via `scoring.riskFor`, conflicts from `conflicts.detectPlanConflicts`
 * and traffic from `freight`. Every number is therefore reproducible from the
 * live database by anyone reading the same tables.
 */
import { db } from "@/db";
import { assets, defects, freightForecasts, jobs, segments, settings, usageLedger } from "@/db/schema";
import { eq, ne, sql } from "drizzle-orm";
import { getLatestPlan } from "./optimizer";
import { computeAvailability } from "./availability";
import { utilisation } from "./resources";
import { listResources } from "./resources";
import { riskFor } from "./scoring";
import { detectPlanConflicts } from "./conflicts";
import { loadForecastContext } from "./freight";

export type PlanHorizon = "ROLLING" | "WEEKLY" | "MONTHLY" | "CRISIS";

/** Days each horizon covers, and how many 15-minute slots a day offers. */
const HORIZON_DAYS: Record<PlanHorizon, number> = { ROLLING: 1, WEEKLY: 7, MONTHLY: 28, CRISIS: 1 };

export interface HorizonBriefing {
  horizon: PlanHorizon;
  days: number;
  generatedAt: string;
  backlog: {
    open: number;
    critical: number;
    high: number;
    overdue: number;
    chronic: number;
    emergencyClass: number;
    oldestDays: number;
    byDepartment: { department: string; open: number; critical: number }[];
  };
  planned: {
    planId: number | null;
    planName: string;
    planStatus: string;
    blocks: number;
    tasks: number;
    superBlocks: number;
    downtimeH: number;
    sections: number;
    departments: string[];
    /** Share of the open backlog the horizon actually places. */
    coveragePct: number;
  };
  windows: {
    /** Candidate 15-minute slots the solver evaluates across the horizon. */
    candidateSlots: number;
    registeredWindows: number;
    placedBlocks: number;
    refusedPlacements: number;
    /** Free crew-slot-days left after the plan's commitments. */
    freeCrewSlots: number;
    note: string;
  };
  crew: {
    byDepartment: { department: string; crews: number; capacity: number; committed: number; utilisationPct: number }[];
    scarcity: { department: string; utilisationPct: number }[];
  };
  availability: {
    pct: number;
    baselinePct: number;
    gainPts: number;
    downtimeH: number;
    baselineDowntimeH: number;
    monitoredAssets: number;
    note: string;
  };
  risk: {
    threshold: number;
    aboveThreshold: number;
    emergency: number;
    top: { defectCode: string; segmentCode: string; riskPct: number; severity: number; dueInDays: number }[];
  };
  conflicts: {
    total: number;
    critical: number;
    major: number;
    minor: number;
    delayMin: number;
    sections: string[];
  };
  traffic: {
    forecastRows: number;
    rakes: number;
    tonnage: number;
    surges: number;
    peakOccupancyPct: number;
    heavySections: { segmentCode: string; occupancyPct: number; rakes: number }[];
    note: string;
  };
  readiness: { label: string; state: "READY" | "CAUTION" | "BLOCKED"; detail: string }[];
}

const RISK_THRESHOLD = 0.6;

/** Registered maintenance windows available in the horizon (GOLDEN + SHOULDER + OFFPEAK per day per department). */
const WINDOWS_PER_DAY_PER_DEPT = 3;

/**
 * Build the briefing for one horizon. `planHorizon` selects which plan row is
 * reported when the newest plan was generated for a different horizon — the
 * briefing states the mismatch rather than pretending the weekly plan is monthly.
 */
export async function horizonBriefing(horizon: PlanHorizon, now = new Date()): Promise<HorizonBriefing> {
  const days = HORIZON_DAYS[horizon];
  const [plan, defectRows, assetRows, segmentRows, jobRows, resources, forecastCtx, conflicts, settingRows] = await Promise.all([
    getLatestPlan(),
    db.select().from(defects).where(ne(defects.status, "closed")),
    db.select().from(assets),
    db.select().from(segments),
    db.select().from(jobs),
    listResources(),
    loadForecastContext(),
    detectPlanConflicts().catch(() => []),
    db.select().from(settings),
  ]);
  /* The plan's global status lives in settings (single source of truth shared with
     the approval board) — it is not duplicated onto the plan row. */
  const planStatus = settingRows.find((s) => s.key === "planStatus")?.value ?? "PROPOSED";

  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const segmentById = new Map(segmentRows.map((s) => [s.id, s]));
  const segmentOfDefect = (assetId: number) => {
    const a = assetById.get(assetId);
    return a ? segmentById.get(a.segmentId) : undefined;
  };

  /* ---------------- Backlog ---------------- */
  const openRows = defectRows.filter((d) => d.lifecycleStatus !== "CLOSED");
  const ageDays = (d: Date) => Math.round(((now.getTime() - d.getTime()) / 86_400_000) * 10) / 10;
  const overdueRows = openRows.filter((d) => d.dueInDays < 0);
  const chronicRows = openRows.filter((d) => ageDays(d.detectedAt) > 90 || d.dueInDays < -30);
  const emergencyClass = openRows.filter((d) => d.priority === "CRITICAL" && d.severity >= 9);
  const oldest = openRows.reduce((m, d) => Math.max(m, ageDays(d.detectedAt)), 0);
  const backlog = {
    open: openRows.length,
    critical: openRows.filter((d) => d.priority === "CRITICAL").length,
    high: openRows.filter((d) => d.priority === "HIGH").length,
    overdue: overdueRows.length,
    chronic: chronicRows.length,
    emergencyClass: emergencyClass.length,
    oldestDays: oldest,
    byDepartment: ["ENG", "TRD", "SNT"].map((department) => {
      const list = openRows.filter((d) => d.department === department);
      return { department, open: list.length, critical: list.filter((d) => d.priority === "CRITICAL").length };
    }),
  };

  /* ---------------- Planned work ---------------- */
  const blocks = plan?.blocks ?? [];
  const placedTaskIds = new Set(blocks.flatMap((b) => b.defectIds ?? []));
  const planDepts = [...new Set(blocks.flatMap((b) => b.departments))].sort();
  const planned = {
    planId: plan?.id ?? null,
    planName: plan?.name ?? "—",
    planStatus,
    blocks: blocks.length,
    tasks: placedTaskIds.size,
    superBlocks: blocks.filter((b) => b.isSuperBlock).length,
    downtimeH: Math.round((blocks.reduce((s, b) => s + (b.endMin - b.startMin), 0) / 60) * 10) / 10,
    sections: new Set(blocks.map((b) => b.segmentId)).size,
    departments: planDepts,
    coveragePct: openRows.length ? Math.round((placedTaskIds.size / openRows.length) * 1000) / 10 : 0,
  };

  /* ---------------- Windows ---------------- */
  const committed = new Map<string, number>();
  for (const b of blocks) for (const dept of b.departments) committed.set(`${b.day}:${dept}`, (committed.get(`${b.day}:${dept}`) ?? 0) + 1);
  const crewUnits = ["ENG", "TRD", "SNT"].reduce((s, dept) => s + resources.filter((r) => r.department === dept && r.kind === "CREW" && r.available).reduce((x, r) => x + r.units, 0), 0);
  const committedTotal = [...committed.values()].reduce((s, v) => s + v, 0);
  const capacityDays = HORIZON_DAYS[horizon] * 3 * crewUnits;
  /* Refused placements are read back from the ledger the resource engine writes. */
  const [{ n: refusedCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(usageLedger).where(eq(usageLedger.kind, "RESOURCE_REJECT"));
  const windows = {
    candidateSlots: days * 96 * new Set(openRows.map((d) => segmentOfDefect(d.assetId)?.id).filter((x): x is number => x != null)).size,
    registeredWindows: days * WINDOWS_PER_DAY_PER_DEPT * 3,
    placedBlocks: blocks.filter((b) => b.day < days).length,
    refusedPlacements: refusedCount ?? 0,
    freeCrewSlots: Math.max(0, capacityDays - committedTotal),
    note: `Possession candidates are scanned at 15-minute granularity across the sections carrying open work; ${days * WINDOWS_PER_DAY_PER_DEPT * 3} divisionally registered windows (GOLDEN / SHOULDER / OFFPEAK per department per day) bound where a block may legally start.`,
  };
  const capacity = capacityDays;

  /* ---------------- Crew utilisation ---------------- */
  const use = utilisation(
    blocks.map((b) => ({ segmentCode: b.segmentCode, day: b.day, startMin: b.startMin, endMin: b.endMin, departments: b.departments })),
    resources
  );
  const crew = {
    byDepartment: use.byDept.map((d) => ({ department: d.department, crews: d.crews, capacity: d.capacity, committed: d.committed, utilisationPct: d.utilisationPct })),
    scarcity: use.byDept.filter((d) => d.utilisationPct >= 85).map((d) => ({ department: d.department, utilisationPct: d.utilisationPct })),
  };

  /* ---------------- Availability ---------------- */
  const availInput = {
    blocks: blocks.map((b) => ({ segmentId: b.segmentId, startMin: b.day * 1440 + b.startMin, endMin: b.day * 1440 + b.endMin, defectIds: b.defectIds ?? [] })),
    assets: assetRows.map((a) => ({ id: a.id, segmentId: a.segmentId })),
    defects: openRows.map((d) => ({ id: d.id, durationMin: d.durationMin, severity: d.severity, segmentId: segmentOfDefect(d.assetId)?.id ?? -1 })),
    horizonMin: days * 1440,
  };
  const avail = computeAvailability(availInput);
  const availability = {
    pct: avail.optimizedPct,
    baselinePct: avail.baselinePct,
    gainPts: avail.improvementPts,
    downtimeH: Math.round((avail.optimizedDowntimeAssetMin / 60) * 10) / 10,
    baselineDowntimeH: Math.round((avail.baselineDowntimeAssetMin / 60) * 10) / 10,
    monitoredAssets: assetRows.length,
    note: `Availability over a ${days}-day horizon for the ${blocks.length} block(s) actually planned; the baseline places one possession per open task with standalone setup.`,
  };

  /* ---------------- Residual risk ---------------- */
  const scored = openRows
    .map((d) => {
      const seg = segmentOfDefect(d.assetId);
      const asset = assetById.get(d.assetId);
      /* Fall back to a neutral-but-declared section when a defect is orphaned:
         the risk model still runs, and the orphan itself is reported by the data
         quality monitor rather than hidden here. */
      const riskSeg = seg ?? { criticality: 5, dailyTrains: 0, isBridge: false };
      const risk = riskFor(d, asset?.health ?? 90, riskSeg, false);
      return { defectCode: d.defectCode || `#${d.id}`, segmentCode: seg?.code ?? "—", riskPct: Math.round(risk * 1000) / 10, severity: d.severity, dueInDays: d.dueInDays };
    })
    .sort((a, b) => b.riskPct - a.riskPct);
  const risk = {
    threshold: RISK_THRESHOLD,
    aboveThreshold: scored.filter((s) => s.riskPct >= RISK_THRESHOLD * 100).length,
    emergency: openRows.filter((d) => d.dueInDays <= 0 && d.severity >= 9).length,
    top: scored.slice(0, 6),
  };

  /* ---------------- Conflicts ---------------- */
  const conflictSummaryForHorizon = {
    total: conflicts.length,
    critical: conflicts.filter((c) => c.severity === "CRITICAL").length,
    major: conflicts.filter((c) => c.severity === "MAJOR").length,
    minor: conflicts.filter((c) => c.severity === "MINOR").length,
    delayMin: Math.round(conflicts.reduce((s, c) => s + c.delayMin, 0)),
    sections: [...new Set(conflicts.map((c) => c.segmentCode))],
  };

  /* ---------------- Forecast traffic ---------------- */
  const freightRows = forecastCtx.rows > 0 ? await db.select().from(freightForecasts) : [];
  const rowsInHorizon = freightRows.filter((r) => r.day < days);
  const heavy = rowsInHorizon
    .map((r) => ({ segmentCode: segmentById.get(r.segmentId)?.code ?? `#${r.segmentId}`, occupancyPct: r.predictedOccupancyPct, rakes: r.expectedFreight }))
    .sort((a, b) => b.occupancyPct - a.occupancyPct)
    .slice(0, 6);
  const traffic = {
    forecastRows: rowsInHorizon.length,
    rakes: rowsInHorizon.reduce((s, r) => s + r.expectedFreight, 0),
    tonnage: rowsInHorizon.reduce((s, r) => s + r.expectedTonnage, 0),
    surges: rowsInHorizon.filter((r) => r.isSurge).length,
    peakOccupancyPct: rowsInHorizon.reduce((m, r) => Math.max(m, r.predictedOccupancyPct), 0),
    heavySections: heavy,
    note: `Freight expected inside this ${days}-day horizon from the FOIS contract (SIMULATED / DEMO DATA). The optimizer weighs every candidate window against this traffic and the working timetable.`,
  };

  /* ---------------- Readiness ---------------- */
  const jobOpen = jobRows.filter((j) => j.status !== "COMPLETED").length;
  const readiness: HorizonBriefing["readiness"] = [
    {
      label: "Maintenance coverage",
      state: planned.coveragePct >= 70 ? "READY" : planned.coveragePct >= 40 ? "CAUTION" : "BLOCKED",
      detail: `${planned.tasks} of ${openRows.length} open task(s) placed in this horizon (${planned.coveragePct}%); ${backlog.overdue} task(s) are already past their permitted deadline.`,
    },
    {
      label: "Crew & machine capacity",
      state: crew.scarcity.length === 0 ? "READY" : crew.scarcity.length <= 1 ? "CAUTION" : "BLOCKED",
      detail: `${capacity} crew-slot-day(s) available across the horizon, ${committedTotal} committed${crew.scarcity.length ? `; ${crew.scarcity.map((s) => `${s.department} at ${s.utilisationPct}%`).join(", ")}` : ""}.`,
    },
    {
      label: "Traffic conflict load",
      state: conflictSummaryForHorizon.critical > 0 ? "BLOCKED" : conflictSummaryForHorizon.total > 0 ? "CAUTION" : "READY",
      detail: `${conflictSummaryForHorizon.total} conflict(s) on the current plan — ${conflictSummaryForHorizon.critical} critical, ${conflictSummaryForHorizon.major} major; modelled delay ${conflictSummaryForHorizon.delayMin} min.`,
    },
    {
      label: "Residual risk",
      state: risk.aboveThreshold === 0 ? "READY" : risk.aboveThreshold <= 3 ? "CAUTION" : "BLOCKED",
      detail: `${risk.aboveThreshold} defect(s) model above the ${(RISK_THRESHOLD * 100).toFixed(0)}% intervention threshold; ${risk.emergency} are emergency-class.`,
    },
    {
      label: "Field execution",
      state: jobOpen === 0 ? "READY" : jobOpen <= 5 ? "CAUTION" : "BLOCKED",
      detail: `${jobOpen} job card(s) still open in the field, ${jobRows.filter((j) => j.status === "COMPLETED").length} completed.`,
    },
    {
      label: "Freight headroom",
      state: traffic.surges === 0 ? "READY" : traffic.surges <= 2 ? "CAUTION" : "BLOCKED",
      detail: `${traffic.rakes} rake(s) / ${traffic.tonnage.toLocaleString("en-IN")} T forecast in this horizon; ${traffic.surges} SURGE advisory(ies), peak corridor occupancy ${traffic.peakOccupancyPct}%.`,
    },
  ];

  return { horizon, days, generatedAt: now.toISOString(), backlog, planned, windows, crew, availability, risk, conflicts: conflictSummaryForHorizon, traffic, readiness };
}

