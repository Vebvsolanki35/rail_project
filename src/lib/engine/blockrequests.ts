/**
 * BLOCK REQUEST EXCHANGE (Phase 3).
 *
 * A departmental maintenance block request is a first-class record: ENG, TRD and
 * S&T all raise requests through the same object, from a defect or standalone.
 * The status machine is enforced server-side, and the transition to CONFLICT or
 * PROPOSED is driven by the REAL conflict check and the REAL optimizer — a
 * request cannot be marked "optimizing" as decoration.
 */
import { db } from "@/db";
import { assets, blockItems, blockRequests, defects, plans, segments } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { recordAudit } from "./audittrail";
import { checkPlacement, ensureResources, listResources } from "./resources";

export const REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "CONFLICT",
  "OPTIMIZING",
  "PROPOSED",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "COMPLETED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_META: Record<RequestStatus, { label: string; tone: "neutral" | "info" | "warning" | "critical" | "success" | "ai"; next: RequestStatus[]; actor: string }> = {
  DRAFT: { label: "Draft", tone: "neutral", next: ["SUBMITTED"], actor: "Requesting department" },
  SUBMITTED: { label: "Submitted", tone: "info", next: ["CONFLICT", "OPTIMIZING", "REJECTED"], actor: "Control Office" },
  CONFLICT: { label: "Conflict", tone: "critical", next: ["OPTIMIZING", "REJECTED"], actor: "Section Controller" },
  OPTIMIZING: { label: "Optimizing", tone: "ai", next: ["PROPOSED", "REJECTED"], actor: "Planner" },
  PROPOSED: { label: "Proposed", tone: "warning", next: ["APPROVED", "REJECTED", "OPTIMIZING"], actor: "Technical review" },
  APPROVED: { label: "Approved", tone: "success", next: ["PUBLISHED", "REJECTED"], actor: "DRM" },
  REJECTED: { label: "Rejected", tone: "critical", next: ["DRAFT"], actor: "Reviewing officer" },
  PUBLISHED: { label: "Published", tone: "success", next: ["COMPLETED"], actor: "Control Office" },
  COMPLETED: { label: "Completed", tone: "success", next: [], actor: "Field supervisor" },
};

/** Guarded transition — the caller must name a status the machine allows. */
export function canTransition(from: RequestStatus, to: RequestStatus): { ok: boolean; reason?: string } {
  if (from === to) return { ok: false, reason: `request is already ${STATUS_META[from].label.toUpperCase()}` };
  if (!STATUS_META[from].next.includes(to)) {
    return { ok: false, reason: `${STATUS_META[from].label} → ${STATUS_META[to].label} is not a permitted transition` };
  }
  return { ok: true };
}

/**
 * Continue the year's reference series — never count rows.
 *
 * A count-based number re-issues a reference that has already been printed if any
 * earlier row of that year is ever removed, and it restarts from 0001 in January
 * while old rows are still on file. The reference is the handle an officer quotes
 * on the phone, so it is derived from the highest reference already issued.
 */
export async function nextRef(): Promise<string> {
  const year = new Date().getFullYear();
  const [{ maxRef }] = await db
    .select({ maxRef: sql<string | null>`max(${blockRequests.ref})` })
    .from(blockRequests)
    .where(sql`${blockRequests.ref} like ${`RR-BRQ-${year}-%`}`);
  const n = maxRef ? Number(maxRef.slice(maxRef.lastIndexOf("-") + 1)) : 0;
  return `RR-BRQ-${year}-${String(n + 1).padStart(4, "0")}`;
}

export interface CreateRequestInput {
  department: string;
  segmentId: number;
  defectId?: number;
  assetId?: number;
  durationMin: number;
  priority?: string;
  resources?: string[];
  crewRequired?: number;
  machineRequired?: string;
  powerIsolation?: boolean;
  lineBlock?: boolean;
  requestedDay?: number;
  requestedStart?: number;
  requestedEnd?: number;
  note?: string;
  actorName?: string;
  actorRole?: string;
}

/**
 * Raise a request. Validation happens here: the section must exist, the window
 * must be coherent, and the resource establishment must be able to serve it —
 * a request that cannot physically be worked is refused at creation with the
 * reason, rather than sitting in a queue as a false promise.
 */
export async function createRequest(input: CreateRequestInput) {
  await ensureResources();
  const [seg] = await db.select().from(segments).where(eq(segments.id, input.segmentId));
  if (!seg) throw new Error(`section ${input.segmentId} not found`);
  if (input.durationMin < 15 || input.durationMin > 600) throw new Error("duration must be between 15 and 600 minutes");
  const start = input.requestedStart ?? 30;
  const end = input.requestedEnd ?? start + input.durationMin;
  if (end <= start) throw new Error("requested window end must be after its start");
  if (end - start < input.durationMin) throw new Error(`requested window (${end - start} min) is shorter than the work duration (${input.durationMin} min)`);

  const resources = await listResources();
  const verdict = checkPlacement(
    {
      segmentId: input.segmentId,
      segmentCode: seg.code,
      day: input.requestedDay ?? 0,
      startMin: start,
      endMin: end,
      department: input.department,
      crewRequired: input.crewRequired ?? 1,
      machineRequired: input.machineRequired,
      committed: new Map(),
    },
    resources
  );

  const ref = await nextRef();
  const [row] = await db
    .insert(blockRequests)
    .values({
      ref,
      department: input.department,
      segmentId: input.segmentId,
      assetId: input.assetId ?? null,
      defectId: input.defectId ?? null,
      durationMin: input.durationMin,
      priority: input.priority ?? "MEDIUM",
      resources: input.resources ?? [],
      crewRequired: input.crewRequired ?? 1,
      machineRequired: input.machineRequired ?? "",
      powerIsolation: input.powerIsolation ?? false,
      lineBlock: input.lineBlock ?? true,
      requestedDay: input.requestedDay ?? 0,
      requestedStart: start,
      requestedEnd: end,
      status: "DRAFT",
      requestedBy: input.actorName ?? "Desk Officer",
      requestedRole: input.actorRole ?? "CONTROL",
      note: input.note ?? "",
      conflictNote: verdict.feasible ? "" : verdict.rejections.join("; "),
    })
    .returning();

  await recordAudit({
    actorName: row.requestedBy,
    actorRole: row.requestedRole,
    action: "BLOCK_REQUESTED",
    entity: "REQUEST",
    entityRef: row.ref,
    newValue: { ref, department: row.department, section: seg.code, durationMin: row.durationMin, window: `${start}–${end}` },
    reason: `Block request raised for ${seg.code} (${input.department}, ${row.durationMin} min)${verdict.feasible ? "" : ` — resource constraint flagged: ${verdict.rejections.join("; ")}`}`,
    severity: verdict.feasible ? "info" : "warn",
  });

  return { request: toDTO(row, seg.code, seg.corridor), resourceVerdict: verdict };
}

function toDTO(r: typeof blockRequests.$inferSelect, segmentCode: string, corridor: string) {
  return {
    id: r.id,
    ref: r.ref,
    department: r.department,
    segmentId: r.segmentId,
    segmentCode,
    corridor,
    assetId: r.assetId,
    defectId: r.defectId,
    durationMin: r.durationMin,
    priority: r.priority,
    resources: r.resources,
    crewRequired: r.crewRequired,
    machineRequired: r.machineRequired,
    powerIsolation: r.powerIsolation,
    lineBlock: r.lineBlock,
    requestedDay: r.requestedDay,
    requestedStart: r.requestedStart,
    requestedEnd: r.requestedEnd,
    status: r.status as RequestStatus,
    statusLabel: STATUS_META[r.status as RequestStatus]?.label ?? r.status,
    next: STATUS_META[r.status as RequestStatus]?.next ?? [],
    requestedBy: r.requestedBy,
    requestedRole: r.requestedRole,
    note: r.note,
    conflictNote: r.conflictNote,
    planId: r.planId,
    blockItemId: r.blockItemId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type BlockRequestDTO = ReturnType<typeof toDTO>;

export async function listRequests(filter?: { status?: string; department?: string; segmentId?: number }) {
  const rows = await db
    .select({
      r: blockRequests,
      segmentCode: segments.code,
      corridor: segments.corridor,
    })
    .from(blockRequests)
    .leftJoin(segments, eq(blockRequests.segmentId, segments.id))
    .orderBy(desc(blockRequests.id))
    .limit(200);
  return rows
    .filter((x) => (!filter?.status || x.r.status === filter.status) && (!filter?.department || x.r.department === filter.department) && (!filter?.segmentId || x.r.segmentId === filter.segmentId))
    .map((x) => toDTO(x.r, x.segmentCode ?? "—", x.corridor ?? "—"));
}

export async function requestById(id: number) {
  const [row] = await db
    .select({ r: blockRequests, segmentCode: segments.code, corridor: segments.corridor })
    .from(blockRequests)
    .leftJoin(segments, eq(blockRequests.segmentId, segments.id))
    .where(eq(blockRequests.id, id));
  return row ? toDTO(row.r, row.segmentCode ?? "—", row.corridor ?? "—") : null;
}

/**
 * Advance a request through the exchange.
 *
 * CONFLICT is not a free label: moving to CONFLICT runs `detectOverlaps()` and
 * refuses if the section genuinely has no clash. PROPOSED links the request to a
 * real block in the published plan when one covers its section and window.
 */
export async function advanceRequest(input: { id: number; to: RequestStatus; actorName: string; actorRole: string; reason?: string }) {
  const existing = await requestById(input.id);
  if (!existing) throw new Error(`request ${input.id} not found`);
  const guard = canTransition(existing.status, input.to);
  if (!guard.ok) throw new Error(guard.reason);

  let conflictNote = existing.conflictNote;
  let planId = existing.planId;
  let blockItemId = existing.blockItemId;
  const extra: Record<string, unknown> = {};

  if (input.to === "CONFLICT") {
    const overlaps = await detectOverlaps(existing.segmentId, existing.requestedDay, existing.requestedStart, existing.requestedEnd);
    if (overlaps.length === 0) {
      throw new Error("no conflicting possession or train path found on this section for the requested window — the request cannot be marked CONFLICT");
    }
    conflictNote = overlaps.map((o) => o.detail).join("; ");
    extra.conflicts = overlaps;
  }

  if (input.to === "PROPOSED" || input.to === "PUBLISHED") {
    const planRow = await latestPlan();
    if (planRow) {
      const [item] = await db
        .select()
        .from(blockItems)
        .where(eq(blockItems.planId, planRow.id))
        .then((rows) => rows.filter((b) => b.segmentId === existing.segmentId));
      if (item) {
        planId = planRow.id;
        blockItemId = item.id;
        extra.planBlock = { id: item.id, day: item.day, startMin: item.startMin, endMin: item.endMin, window: item.window, departments: item.departments };
      }
    }
  }

  const [updated] = await db
    .update(blockRequests)
    .set({ status: input.to, conflictNote, planId, blockItemId, updatedAt: new Date() })
    .where(eq(blockRequests.id, input.id))
    .returning();

  await recordAudit({
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: "REQUEST_STATUS",
    entity: "REQUEST",
    entityRef: existing.ref,
    planId: planId ?? null,
    oldValue: { status: existing.status },
    newValue: { status: input.to, ...extra },
    reason: input.reason || `${existing.status} → ${input.to}`,
    severity: input.to === "CONFLICT" || input.to === "REJECTED" ? "warn" : input.to === "APPROVED" || input.to === "PUBLISHED" ? "info" : "info",
  });

  const [seg] = await db.select().from(segments).where(eq(segments.id, updated.segmentId));
  return { request: toDTO(updated, seg?.code ?? "—", seg?.corridor ?? "—"), ...extra };
}

async function latestPlan() {
  const rows = await db.select().from(plans).orderBy(desc(plans.id)).limit(1);
  return rows[0];
}

/** Real overlap detection: live plan possessions + working-timetable paths. */
export async function detectOverlaps(segmentId: number, day: number, startMin: number, endMin: number) {
  const planRow = await latestPlan();
  const out: { kind: string; detail: string; ref: string }[] = [];
  if (planRow) {
    const items = await db.select().from(blockItems).where(eq(blockItems.planId, planRow.id));
    for (const b of items) {
      if (b.segmentId !== segmentId) continue;
      if (b.day !== day) continue;
      if (b.startMin < endMin && startMin < b.endMin) {
        out.push({ kind: "possession", ref: `BLOCK-${b.id}`, detail: `overlaps plan #${planRow.id} block #${b.id} (${b.startMin}–${b.endMin} min, ${b.departments.join("+")})` });
      }
    }
  }
  const { trainsOnSection } = await import("./conflicts");
  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId));
  if (seg) {
    for (const t of trainsOnSection(seg.code, startMin, endMin)) {
      out.push({ kind: "train-path", ref: t.number, detail: `working-timetable path ${t.number} ${t.name} crosses at ${String(Math.floor(t.atMin / 60)).padStart(2, "0")}:${String(t.atMin % 60).padStart(2, "0")}` });
    }
  }
  return out;
}

/** Department demand on the same section — the "multiple departments" warning source. */
export async function competingDemand() {
  const rows = await db
    .select({ segmentId: blockRequests.segmentId, n: sql<number>`count(distinct department)::int`, departments: sql<string>`string_agg(distinct department, ',' order by department)` })
    .from(blockRequests)
    .where(sql`status not in ('REJECTED','COMPLETED')`)
    .groupBy(blockRequests.segmentId);
  return rows.filter((r) => r.n > 1);
}

export async function requestSummary() {
  const rows = await listRequests();
  const byStatus = REQUEST_STATUSES.map((s) => ({ status: s, label: STATUS_META[s].label, n: rows.filter((r) => r.status === s).length }));
  return {
    total: rows.length,
    byStatus,
    open: rows.filter((r) => r.status !== "COMPLETED" && r.status !== "REJECTED").length,
    conflicts: rows.filter((r) => r.status === "CONFLICT").length,
    awaitingApproval: rows.filter((r) => r.status === "PROPOSED").length,
    powerIsolation: rows.filter((r) => r.powerIsolation).length,
    departments: [...new Set(rows.map((r) => r.department))].sort(),
  };
}

/** Prefill a request straight from a defect (the desk's main entry point). */
export async function requestDraftFromDefect(defectId: number) {
  const [d] = await db.select().from(defects).where(eq(defects.id, defectId));
  if (!d) return null;
  const [asset] = await db.select().from(assets).where(eq(assets.id, d.assetId));
  const [seg] = asset ? await db.select().from(segments).where(eq(segments.id, asset.segmentId)) : [];
  if (!seg) return null;
  return {
    department: d.department,
    segmentId: seg.id,
    segmentCode: seg.code,
    corridor: seg.corridor,
    defectId: d.id,
    assetId: d.assetId,
    durationMin: d.durationMin,
    priority: d.priority,
    powerIsolation: d.needsPowerBlock,
    lineBlock: d.needsLineBlock,
    requestedDay: 0,
    requestedStart: d.severity >= 8 ? 30 : 660,
    requestedEnd: (d.severity >= 8 ? 30 : 660) + d.durationMin,
    resources: [d.needsPowerBlock ? "Power isolation + earthing" : "Line block protection", d.detailedInspection ? "Detailed inspection kit" : "Standard tooling"],
    note: `${d.defectCode || `#${d.id}`} — ${d.title}`,
  };
}
