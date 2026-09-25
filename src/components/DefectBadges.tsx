"use client";

/**
 * Shared chips for the Smart Defect Lifecycle surfaces. Every badge prints the
 * STATUS TEXT (not just a colour) — colour is a redundant cue, never the only one.
 */
import type { PriorityLevel, RecurrenceLevel } from "@/lib/engine/lifecycleStages";

const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap";

export const STAGE_TONE: Record<string, string> = {
  REPORTED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  UNDER_REVIEW: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  VERIFIED: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  AI_PRIORITIZED: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  MAINTENANCE_REQUIRED: "border-indigo-500/40 bg-indigo-500/10 text-indigo-300",
  PLANNING: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  BLOCK_PLANNED: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  WORK_ASSIGNED: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  WORK_IN_PROGRESS: "border-red-500/50 bg-red-500/15 text-red-300",
  AWAITING_VALIDATION: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  CLOSED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

export const URGENCY_TONE: Record<string, string> = {
  EMERGENCY: "border-red-500/50 bg-red-500/15 text-red-300",
  CRITICALLY_OVERDUE: "border-orange-500/50 bg-orange-500/15 text-orange-300",
  OVERDUE: "border-amber-500/50 bg-amber-500/15 text-amber-300",
  DUE_SOON: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  UPCOMING: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  NORMAL: "border-edge bg-panel text-dim",
};

export const PRIORITY_TONE: Record<PriorityLevel, string> = {
  CRITICAL: "border-red-500/50 bg-red-500/15 text-red-300",
  HIGH: "border-orange-500/50 bg-orange-500/15 text-orange-300",
  MEDIUM: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  LOW: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

export const RECURRENCE_TONE: Record<RecurrenceLevel, string> = {
  HIGH: "border-red-500/50 bg-red-500/15 text-red-300",
  MEDIUM: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  LOW: "border-sky-500/40 bg-sky-500/10 text-sky-300",
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
    dept === "ENG" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : dept === "TRD" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-violet-500/40 bg-violet-500/10 text-violet-300";
  return <span className={`${base} ${tone}`}>{dept}</span>;
}

export function DueChip({ dueInDays }: { dueInDays: number }) {
  const text = dueInDays < 0 ? `${Math.abs(dueInDays)} d overdue` : dueInDays === 0 ? "due today" : `due in ${dueInDays} d`;
  const tone = dueInDays < 0 ? "border-red-500/40 bg-red-500/10 text-red-300" : dueInDays <= 3 ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-edge bg-panel text-dim";
  return <span className={`${base} ${tone}`}>{text}</span>;
}
