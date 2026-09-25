/**
 * SMART DEFECT LIFECYCLE — stage configuration & transition rules (PS #26027).
 *
 * Pure data module (no DB imports) so both server engine code and client
 * components share ONE source of truth for:
 *   - the 11 lifecycle stages
 *   - "What's Happening Now" / "What's Next" / "Responsible" per stage
 *   - the strict transition graph (no unrealistic jumps)
 *   - which role may trigger the next action
 *
 * Nothing here is hardcoded per-page: every consumer renders from this config.
 */

export const LIFECYCLE_STAGES = [
  "REPORTED",
  "UNDER_REVIEW",
  "VERIFIED",
  "AI_PRIORITIZED",
  "MAINTENANCE_REQUIRED",
  "PLANNING",
  "BLOCK_PLANNED",
  "WORK_ASSIGNED",
  "WORK_IN_PROGRESS",
  "AWAITING_VALIDATION",
  "CLOSED",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export type PriorityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RecurrenceLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

/** Who may trigger the action that leaves this stage. */
export type ActionActor = "INSPECTOR" | "INSPECTOR_CONTROL" | "PLANNING_ROLES" | "SYSTEM";

export interface StageConfig {
  label: string; // display label — status text is ALWAYS visible in the UI
  short: string; // compact label for chips / timeline
  happening: string; // "What's Happening Now"
  next: string; // "What's Next"
  responsible: string; // current responsible role / system
  action?: { label: string; actor: ActionActor; kind: "transition" | "optimize" };
  correction?: { label: string }; // clearly-labelled administrative correction
}

export const STAGE_CONFIG: Record<LifecycleStage, StageConfig> = {
  REPORTED: {
    label: "REPORTED",
    short: "Reported",
    happening: "The defect has been recorded and awaits review.",
    next: "Review and verify the defect.",
    responsible: "Section Inspector",
    action: { label: "Start Review", actor: "INSPECTOR", kind: "transition" },
  },
  UNDER_REVIEW: {
    label: "UNDER REVIEW",
    short: "Under Review",
    happening: "Defect information is being examined.",
    next: "Verify severity and infrastructure impact.",
    responsible: "Section Inspector",
    action: { label: "Verify Defect", actor: "INSPECTOR", kind: "transition" },
  },
  VERIFIED: {
    label: "VERIFIED",
    short: "Verified",
    happening: "The defect has been confirmed by inspection.",
    next: "AI prioritization will evaluate maintenance urgency.",
    responsible: "Section Inspector",
    action: { label: "Run AI Prioritization", actor: "INSPECTOR", kind: "transition" },
  },
  AI_PRIORITIZED: {
    label: "AI PRIORITIZED",
    short: "AI Prioritized",
    happening: "AI priority has been calculated by the Rail Rakshak scoring engine.",
    next: "Create the maintenance requirement (duration, departments).",
    responsible: "Rail Rakshak AI Planning Engine",
    action: { label: "Create Maintenance Requirement", actor: "INSPECTOR_CONTROL", kind: "transition" },
  },
  MAINTENANCE_REQUIRED: {
    label: "MAINTENANCE REQUIRED",
    short: "Maintenance Required",
    happening: "Maintenance work requirements have been identified.",
    next: "The requirement will be evaluated against available maintenance windows.",
    responsible: "Section Inspector",
    action: { label: "Send to Block Planner", actor: "PLANNING_ROLES", kind: "transition" },
  },
  PLANNING: {
    label: "PLANNING",
    short: "Planning",
    happening: "AI is evaluating suitable maintenance windows.",
    next: "Generate an optimized block recommendation.",
    responsible: "Rail Rakshak Block Planning Engine",
    action: { label: "Run Block Planner", actor: "PLANNING_ROLES", kind: "optimize" },
  },
  BLOCK_PLANNED: {
    label: "BLOCK PLANNED",
    short: "Block Planned",
    happening: "An optimized maintenance window has been identified for this defect.",
    next: "Operational review followed by maintenance assignment.",
    responsible: "Control Office / Block Planning Workflow",
    action: { label: "Assign Work Order", actor: "INSPECTOR", kind: "transition" },
  },
  WORK_ASSIGNED: {
    label: "WORK ASSIGNED",
    short: "Work Assigned",
    happening: "Maintenance work has been assigned for execution.",
    next: "Maintenance work begins (crew starts from the Job Portal).",
    responsible: "Karmi Crew (via Job Portal)",
  },
  WORK_IN_PROGRESS: {
    label: "WORK IN PROGRESS",
    short: "Work In Progress",
    happening: "Maintenance activity is underway.",
    next: "Complete the maintenance and submit it for validation.",
    responsible: "Karmi Crew",
  },
  AWAITING_VALIDATION: {
    label: "AWAITING VALIDATION",
    short: "Awaiting Validation",
    happening: "Maintenance work has been completed.",
    next: "Section Inspector validation is required before closure.",
    responsible: "Section Inspector",
    action: { label: "Validate & Close", actor: "INSPECTOR", kind: "transition" },
    correction: { label: "Reopen for Rework" },
  },
  CLOSED: {
    label: "CLOSED",
    short: "Closed",
    happening: "Defect lifecycle completed. Asset maintenance status updated.",
    next: "Historical record retained for recurrence analysis.",
    responsible: "—",
  },
};

/**
 * Strict transition graph — adjacent steps only. The single deliberate
 * exception is the clearly-labelled administrative correction
 * AWAITING_VALIDATION → WORK_ASSIGNED (rework), mirroring the existing job
 * review "reject" path. REPORTED can never jump to CLOSED.
 */
export const TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  REPORTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["VERIFIED"],
  VERIFIED: ["AI_PRIORITIZED"],
  AI_PRIORITIZED: ["MAINTENANCE_REQUIRED"],
  MAINTENANCE_REQUIRED: ["PLANNING"],
  PLANNING: ["BLOCK_PLANNED"],
  BLOCK_PLANNED: ["WORK_ASSIGNED"],
  WORK_ASSIGNED: ["WORK_IN_PROGRESS"],
  WORK_IN_PROGRESS: ["AWAITING_VALIDATION"],
  AWAITING_VALIDATION: ["CLOSED", "WORK_ASSIGNED"],
  CLOSED: [],
};

export function stageIndex(stage: string): number {
  const i = LIFECYCLE_STAGES.indexOf(stage as LifecycleStage);
  return i < 0 ? 0 : i;
}

/** Strict adjacency check used by the transition API (server-enforced). */
export function canTransition(from: string, to: string): boolean {
  if (!(from in TRANSITIONS)) return false;
  return (TRANSITIONS[from as LifecycleStage] as string[]).includes(to);
}

/** Timeline partition: completed / current / future for the visual timeline. */
export function timelinePartition(current: string): { stage: LifecycleStage; state: "done" | "current" | "future" }[] {
  const cur = stageIndex(current);
  return LIFECYCLE_STAGES.map((stage, i) => ({
    stage,
    state: i < cur ? "done" : i === cur ? "current" : "future",
  }));
}

/** Priority banding of the shared AI score (see scoring.ts — trained model). */
export function priorityBand(score: number, severity: number, prob72h: number): PriorityLevel {
  if (score >= 82 || severity >= 9 || prob72h >= 0.75) return "CRITICAL";
  if (score >= 62 || severity >= 7 || prob72h >= 0.5) return "HIGH";
  if (score >= 42 || severity >= 4) return "MEDIUM";
  return "LOW";
}

export const PRIORITY_ORDER: Record<PriorityLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Recurrence window for the rule-based detector (days). */
export const RECURRENCE_WINDOW_DAYS = 180;

/**
 * Deterministic, rule-based recurrence detection (NOT machine learning).
 *   ≥ 4 similar defects on the same asset inside the window → HIGH
 *   = 3 → MEDIUM, = 2 → LOW, otherwise NONE
 */
export function recurrenceBand(occurrences: number): RecurrenceLevel {
  if (occurrences >= 4) return "HIGH";
  if (occurrences === 3) return "MEDIUM";
  if (occurrences === 2) return "LOW";
  return "NONE";
}
