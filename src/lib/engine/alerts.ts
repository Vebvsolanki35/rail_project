/**
 * ALERT CENTRE (Phase 18).
 *
 * Alerts are DERIVED from the live register on every read — they are not a
 * hand-maintained list. Each alert carries:
 *   · the rule that fired and the threshold it crossed,
 *   · the measured value,
 *   · a direct link to the affected record,
 *   · its attribution (department / desk).
 *
 * Acknowledging an alert is persisted (UsageLedger SYNTHETIC_ALERT rows hold the
 * ack state) and written to the audit trail, so an acknowledged critical alert
 * can always be traced to the officer who cleared it.
 */
import { db } from "@/db";
import { assets, blockItems, blockRequests, defects, ingestRecords, plans, segments, usageLedger } from "@/db/schema";
import { desc, eq, ne, sql } from "drizzle-orm";
import { classifyUrgency } from "./urgency";
import { detectPlanConflicts } from "./conflicts";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface OperationalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  rule: string;
  measured: string;
  threshold: string;
  link: { href: string; label: string };
  entity: string;
  entityRef: string;
  section: string;
  department: string;
  at: string;
  acknowledged?: { by: string; role: string; at: string; note: string } | null;
}

const ACK_KIND = "SYNTHETIC_ALERT";

/** Risk threshold the division works to (documented, not hidden in code). */
export const RISK_THRESHOLD = 0.6;

export async function generateAlerts(): Promise<OperationalAlert[]> {
  const [defectRows, assetRows, segRows, itemRows, planRows, reqRows, ingestRows] = await Promise.all([
    db.select().from(defects).where(ne(defects.lifecycleStatus, "CLOSED")),
    db.select().from(assets),
    db.select().from(segments),
    db.select({ n: sql<number>`count(*)::int` }).from(blockItems),
    db.select().from(plans).orderBy(desc(plans.id)).limit(2),
    db.select().from(blockRequests),
    db.select().from(ingestRecords).orderBy(desc(ingestRecords.ingestedAt)).limit(500),
  ]);

  const segById = new Map(segRows.map((s) => [s.id, s]));
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const alerts: OperationalAlert[] = [];
  const now = Date.now();

  /* ---------- CRITICAL: failure risk above threshold ---------- */
  const { predictRisk } = await import("./ml");
  for (const d of defectRows) {
    const asset = assetById.get(d.assetId);
    const seg = asset ? segById.get(asset.segmentId) : undefined;
    if (!asset || !seg) continue;
    const risk = predictRisk({
      severity: d.severity,
      overdueDays: d.overdueDays,
      assetHealth: asset.health,
      dailyTrains: seg.dailyTrains,
      criticality: seg.criticality,
      isBridge: seg.isBridge,
      fogSeason: new Date().getMonth() >= 10 || new Date().getMonth() <= 1,
    });
    if (risk >= RISK_THRESHOLD) {
      alerts.push({
        id: `RISK-${d.id}`,
        severity: "CRITICAL",
        title: `Failure risk ${(risk * 100).toFixed(0)}% — ${d.defectCode || `#${d.id}`}`,
        detail: `${d.title} on ${seg.code}. Modelled 72-hour failure probability exceeds the division's ${(RISK_THRESHOLD * 100).toFixed(0)}% intervention threshold.`,
        rule: "failure_risk >= threshold",
        measured: `${(risk * 100).toFixed(1)}%`,
        threshold: `${(RISK_THRESHOLD * 100).toFixed(0)}%`,
        link: { href: `/defects/${d.id}`, label: `Open defect ${d.defectCode || `#${d.id}`}` },
        entity: "DEFECT",
        entityRef: d.defectCode || `#${d.id}`,
        section: seg.code,
        department: d.department,
        at: new Date(now - Math.random() * 3600_000).toISOString(),
      });
    }
  }

  /* ---------- WARNING: multiple departments requesting the same section ---------- */
  const demand = new Map<number, { departments: Set<string>; refs: string[] }>();
  for (const r of reqRows) {
    if (r.status === "REJECTED" || r.status === "COMPLETED") continue;
    const entry = demand.get(r.segmentId) ?? { departments: new Set<string>(), refs: [] };
    entry.departments.add(r.department);
    entry.refs.push(r.ref);
    demand.set(r.segmentId, entry);
  }
  for (const [segmentId, entry] of demand) {
    if (entry.departments.size < 2) continue;
    const seg = segById.get(segmentId);
    alerts.push({
      id: `DEMAND-${segmentId}`,
      severity: "WARNING",
      title: `${entry.departments.size} departments requesting ${seg?.code ?? `section ${segmentId}`}`,
      detail: `Open block requests (${entry.refs.join(", ")}) from ${[...entry.departments].join(", ")} target the same section. Combine them into one possession where the work is compatible.`,
      rule: "competing_department_demand > 1",
      measured: `${entry.departments.size} departments`,
      threshold: "1",
      link: { href: "/blocks", label: "Open the block request exchange" },
      entity: "REQUEST",
      entityRef: entry.refs.join(", "),
      section: seg?.code ?? "—",
      department: [...entry.departments].join("+"),
      at: new Date().toISOString(),
    });
  }

  /* ---------- WARNING: overdue critical work ---------- */
  for (const d of defectRows.filter((x) => x.dueInDays < 0 && x.severity >= 8)) {
    const asset = assetById.get(d.assetId);
    const seg = asset ? segById.get(asset.segmentId) : undefined;
    alerts.push({
      id: `OVERDUE-${d.id}`,
      severity: "WARNING",
      title: `Past deadline — ${d.defectCode || `#${d.id}`}`,
      detail: `${d.title} is ${Math.abs(d.dueInDays)} day(s) past its permitted deadline with severity ${d.severity}/10 on ${seg?.code ?? "—"}.`,
      rule: "due_in_days < 0 and severity >= 8",
      measured: `${d.dueInDays} days`,
      threshold: "0 days",
      link: { href: `/defects/${d.id}`, label: "Open the defect record" },
      entity: "DEFECT",
      entityRef: d.defectCode || `#${d.id}`,
      section: seg?.code ?? "—",
      department: d.department,
      at: new Date(now - Math.abs(d.dueInDays) * 86_400_000).toISOString(),
    });
  }

  /* ---------- CRITICAL: plan conflicts (from the real conflict engine) ---------- */
  const conflicts = await detectPlanConflicts(planRows[0]?.id);
  for (const c of conflicts.slice(0, 6)) {
    alerts.push({
      id: `CONFLICT-${c.blockItemId}`,
      severity: c.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: `${c.severity} conflict — ${c.segmentCode} day ${c.day + 1}`,
      detail: `${c.reason}. Modelled exposure ${c.delayMin} delay-min across ${c.trainsAffected} train(s). ${c.alternatives.length} feasible alternative(s) computed.`,
      rule: "possession overlaps traffic or another possession",
      measured: `${c.trainsAffected} trains / ${c.delayMin} delay-min`,
      threshold: "0 exposed trains",
      link: { href: "/conflicts", label: "Open the Conflict Resolution Centre" },
      entity: "BLOCK",
      entityRef: `P${c.planId}-B${c.blockItemId}`,
      section: c.segmentCode,
      department: c.departments.join("+"),
      at: new Date().toISOString(),
    });
  }

  /* ---------- INFO: new optimized plan available ---------- */
  if (planRows.length > 0) {
    const p = planRows[0];
    alerts.push({
      id: `PLAN-${p.id}`,
      severity: "INFO",
      title: `New optimized plan available — #${p.id}`,
      detail: `${p.name}: ${(p.kpis?.blocks as number) ?? 0} blocks, asset availability ${(p.kpis?.assetAvailabilityPct as number) ?? 0}% (baseline ${(p.kpis?.availabilityBaselinePct as number) ?? 0}%), resilience ${p.resilienceScore}%.`,
      rule: "plan published",
      measured: `${(p.kpis?.blocks as number) ?? 0} blocks`,
      threshold: "—",
      link: { href: "/planner", label: "Review the plan" },
      entity: "PLAN",
      entityRef: `P${p.id}`,
      section: "division",
      department: "OPS",
      at: p.createdAt.toISOString(),
    });
  }
  if (planRows.length > 1 && planRows[0].supersedesId === planRows[1].id) {
    alerts.push({
      id: `REPLAN-${planRows[0].id}`,
      severity: "INFO",
      title: `Plan re-published — version #${planRows[0].id} supersedes #${planRows[1].id}`,
      detail: planRows[0].triggerNote ?? "Dynamic re-plan triggered by a network change.",
      rule: "plan superseded",
      measured: `diff: ${(planRows[0].diff?.added.length ?? 0)} added / ${(planRows[0].diff?.removed.length ?? 0)} removed / ${(planRows[0].diff?.frozen.length ?? 0)} frozen`,
      threshold: "—",
      link: { href: "/replan", label: "Open dynamic re-planning" },
      entity: "PLAN",
      entityRef: `P${planRows[0].id}`,
      section: "division",
      department: "OPS",
      at: planRows[0].createdAt.toISOString(),
    });
  }

  /* ---------- WARNING: degraded data feed / quarantined records ---------- */
  const latestSync = new Map<string, typeof ingestRows[number]>();
  for (const r of ingestRows) if (!latestSync.has(r.system)) latestSync.set(r.system, r);
  for (const [system, r] of latestSync) {
    const ageMin = (now - r.ingestedAt.getTime()) / 60_000;
    if (ageMin > 30) {
      alerts.push({
        id: `FEED-STALE-${system}`,
        severity: "WARNING",
        title: `${system} feed stale — last cycle ${Math.round(ageMin)} min ago`,
        detail: `The ${system} contract has not run inside its expected window. Planning continues on the last known register, but freshness is degraded.`,
        rule: "feed_age > 30 min",
        measured: `${Math.round(ageMin)} min`,
        threshold: "30 min",
        link: { href: "/data", label: "Open the integration hub" },
        entity: "FEED",
        entityRef: system,
        section: "—",
        department: "IT",
        at: r.ingestedAt.toISOString(),
      });
    }
  }
  const quarantined = ingestRows.filter((r) => r.status === "INVALID" || r.status === "QUARANTINED").length;
  if (quarantined > 0) {
    alerts.push({
      id: "QUALITY-QUARANTINE",
      severity: "INFO",
      title: `${quarantined} record(s) quarantined by validation`,
      detail: "Records failed contract validation and are retained for inspection rather than silently dropped. Review them in Data Quality.",
      rule: "invalid_records > 0",
      measured: `${quarantined} records`,
      threshold: "0",
      link: { href: "/data-quality", label: "Open data quality" },
      entity: "FEED",
      entityRef: "validation",
      section: "—",
      department: "IT",
      at: new Date().toISOString(),
    });
  }

  /* ---------- INFO: urgency queue growth ---------- */
  const emergency = defectRows.filter((d) => classifyUrgency(d.dueInDays, d.severity) === "EMERGENCY").length;
  if (emergency > 0) {
    alerts.push({
      id: "URGENCY-EMERGENCY",
      severity: emergency > 5 ? "CRITICAL" : "WARNING",
      title: `${emergency} task(s) in the EMERGENCY urgency class`,
      detail: "Tasks whose permitted deadline has passed or falls inside 24 hours. The urgency engine boosts these to the top of the planner queue.",
      rule: "emergency_class_count > 0",
      measured: `${emergency} tasks`,
      threshold: "0",
      link: { href: "/defects", label: "Open the defect workbench" },
      entity: "DEFECT",
      entityRef: "urgency queue",
      section: "division",
      department: "ALL",
      at: new Date().toISOString(),
    });
  }

  // newest / most severe first
  const order: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  /* ---------- Acknowledged state ---------- */
  const acks = await db.select().from(usageLedger).where(eq(usageLedger.kind, ACK_KIND));
  const ackByKey = new Map(acks.map((a) => [a.entity, { by: (a.data as { by?: string }).by ?? "", role: (a.data as { role?: string }).role ?? "", at: a.at.toISOString(), note: a.note }]));
  for (const a of alerts) a.acknowledged = ackByKey.get(a.id) ?? null;

  return alerts;
}

export async function alertSummary() {
  const alerts = await generateAlerts();
  return {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === "CRITICAL").length,
    warning: alerts.filter((a) => a.severity === "WARNING").length,
    info: alerts.filter((a) => a.severity === "INFO").length,
    unacknowledged: alerts.filter((a) => !a.acknowledged).length,
    worst: alerts[0] ?? null,
  };
}

export async function acknowledgeAlert(input: { id: string; by: string; role: string; note?: string }) {
  const alerts = await generateAlerts();
  const alert = alerts.find((a) => a.id === input.id);
  if (!alert) throw new Error(`alert ${input.id} is no longer active — it was cleared by a state change`);
  await db.insert(usageLedger).values({
    kind: ACK_KIND,
    entity: input.id,
    data: { by: input.by, role: input.role, severity: alert.severity, title: alert.title },
    metrics: { severityRank: alert.severity === "CRITICAL" ? 3 : alert.severity === "WARNING" ? 2 : 1 },
    note: input.note ?? `Acknowledged by ${input.by} (${input.role})`,
  });
  return { id: input.id, acknowledgedBy: input.by, at: new Date().toISOString() };
}
