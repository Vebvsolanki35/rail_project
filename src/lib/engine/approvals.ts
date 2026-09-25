/**
 * APPROVAL WORKFLOW (Phase 13) — AI GENERATED → TECHNICAL REVIEW →
 * SECTION CONTROLLER → DRM → PUBLISHED.
 *
 * Every stage action is a PERSISTED row in `approvals` plus an entry in the
 * append-only `audit_trail`, so the chain can be replayed exactly as it
 * happened. Actions: Approve · Modify · Reject · Request Replan · Emergency
 * Override.
 *
 * Authority rules are enforced here, not in the UI:
 *   · TECHNICAL_REVIEW  — CONTROL or INSPECTOR
 *   · SECTION_CONTROLLER — CONTROL
 *   · DRM                — DRM only
 *   · EMERGENCY_OVERRIDE — DRM only, requires a reason, and is flagged in the
 *     authorization document as an emergency sanction.
 */
import { db } from "@/db";
import { approvals, blockItems, plans, settings } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { recordAudit, type AuditSeverity } from "./audittrail";
import { setSetting } from "./state";

export const APPROVAL_STAGES = ["AI_GENERATED", "TECHNICAL_REVIEW", "SECTION_CONTROLLER", "DRM", "PUBLISHED"] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

export const STAGE_META: Record<ApprovalStage, { label: string; actor: string; roles: string[]; command: string }> = {
  AI_GENERATED: { label: "AI Generated", actor: "Planner engine", roles: [], command: "—" },
  TECHNICAL_REVIEW: { label: "Technical Review", actor: "Technical review desk", roles: ["CONTROL", "INSPECTOR"], command: "SSE/Coordination" },
  SECTION_CONTROLLER: { label: "Section Controller", actor: "Section Controller (COA)", roles: ["CONTROL"], command: "Section Controller" },
  DRM: { label: "DRM Approval", actor: "Divisional Railway Manager", roles: ["DRM"], command: "DRM (Divisional Railway Manager)" },
  PUBLISHED: { label: "Published", actor: "Control Office", roles: ["CONTROL", "DRM"], command: "Control Office" },
};

export const APPROVAL_ACTIONS = ["APPROVED", "MODIFIED", "REJECTED", "REPLAN_REQUESTED", "EMERGENCY_OVERRIDE"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export interface ApprovalStageState {
  stage: ApprovalStage;
  label: string;
  actor: string;
  roles: string[];
  state: "DONE" | "ACTIVE" | "PENDING" | "BLOCKED" | "REJECTED";
  action: string | null;
  actorName: string;
  actorRole: string;
  reason: string;
  at: string | null;
}

export interface ApprovalBoard {
  planId: number | null;
  planName: string;
  planStatus: string;
  stages: ApprovalStageState[];
  currentStage: ApprovalStage;
  canApprove: string[];
  history: {
    id: number;
    stage: ApprovalStage;
    action: string;
    actorName: string;
    actorRole: string;
    reason: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    at: string;
  }[];
  emergency: boolean;
  modifiedBlocks: number;
}

/** Ensure the plan has its chain rows; idempotent. */
async function ensureChain(planId: number) {
  const rows = await db.select().from(approvals).where(eq(approvals.planId, planId));
  if (rows.some((r) => r.stage === "AI_GENERATED")) return rows;
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  await db.insert(approvals).values({
    planId,
    stage: "AI_GENERATED",
    seq: 0,
    action: "APPROVED",
    actorName: "Optimiser (constraint solver + risk model)",
    actorRole: "SYSTEM",
    reason: `Plan #${planId} generated: ${(plan?.kpis?.blocks ?? 0) as number} blocks, resilience ${plan?.resilienceScore ?? 0}%`,
  });
  return db.select().from(approvals).where(eq(approvals.planId, planId));
}

/**
 * A newly generated plan is NOT approved by definition.
 *
 * `settings.planStatus` is the division-wide decision state the command centre,
 * planner banner and audit desk read. Because it is a single row, a fresh plan
 * would otherwise inherit the previous plan's APPROVED/VETOED state and could be
 * presented as approved before any human had looked at it. Generating a plan
 * therefore resets the decision state to PROPOSED; the approval chain for THAT
 * plan is what moves it forward again (and `issueAuthorization` independently
 * refuses any block whose own plan has not cleared the DRM stage).
 */
export async function markPlanGenerated(planId: number, reason: string) {
  await setSetting("planStatus", "PROPOSED");
  await recordAudit({
    actorName: "Planner engine",
    actorRole: "SYSTEM",
    action: "PLAN_GENERATED",
    entity: "PLAN",
    entityRef: `P${planId}`,
    planId,
    planVersion: planId,
    oldValue: { planStatus: "previous plan decision state" },
    newValue: { planStatus: "PROPOSED", awaiting: "TECHNICAL_REVIEW" },
    reason,
    severity: "info",
  });
}

export interface ApprovalInput {
  planId?: number;
  action: ApprovalAction;
  actorName: string;
  actorRole: string;
  reason?: string;
  /** MODIFIED: new window for a block. */
  blockItemId?: number;
  newStartMin?: number;
  newEndMin?: number;
  newDay?: number;
}

export async function latestPlanRow() {
  const [p] = await db.select().from(plans).orderBy(desc(plans.id)).limit(1);
  return p ?? null;
}

export async function approvalBoard(planId?: number): Promise<ApprovalBoard> {
  const plan = planId ? (await db.select().from(plans).where(eq(plans.id, planId)))[0] : await latestPlanRow();
  if (!plan) {
    return {
      planId: null,
      planName: "—",
      planStatus: "NONE",
      stages: APPROVAL_STAGES.map((s) => ({ stage: s, label: STAGE_META[s].label, actor: STAGE_META[s].actor, roles: STAGE_META[s].roles, state: "PENDING" as const, action: null, actorName: "", actorRole: "", reason: "", at: null })),
      currentStage: "AI_GENERATED",
      canApprove: [],
      history: [],
      emergency: false,
      modifiedBlocks: 0,
    };
  }
  const rows = (await ensureChain(plan.id)).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.id - b.id);
  const settingRows = await db.select().from(settings);
  const planStatus = settingRows.find((s) => s.key === "planStatus")?.value ?? "PROPOSED";
  const emergency = rows.some((r) => r.action === "EMERGENCY_OVERRIDE");

  /* Stage state: a stage is REJECTED if rejected, BLOCKED if an earlier stage
     rejected, DONE if it has a recorded action, ACTIVE if it is the next one. */
  const acted = new Map<ApprovalStage, typeof rows[number]>();
  for (const r of rows) {
    const prev = acted.get(r.stage as ApprovalStage);
    if (!prev || prev.id < r.id) acted.set(r.stage as ApprovalStage, r);
  }
  const rejectedAt = APPROVAL_STAGES.findIndex((s) => acted.get(s)?.action === "REJECTED");
  const doneUpTo = APPROVAL_STAGES.reduce((acc, s, i) => (acted.get(s) && acted.get(s)!.action !== "REJECTED" ? i : acc), -1);
  const currentIdx = rejectedAt >= 0 ? rejectedAt : Math.min(doneUpTo + 1, APPROVAL_STAGES.length - 1);

  const stages: ApprovalStageState[] = APPROVAL_STAGES.map((s, i) => {
    const rec = acted.get(s);
    let state: ApprovalStageState["state"];
    if (rec?.action === "REJECTED") state = "REJECTED";
    else if (rejectedAt >= 0 && i > rejectedAt) state = "BLOCKED";
    else if (rec) state = "DONE";
    else if (i === currentIdx) state = "ACTIVE";
    else state = "PENDING";
    return {
      stage: s,
      label: STAGE_META[s].label,
      actor: STAGE_META[s].actor,
      roles: STAGE_META[s].roles,
      state,
      action: rec?.action ?? null,
      actorName: rec?.actorName ?? "",
      actorRole: rec?.actorRole ?? "",
      reason: rec?.reason ?? "",
      at: rec?.at.toISOString() ?? null,
    };
  });

  const currentStage = APPROVAL_STAGES[currentIdx];
  const modifiedBlocks = rows.filter((r) => r.action === "MODIFIED").length;

  return {
    planId: plan.id,
    planName: plan.name,
    planStatus,
    stages,
    currentStage,
    canApprove: STAGE_META[currentStage].roles,
    history: rows
      .slice()
      .reverse()
      .map((r) => ({
        id: r.id,
        stage: r.stage as ApprovalStage,
        action: r.action,
        actorName: r.actorName,
        actorRole: r.actorRole,
        reason: r.reason,
        oldValue: r.oldValue ?? null,
        newValue: r.newValue ?? null,
        at: r.at.toISOString(),
      })),
    emergency,
    modifiedBlocks,
  };
}

const SEVERITY: Record<ApprovalAction, AuditSeverity> = {
  APPROVED: "info",
  MODIFIED: "warn",
  REJECTED: "critical",
  REPLAN_REQUESTED: "warn",
  EMERGENCY_OVERRIDE: "critical",
};

/**
 * Record one approval action. Authority is checked against the stage; the plan's
 * global status (`settings.planStatus`) only moves to APPROVED once the DRM
 * stage has actually approved, so a technical review can never publish a plan.
 */
export async function recordApproval(input: ApprovalInput) {
  const plan = input.planId ? (await db.select().from(plans).where(eq(plans.id, input.planId)))[0] : await latestPlanRow();
  if (!plan) throw new Error("no plan to act on — generate a plan first");
  await ensureChain(plan.id);
  const board = await approvalBoard(plan.id);

  if (input.action !== "REPLAN_REQUESTED" && input.action !== "REJECTED") {
    const allowed = STAGE_META[board.currentStage].roles;
    if (allowed.length > 0 && !allowed.includes(input.actorRole)) {
      throw new Error(`${STAGE_META[board.currentStage].label} must be actioned by ${STAGE_META[board.currentStage].command} — role ${input.actorRole} is not authorised (current plan status ${board.planStatus})`);
    }
  }
  if (board.stages.find((s) => s.stage === board.currentStage)?.state === "REJECTED") {
    throw new Error("this plan was rejected — request a re-plan or generate a new plan before continuing");
  }
  if (input.action === "EMERGENCY_OVERRIDE" && input.actorRole !== "DRM") {
    throw new Error("emergency override is a DRM authority — record the reason and re-submit as DRM");
  }
  if ((input.action === "REJECTED" || input.action === "EMERGENCY_OVERRIDE" || input.action === "REPLAN_REQUESTED") && !input.reason?.trim()) {
    throw new Error(`${input.action.replace(/_/g, " ")} requires a recorded reason`);
  }

  let oldValue: Record<string, unknown> | null = null;
  let newValue: Record<string, unknown> | null = null;

  if (input.action === "MODIFIED") {
    if (!input.blockItemId) throw new Error("MODIFIED requires blockItemId");
    const [item] = await db.select().from(blockItems).where(eq(blockItems.id, input.blockItemId));
    if (!item) throw new Error(`block item ${input.blockItemId} not found`);
    const newStart = input.newStartMin ?? item.startMin;
    const newEnd = input.newEndMin ?? item.endMin;
    if (newEnd <= newStart) throw new Error("modified window end must be after its start");
    oldValue = { startMin: item.startMin, endMin: item.endMin, day: item.day };
    newValue = { startMin: newStart, endMin: newEnd, day: input.newDay ?? item.day };
    await db.update(blockItems).set({ startMin: newStart, endMin: newEnd, day: input.newDay ?? item.day }).where(eq(blockItems.id, input.blockItemId));
  }

  const [row] = await db
    .insert(approvals)
    .values({
      planId: plan.id,
      stage: board.currentStage,
      seq: APPROVAL_STAGES.indexOf(board.currentStage),
      action: input.action,
      actorName: input.actorName,
      actorRole: input.actorRole,
      reason: input.reason ?? `${input.action} at ${STAGE_META[board.currentStage].label}`,
      oldValue,
      newValue,
    })
    .returning();

  /* Plan-level status is only moved by the DRM stage (or an emergency override
     by the DRM). This is the authority contract expressed in code. */
  if (input.action === "APPROVED" && board.currentStage === "DRM") await setSetting("planStatus", "APPROVED");
  if (input.action === "EMERGENCY_OVERRIDE") await setSetting("planStatus", "APPROVED");
  if (input.action === "REJECTED" && board.currentStage === "DRM") await setSetting("planStatus", "VETOED");
  if (input.action === "REPLAN_REQUESTED") await setSetting("planStatus", "PROPOSED");
  if (input.action === "APPROVED" && board.currentStage === "SECTION_CONTROLLER") await setSetting("planStatus", "PROPOSED");

  await recordAudit({
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: input.action === "EMERGENCY_OVERRIDE" ? "EMERGENCY_OVERRIDE" : input.action === "REPLAN_REQUESTED" ? "REPLAN_REQUESTED" : input.action === "MODIFIED" ? "MODIFIED" : input.action === "REJECTED" ? "REJECTED" : "APPROVED",
    entity: "PLAN",
    entityRef: `P${plan.id}`,
    planId: plan.id,
    planVersion: plan.id,
    oldValue,
    newValue,
    reason: row.reason,
    severity: SEVERITY[input.action],
  });

  return { approval: { id: row.id, stage: row.stage as ApprovalStage, action: row.action, at: row.at.toISOString() }, board: await approvalBoard(plan.id) };
}

/** Convenience for tests/UI: can a given role act right now? */
export function canAct(board: ApprovalBoard, role: string): boolean {
  if (board.currentStage === "PUBLISHED") return false;
  const allowed = STAGE_META[board.currentStage].roles;
  return allowed.length === 0 || allowed.includes(role);
}
