/**
 * AUDIT TRAIL (Phase 15) — the append-only action ledger.
 *
 * Every consequential action in the platform writes one row here: actor, role,
 * action, entity, plan version, old value, new value and the reason supplied.
 * The Optimizer, the approval workflow, re-planning, the conflict desk and the
 * integration hub all call `recordAudit` — so the timeline is a by-product of
 * doing the work, never a separately-maintained log that can drift.
 */
import { db } from "@/db";
import { auditTrail } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export type AuditSeverity = "info" | "warn" | "critical" | "ai";

/** Canonical action names — keeps the timeline filterable. */
export const AUDIT_ACTIONS = [
  "PLAN_GENERATED",
  "CONFLICT_DETECTED",
  "AI_REPLANNED",
  "MODIFIED",
  "APPROVED",
  "REJECTED",
  "REPLAN_REQUESTED",
  "EMERGENCY_OVERRIDE",
  "PUBLISHED",
  "DEFECT_TRANSITION",
  "WORK_EXECUTED",
  "FEED_SYNC",
  "RESOURCE_REJECT",
  "BLOCK_REQUESTED",
  "REQUEST_STATUS",
  "SHADOW_ANALYSIS",
  "AUTH_ISSUED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditInput {
  actorName?: string;
  actorRole?: string;
  action: AuditAction | string;
  entity?: string;
  entityRef?: string;
  planId?: number | null;
  planVersion?: number | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string;
  severity?: AuditSeverity;
}

export async function recordAudit(input: AuditInput) {
  const [row] = await db
    .insert(auditTrail)
    .values({
      actorName: input.actorName || "system",
      actorRole: input.actorRole || "SYSTEM",
      action: input.action,
      entity: input.entity ?? "",
      entityRef: input.entityRef ?? "",
      planId: input.planId ?? null,
      planVersion: input.planVersion ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      reason: input.reason ?? "",
      severity: input.severity ?? "info",
    })
    .returning();
  return row;
}

export interface AuditRowDTO {
  id: number;
  at: string;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  entityRef: string;
  planId: number | null;
  planVersion: number | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string;
  severity: AuditSeverity;
}

function toDTO(r: typeof auditTrail.$inferSelect): AuditRowDTO {
  return {
    id: r.id,
    at: r.at.toISOString(),
    actorName: r.actorName,
    actorRole: r.actorRole,
    action: r.action,
    entity: r.entity,
    entityRef: r.entityRef,
    planId: r.planId,
    planVersion: r.planVersion,
    oldValue: r.oldValue ?? null,
    newValue: r.newValue ?? null,
    reason: r.reason,
    severity: r.severity as AuditSeverity,
  };
}

export async function queryAudit(opts: { limit?: number; action?: string; entity?: string; planId?: number; severity?: string; sinceMin?: number } = {}) {
  const conds = [];
  if (opts.action) conds.push(eq(auditTrail.action, opts.action));
  if (opts.entity) conds.push(eq(auditTrail.entity, opts.entity));
  if (opts.planId) conds.push(eq(auditTrail.planId, opts.planId));
  if (opts.severity) conds.push(eq(auditTrail.severity, opts.severity));
  if (opts.sinceMin) conds.push(gte(auditTrail.at, new Date(Date.now() - opts.sinceMin * 60_000)));
  const rows = await db
    .select()
    .from(auditTrail)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditTrail.at))
    .limit(Math.min(opts.limit ?? 100, 500));
  return rows.map(toDTO);
}

/** Distinct action names actually present, with counts — powers the filter bar. */
export async function auditFacets() {
  const rows = await db
    .select({ action: auditTrail.action, n: sql<number>`count(*)::int` })
    .from(auditTrail)
    .groupBy(auditTrail.action)
    .orderBy(desc(sql`count(*)`));
  return rows;
}
