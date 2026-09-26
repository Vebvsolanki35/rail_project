import { db } from "@/db";
import { assets, defects, events, jobs, plans, segments, settings, stations } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { ensureSeeded } from "./seed";
import { getLatestPlan } from "./optimizer";
import { currentWeather } from "./simulate";
import { getLiveTrains } from "./livetrains";
import { scoreDefect, riskFor } from "./optimizer";
import { getModelCard } from "./ml";
import { backfillLifecycle, lifecycleRollup } from "./defectlifecycle";
import { STAGE_CONFIG, type LifecycleStage, type RecurrenceLevel } from "./lifecycleStages";
import { classifyUrgency, urgencyBoost, urgencyQueue, urgencyScore, scoreForQueue } from "./urgency";
import { superBlockKpis, type SBCandidate } from "./superblock";
import { planQuality } from "./quality";
import type { AlternativeDefect } from "./alternatives";
import type {
  DashboardState,
  DefectDTO,
  EventDTO,
  OverrunInfo,
  SettingsDTO,
  StationDTO,
  SegmentDTO,
  Department,
} from "./types";

export async function getSettings(): Promise<SettingsDTO> {
  await ensureSeeded();
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    fogMode: map.get("fogMode") === "true",
    vipAlert: map.get("vipAlert") === "true",
    dtpRedZone: map.get("dtpRedZone") !== "false",
    planStatus: (map.get("planStatus") as SettingsDTO["planStatus"]) || "PROPOSED",
  };
}

export async function setSetting(
  key: "fogMode" | "vipAlert" | "dtpRedZone" | "planStatus",
  value: boolean | string
): Promise<void> {
  await ensureSeeded();
  await db
    .insert(settings)
    .values({ key, value: String(value) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: String(value) },
    });
}

/** Legacy seeded rows get lifecycle codes/stages on first read (idempotent). */
async function ensureLifecycleReady(): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(defects).where(eq(defects.defectCode, ""));
  if ((row?.n ?? 0) > 0) await backfillLifecycle();
}

export async function getDefectDTOs(): Promise<DefectDTO[]> {
  await ensureSeeded();
  await ensureLifecycleReady();
  const [defectRows, segRows, assetRows, setRow] = await Promise.all([
    db.select().from(defects).orderBy(desc(defects.severity)),
    db.select().from(segments),
    db.select().from(assets),
    getSettings(),
  ]);
  const segById = new Map(segRows.map((s) => [s.id, s]));
  const assetById = new Map(assetRows.map((a) => [a.id, a]));

  const dto = defectRows.map((d) => {
    const asset = assetById.get(d.assetId);
    const seg = asset ? segById.get(asset.segmentId) : null;
    const health = asset?.health ?? 65;
    const prob = seg ? riskFor(d, health, seg, setRow.fogMode) : 0.5;
    const aiScore = seg ? scoreDefect(d, seg, { fogMode: setRow.fogMode, assetHealth: health }) : d.severity * 10;
    const stage = (d.lifecycleStatus || "REPORTED") as LifecycleStage;
    const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.REPORTED;
    const uScore = urgencyScore({
      severity: d.severity,
      dueInDays: d.dueInDays,
      overdueDays: d.overdueDays,
      recurrenceBand: d.recurrenceBand as RecurrenceLevel,
    });
    const boost = urgencyBoost(uScore);
    return {
      id: d.id,
      defectCode: d.defectCode || `#${d.id}`,
      segmentId: asset?.segmentId ?? 0,
      segmentCode: seg?.code ?? "?",
      corridor: seg?.corridor ?? "?",
      department: d.department as Department,
      sourceSystem: d.sourceSystem,
      title: d.title,
      severity: d.severity,
      overdueDays: d.overdueDays,
      durationMin: d.durationMin,
      inspectionMode: d.inspectionMode,
      failureProb72h: Math.round(prob * 100),
      status: d.status,
      aiScore,
      lifecycleStatus: stage,
      lifecycleLabel: cfg.label,
      stageIndex: Object.keys(STAGE_CONFIG).indexOf(stage),
      happening: cfg.happening,
      next: cfg.next,
      responsible: cfg.responsible,
      nextAction: cfg.action?.label ?? null,
      priority: d.priority as DefectDTO["priority"],
      dueInDays: d.dueInDays,
      recurrenceBand: d.recurrenceBand,
      occurrences: d.occurrences,
      detailedInspection: d.detailedInspection,
      urgencyClass: classifyUrgency(d.dueInDays, d.severity),
      urgencyScore: uScore,
      boost,
      sortKey: Math.round(aiScore * boost * 10) / 10,
      escalatedByRecurrence: d.recurrenceBand === "HIGH" && d.severity < 8,
    } satisfies DefectDTO;
  });

  // The queue the planner actually consumes: urgency-boosted ordering.
  return dto.sort((a, b) => b.sortKey - a.sortKey || b.severity - a.severity);
}

export async function getDefectDTO(id: number): Promise<DefectDTO | null> {
  const all = await getDefectDTOs();
  return all.find((d) => d.id === id) ?? null;
}

export async function getDefects(): Promise<DefectDTO[]> {
  return getDefectDTOs();
}

export async function getEvents(): Promise<EventDTO[]> {
  await ensureSeeded();
  const rows = await db.select().from(events).orderBy(desc(events.id)).limit(30);
  return rows.map((e) => ({
    id: e.id,
    kind: e.kind as EventDTO["kind"],
    message: e.message,
    createdAt: e.createdAt.toISOString(),
  }));
}

/* ------------------------------------------------------------------ */
/*  Super-block candidate assembly (shared by dashboard + planner)     */
/* ------------------------------------------------------------------ */

export async function superBlockCandidates(): Promise<SBCandidate[]> {
  const [defectRows, assetRows, segRows, jobRows, latestPlan] = await Promise.all([
    db.select().from(defects),
    db.select().from(assets),
    db.select().from(segments),
    db.select().from(jobs).where(eq(jobs.status, "COMPLETED")),
    getLatestPlan(),
  ]);
  void latestPlan;
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const segById = new Map(segRows.map((s) => [s.id, s]));

  // Days since the section was last occupied (completed jobs are our history).
  const lastBlocked = new Map<number, number>();
  for (const j of jobRows) {
    const days = (Date.now() - j.updatedAt.getTime()) / 86400000;
    const prev = lastBlocked.get(j.segmentId);
    if (prev === undefined || days < prev) lastBlocked.set(j.segmentId, days);
  }

  const bySegment = new Map<number, SBCandidate>();
  for (const d of defectRows) {
    if (d.status === "closed" || d.lifecycleStatus === "CLOSED") continue;
    const asset = assetById.get(d.assetId);
    const seg = asset ? segById.get(asset.segmentId) : null;
    if (!seg) continue;
    let cand = bySegment.get(seg.id);
    if (!cand) {
      cand = {
        segmentId: seg.id,
        segmentCode: seg.code,
        corridor: seg.corridor,
        dailyTrains: seg.dailyTrains,
        criticality: seg.criticality,
        isBridge: seg.isBridge,
        isLevelCrossing: seg.isLevelCrossing,
        lastBlockedDaysAgo: lastBlocked.has(seg.id) ? Math.round(lastBlocked.get(seg.id)!) : null,
        defects: [],
      };
      bySegment.set(seg.id, cand);
    }
    cand.defects.push({
      id: d.id,
      title: d.title,
      department: d.department,
      // Long-term maintenance tasks report their extended duration to the planner.
      durationMin: d.longTermMaintenance?.durationMin ?? d.durationMin,
      severity: d.severity,
      dueInDays: d.dueInDays,
      assetHealth: asset?.health ?? 70,
      isLongTerm: !!d.longTermMaintenance,
    });
  }
  return [...bySegment.values()].filter((c) => c.defects.length > 0);
}

export async function alternativeDefectInput(): Promise<AlternativeDefect[]> {
  await ensureSeeded();
  await ensureLifecycleReady();
  const [defectRows, assetRows, segRows, setRow] = await Promise.all([
    db.select().from(defects),
    db.select().from(assets),
    db.select().from(segments),
    getSettings(),
  ]);
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const segById = new Map(segRows.map((s) => [s.id, s]));
  const out: AlternativeDefect[] = [];
  for (const d of defectRows) {
    if (d.status === "closed" || d.lifecycleStatus === "CLOSED") continue;
    const asset = assetById.get(d.assetId);
    const seg = asset ? segById.get(asset.segmentId) : null;
    if (!asset || !seg) continue;
    const prob = riskFor(d, asset.health, seg, setRow.fogMode);
    out.push({
      id: d.id,
      title: d.title,
      department: d.department,
      severity: d.severity,
      durationMin: d.longTermMaintenance?.durationMin ?? d.durationMin,
      dueInDays: d.dueInDays,
      overdueDays: d.overdueDays,
      assetHealth: asset.health,
      aiScore: scoreDefect(d, seg, { fogMode: setRow.fogMode, assetHealth: asset.health }),
      mlRiskPct: Math.round(prob * 1000) / 10,
      recurrenceBand: d.recurrenceBand,
      segmentId: seg.id,
      segmentCode: seg.code,
      corridor: seg.corridor,
      dailyTrains: seg.dailyTrains,
      criticality: seg.criticality,
      isBridge: seg.isBridge,
      isLevelCrossing: seg.isLevelCrossing,
    });
  }
  return out;
}

export async function getDashboardState(): Promise<DashboardState> {
  await ensureSeeded();
  await ensureLifecycleReady();
  const [stationRows, segmentRows, settingsRow, defectDTOs, eventsList, latestPlan, allAssets, activeJobs, rollup, candidates, planRows] =
    await Promise.all([
      db.select().from(stations),
      db.select().from(segments),
      getSettings(),
      getDefectDTOs(),
      getEvents(),
      getLatestPlan(),
      db.select().from(assets),
      db.select().from(jobs).where(eq(jobs.status, "IN_PROGRESS")),
      lifecycleRollup(),
      superBlockCandidates(),
      db.select().from(plans).orderBy(desc(plans.id)).limit(12),
    ]);

  const stationsDto: StationDTO[] = stationRows.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    kind: s.kind,
    x: s.x,
    y: s.y,
    lat: s.lat,
    lng: s.lng,
    dailyTrains: s.dailyTrains,
    vipZone: s.vipZone,
  }));

  const segmentsDto: SegmentDTO[] = segmentRows.map((s) => ({
    id: s.id,
    code: s.code,
    fromCode: s.fromCode,
    toCode: s.toCode,
    corridor: s.corridor,
    lengthKm: s.lengthKm,
    isBridge: s.isBridge,
    isLevelCrossing: s.isLevelCrossing,
    dailyTrains: s.dailyTrains,
    criticality: s.criticality,
  }));

  const openDefects = defectDTOs.filter((d) => d.status === "OPEN" || d.status === "open");
  const criticalDefects = openDefects.filter((d) => d.severity >= 8.0);
  const assetsBelowHealth = allAssets.filter((a) => a.health < 50).length;
  const virtualInspections = defectDTOs.filter((d) => d.inspectionMode === "virtual").length;

  const depts: Department[] = ["ENG", "TRD", "SNT"];
  const deptLoad = depts.map((dept) => {
    const dList = openDefects.filter((d) => d.department === dept);
    const avgFail = dList.length ? dList.reduce((acc, d) => acc + d.failureProb72h, 0) / (dList.length * 100) : 0;
    return {
      dept,
      open: dList.length,
      critical: dList.filter((d) => d.severity >= 8.0).length,
      avgFailureProb: Math.round(avgFail * 100) / 100,
    };
  });

  const activeBlockSegments = Array.from(new Set(activeJobs.map((j) => j.segmentId)));
  const segById = new Map(segmentRows.map((s) => [s.id, s]));

  const overrunJob = activeJobs.find((j) => {
    const end = j.windowEnd;
    return end && end < 180;
  });

  const overrun: OverrunInfo | null = overrunJob
    ? {
        jobId: overrunJob.id,
        title: overrunJob.title,
        segCode: segById.get(overrunJob.segmentId)?.code ?? "?",
        segmentCode: undefined as never,
        remainingMin: 35,
        donePct: 60,
        probability: 0.78,
      } as OverrunInfo
    : null;

  const liveTrains = getLiveTrains();
  const weather = currentWeather(settingsRow.fogMode);
  const modelCard = getModelCard();

  const kpis = latestPlan?.kpis ?? {
    downtimeBaselineH: 91.9,
    downtimeOptimizedH: 51.1,
    bundlingPct: 56,
    avgDelayMin: 7.0,
    resilienceScore: 77.8,
    conflictsAvoided: 15,
  };

  /* ---- Urgency queue: summary + the ordered queue itself ---- */
  const urgencyItems = defectDTOs.filter((d) => d.status !== "closed");
  const urgencyCounts = urgencyItems.reduce<Record<string, number>>((acc, d) => {
    acc[d.urgencyClass] = (acc[d.urgencyClass] ?? 0) + 1;
    return acc;
  }, {});
  const topUrgent = urgencyItems[0] ?? null;
  const queue = urgencyQueue(
    urgencyItems.map((d) =>
      scoreForQueue({
        id: d.id,
        defectCode: d.defectCode,
        title: d.title,
        segmentCode: d.segmentCode,
        department: d.department,
        severity: d.severity,
        dueInDays: d.dueInDays,
        overdueDays: d.overdueDays,
        aiScore: d.aiScore,
        recurrenceBand: d.recurrenceBand as RecurrenceLevel,
        priority: d.priority,
        lifecycleStatus: d.lifecycleStatus,
      })
    )
  );

  /* ---- Super-block intelligence ---- */
  const sb = superBlockKpis({ candidates, plannedBlocks: latestPlan?.blocks ?? [] });

  /* ---- Re-plan lineage ---- */
  const replanRows = planRows.filter((p) => p.supersedesId != null);
  const latestReplan = replanRows[0] ?? null;

  /* ---- Plan quality ---- */
  const quality = planQuality(latestPlan?.kpis, latestPlan?.blocks ?? []);

  /* ---- Asset availability ---- */
  const availability =
    latestPlan && latestPlan.kpis.assetAvailabilityPct != null
      ? {
          optimizedPct: latestPlan.kpis.assetAvailabilityPct,
          baselinePct: latestPlan.kpis.availabilityBaselinePct ?? 0,
          gainPts: latestPlan.kpis.availabilityGainPts ?? 0,
          monitoredAssets: latestPlan.kpis.monitoredAssets ?? allAssets.length,
          optimizedDowntimeH: latestPlan.kpis.availabilityDowntimeH ?? 0,
          baselineDowntimeH: latestPlan.kpis.availabilityBaselineH ?? 0,
          horizon: latestPlan.horizon,
        }
      : null;

  return {
    stations: stationsDto,
    segments: segmentsDto,
    settings: settingsRow,
    counts: {
      openDefects: openDefects.length,
      criticalDefects: criticalDefects.length,
      assetsBelowHealth,
      virtualInspections,
    },
    deptLoad,
    latestPlan,
    events: eventsList,
    liveTrains,
    activeBlockSegments,
    overrun,
    kpis: {
      downtimeBaselineH: kpis.downtimeBaselineH ?? 91.9,
      downtimeOptimizedH: kpis.downtimeOptimizedH ?? 51.1,
      bundlingPct: kpis.bundlingPct ?? 56,
      avgDelayMin: kpis.avgDelayMin ?? 7.0,
      resilienceScore: kpis.resilienceScore ?? 77.8,
      conflictsAvoided: kpis.conflictsAvoided ?? 15,
    },
    weather,
    lifecycle: {
      counts: rollup.counts,
      open: rollup.open,
      closed: rollup.closed,
      overdue: rollup.overdue,
      emergency: rollup.emergency,
      awaitingValidation: rollup.awaitingValidation,
      chronic: rollup.chronic,
      detailedInspections: rollup.detailedInspections,
      avgAgeDaysOpen: rollup.avgAgeDaysOpen,
    },
    urgencyQueue: queue.slice(0, 12),
    urgency: {
      total: urgencyItems.length,
      counts: urgencyCounts,
      emergency: urgencyCounts.EMERGENCY ?? 0,
      overdue: (urgencyCounts.OVERDUE ?? 0) + (urgencyCounts.CRITICALLY_OVERDUE ?? 0),
      emergencyCount: urgencyCounts.EMERGENCY ?? 0,
      overdueCount: (urgencyCounts.OVERDUE ?? 0) + (urgencyCounts.CRITICALLY_OVERDUE ?? 0),
      avgUrgency: urgencyItems.length
        ? Math.round((urgencyItems.reduce((s, d) => s + d.urgencyScore, 0) / urgencyItems.length) * 10) / 10
        : 0,
      top: queue[0] ?? (topUrgent ? null : null),
    },
    availability,
    superBlocks: {
      opportunities: sb.opportunities,
      recommended: sb.recommended,
      potentialSavingH: sb.potentialSavingH,
      plannedSuperBlocks: sb.plannedSuperBlocks,
      coordinationH: Math.round((sb.plannedCoordinationMin / 60) * 10) / 10,
      splitFindings: sb.splitFindings,
      topSegmentCode: sb.topOpportunity?.segmentCode ?? null,
      topSavingMin: sb.topOpportunity?.savingMin ?? 0,
      topDecision: sb.topOpportunity?.feasibility.decision ?? null,
    },
    replanning: {
      versions: planRows.length,
      replans: replanRows.length,
      latestTrigger: latestReplan?.triggerNote ?? null,
      latestDiff: latestReplan?.diff ?? null,
    },
    planQuality: quality ? { score: quality.score, items: quality.items, vsManual: quality.vsManual } : null,
    modelCard,
  };
}
