"use client";

/**
 * Shared chips for the Smart Defect Lifecycle surfaces. Every badge prints the
 * STATUS TEXT (not just a colour) — colour is a redundant cue, never the only one.
 */
import type { PriorityLevel, RecurrenceLevel } from "@/lib/engine/lifecycleStages";

const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap";

export const STAGE_TONE: Record<string, string> = {
  REPORTED: "border-edge/40 bg-edge/10 text-ink",
  UNDER_REVIEW: "border-cyan/40 bg-cyan/10 text-cyan",
  VERIFIED: "border-cyan/40 bg-cyan/10 text-cyan",
  AI_PRIORITIZED: "border-violet/40 bg-violet/10 text-violet",
  MAINTENANCE_REQUIRED: "border-violet/40 bg-violet/10 text-violet",
  PLANNING: "border-cyan/40 bg-cyan/10 text-cyan",
  BLOCK_PLANNED: "border-saffron/40 bg-saffron/10 text-saffron",
  WORK_ASSIGNED: "border-saffron/40 bg-saffron/10 text-saffron",
  WORK_IN_PROGRESS: "border-signal/50 bg-signal/15 text-signal",
  AWAITING_VALIDATION: "border-mint/40 bg-mint/10 text-mint",
  CLOSED: "border-mint/40 bg-mint/10 text-mint",
};

export const URGENCY_TONE: Record<string, string> = {
  EMERGENCY: "border-signal/50 bg-signal/15 text-signal",
  CRITICALLY_OVERDUE: "border-saffron/50 bg-saffron/15 text-saffron",
  OVERDUE: "border-saffron/50 bg-saffron/15 text-saffron",
  DUE_SOON: "border-cyan/40 bg-cyan/10 text-cyan",
  UPCOMING: "border-edge/40 bg-edge/10 text-ink",
  NORMAL: "border-edge bg-panel text-dim",
};

export const PRIORITY_TONE: Record<PriorityLevel, string> = {
  CRITICAL: "border-signal/50 bg-signal/15 text-signal",
  HIGH: "border-saffron/50 bg-saffron/15 text-saffron",
  MEDIUM: "border-saffron/40 bg-saffron/10 text-saffron",
  LOW: "border-edge/40 bg-edge/10 text-ink",
};

export const RECURRENCE_TONE: Record<RecurrenceLevel, string> = {
  HIGH: "border-signal/50 bg-signal/15 text-signal",
  MEDIUM: "border-saffron/40 bg-saffron/10 text-saffron",
  LOW: "border-cyan/40 bg-cyan/10 text-cyan",
  NONE: "border-edge bg-panel text-faint",
};

export function StageChip({ stage, label }: { stage: string; label?: string }) {
  return <span className={`${base} ${STAGE_TONE[stage] ?? "border-edge bg-panel text-dim"}`}>{label ?? stage.replace(/_/g, " ")}</span>;
}

export function UrgencyChip({ cls, score }: { cls: string; score?: number }) {
  return (
    <span className={`${base} ${URGENCY_TONE[cls] ?? "border-edge bg-panel text-dim"}`}>
      {cls.replace(/_/g, " ")}
      {score != null && <span className="opacity-70">· {Math.round(score)}</span>}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: PriorityLevel }) {
  return <span className={`${base} ${PRIORITY_TONE[priority]}`}>{priority}</span>;
}

export function RecurrenceChip({ band, occurrences }: { band: RecurrenceLevel; occurrences: number }) {
  if (band === "NONE") return null;
  return (
    <span className={`${base} ${RECURRENCE_TONE[band]}`} title="Rule-based recurrence detection (not machine learning)">
      RECURRENCE {band} · {occurrences}×
    </span>
  );
}

export function DepartmentChip({ dept }: { dept: string }) {
  const tone =
    dept === "ENG" ? "border-mint/40 bg-mint/10 text-mint" : dept === "TRD" ? "border-saffron/40 bg-saffron/10 text-saffron" : "border-violet/40 bg-violet/10 text-violet";
  return <span className={`${base} ${tone}`}>{dept}</span>;
}

export function DueChip({ dueInDays }: { dueInDays: number }) {
  const text = dueInDays < 0 ? `${Math.abs(dueInDays)} d overdue` : dueInDays === 0 ? "due today" : `due in ${dueInDays} d`;
  const tone = dueInDays < 0 ? "border-signal/40 bg-signal/10 text-signal" : dueInDays <= 3 ? "border-saffron/40 bg-saffron/10 text-saffron" : "border-edge bg-panel text-dim";
  return <span className={`${base} ${tone}`}>{text}</span>;
}
