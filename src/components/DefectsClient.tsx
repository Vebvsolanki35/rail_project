"use client";

/**
 * SMART DEFECT LIFECYCLE — the workbench.
 *
 * One screen, three questions answered at all times:
 *   What's happening now?  What's next?  Who is responsible?
 *
 * The board groups defects by the 11 lifecycle stages, the urgency queue orders
 * them by deadline, and every action button performs the ONE legal next step for
 * that stage. Transitions are validated again server-side; a rejection is shown
 * verbatim.
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, ClipboardCheck, Clock, Gauge, RefreshCw, Search, Wrench } from "lucide-react";
import { DueChip, DepartmentChip, PriorityChip, RecurrenceChip, StageChip, UrgencyChip } from "./DefectBadges";
import type { LifecycleBoardRow, LifecycleRollup } from "@/lib/engine/defectlifecycle";
import type { UrgencySummary as UrgencySummaryType } from "@/lib/engine/urgency";
import UrgencySummary from "./UrgencySummary";

interface Props {
  board: LifecycleBoardRow[];
  rollup: LifecycleRollup;
  urgency: UrgencySummaryType;
}

const FILTER_STAGES = [
  "ALL",
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

export default function DefectsClient({ board, rollup, urgency }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("ALL");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [openPanel, setOpenPanel] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ id: number; text: string; ok: boolean } | null>(null);
  const [inspectForm, setInspectForm] = useState({ note: "", finding: "", extraDurationMin: 45, needsPowerBlock: false });
  const [longTermForm, setLongTermForm] = useState({ durationMin: 240, note: "", plannedFor: "next engineering block" });

  const rows = useMemo(
    () =>
      board.filter(
        (r) =>
          (stageFilter === "ALL" || r.stage === stageFilter) &&
          (urgencyFilter === "ALL" || r.urgencyClass === urgencyFilter) &&
          (deptFilter === "ALL" || r.department === deptFilter) &&
          (!q ||
            r.defectCode.toLowerCase().includes(q.toLowerCase()) ||
            r.title.toLowerCase().includes(q.toLowerCase()) ||
            r.segmentCode.toLowerCase().includes(q.toLowerCase()))
      ),
    [board, stageFilter, urgencyFilter, deptFilter, q]
  );

  async function post(id: number, body: Record<string, unknown>) {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/defects/${id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actorName: "Desk Officer (Lifecycle UI)", actorRole: "CONTROL", ...body }),
      });
      const json = (await res.json()) as { error?: string; stage?: string; priority?: string; durationMin?: number };
      if (!res.ok) {
        setMessage({ id, text: json.error ?? "Transition refused", ok: false });
      } else {
        setMessage({
          id,
          text:
            body.action === "inspect"
              ? `Detailed inspection recorded — duration revised to ${json.durationMin} min, priority floored at ${json.priority ?? "HIGH"}.`
              : body.action === "long-term"
                ? "Long-term maintenance registered — the optimizer will place it as an OFFPEAK extended super-block."
                : `Moved to ${String(json.stage ?? body.to).replace(/_/g, " ")}${
                    json.priority ? ` — priority ${json.priority}` : ""
                  }.`,
          ok: true,
        });
        setOpenPanel(null);
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setMessage({ id, text: e instanceof Error ? e.message : "Network error", ok: false });
    } finally {
      setBusy(null);
    }
  }

  /**
   * PLANNING is the one stage whose next step is not a menu item: the optimizer
   * must actually run. We call the planner, then re-read the board — the defect
   * advances to BLOCK PLANNED from the optimizer's own hook.
   */
  async function runPlanner(id: number) {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ horizon: "WEEKLY" }),
      });
      const json = (await res.json()) as { error?: string; plan?: { id: number; blocks: unknown[] } };
      setMessage({
        id,
        text: res.ok
          ? `Block planner ran — plan #${json.plan?.id} published with ${json.plan?.blocks.length ?? 0} blocks. Defects in the plan advanced to BLOCK PLANNED.`
          : json.error ?? "Planner failed",
        ok: res.ok,
      });
      if (res.ok) startTransition(() => router.refresh());
    } catch (e) {
      setMessage({ id, text: e instanceof Error ? e.message : "Network error", ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Roll-up header */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
          <p className="text-[10px] uppercase tracking-wide text-faint">Open defects in lifecycle</p>
          <p className="mt-1 font-mono text-2xl text-ink">{rollup.open}</p>
          <p className="text-[11px] text-dim">
            {rollup.closed} closed · avg age {rollup.avgAgeDaysOpen} d
          </p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-faint">
            <AlertTriangle size={11} className="text-red-400" /> Emergency / overdue
          </p>
          <p className="mt-1 font-mono text-2xl text-red-300">
            {rollup.emergency} <span className="text-base text-dim">/ {rollup.overdue}</span>
          </p>
          <p className="text-[11px] text-dim">Deadline-driven, from the urgency engine</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-faint">
            <ClipboardCheck size={11} className="text-amber-400" /> Awaiting validation
          </p>
          <p className="mt-1 font-mono text-2xl text-amber-300">{rollup.awaitingValidation}</p>
          <p className="text-[11px] text-dim">Inspector sign-off pending before closure</p>
        </div>
        <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-faint">
            <Gauge size={11} className="text-dim" /> Recurrence & inspection
          </p>
          <p className="mt-1 font-mono text-2xl text-ink">
            {rollup.chronic} <span className="text-base text-dim">chronic</span>
          </p>
          <p className="text-[11px] text-dim">{rollup.detailedInspections} detailed inspections on record</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* Pipeline + table */}
        <div className="space-y-3">
          <div className="rounded-xl border border-edge/70 bg-panel/40 p-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_STAGES.map((s) => {
                const count = s === "ALL" ? board.length : (rollup.counts[s] ?? 0);
                const active = stageFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStageFilter(s)}
                    className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
                      active ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-edge bg-hull/40 text-dim hover:text-ink"
                    }`}
                  >
                    {s.replace(/_/g, " ")} <span className="font-mono opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-edge bg-hull/40 px-2 py-1.5">
                <Search size={12} className="text-faint" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search code, title, section…"
                  className="w-48 bg-transparent text-[11px] text-ink outline-none placeholder:text-faint"
                />
              </div>
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
                className="rounded-lg border border-edge bg-hull/40 px-2 py-1.5 text-[11px] text-dim"
              >
                {["ALL", "EMERGENCY", "CRITICALLY_OVERDUE", "OVERDUE", "DUE_SOON", "UPCOMING", "NORMAL"].map((u) => (
                  <option key={u} value={u}>
                    {u.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-lg border border-edge bg-hull/40 px-2 py-1.5 text-[11px] text-dim"
              >
                {["ALL", "ENG", "TRD", "SNT"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-faint">
                {rows.length} of {board.length} defects
              </span>
              <button
                onClick={() => startTransition(() => router.refresh())}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-edge px-2 py-1.5 text-[10px] font-semibold text-dim transition hover:text-ink"
              >
                <RefreshCw size={11} className={pending ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {rows.slice(0, 60).map((r) => {
              const expanded = openPanel === r.id;
              return (
                <div key={r.id} className="rounded-xl border border-edge/70 bg-panel/50">
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-amber-400">{r.defectCode}</span>
                        <StageChip stage={r.stage} />
                        <PriorityChip priority={r.priority} />
                        <RecurrenceChip band={r.recurrenceBand as "NONE"} occurrences={r.occurrences ?? 0} />
                      </div>
                      <p className="mt-1 text-[12px] text-ink">{r.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                        <span>{r.segmentCode} · {r.corridor}</span>
                        <DepartmentChip dept={r.department} />
                        <span>severity {r.severity}/10</span>
                        {r.detailedInspection && <span className="text-cyan-300">detailed inspection ✓</span>}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <UrgencyChip cls={r.urgencyClass} score={r.urgencyScore} />
                      <DueChip dueInDays={r.dueInDays} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/defects/${r.id}`}
                        className="rounded-lg border border-edge px-2 py-1 text-[10px] font-semibold text-dim transition hover:text-ink"
                      >
                        Timeline
                      </Link>
                      {r.nextAction && r.stage !== "CLOSED" ? (
                        <button
                          onClick={() => setOpenPanel(expanded ? null : r.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-semibold text-slate-950 transition hover:bg-amber-400"
                        >
                          {r.nextAction} <ArrowRight size={10} />
                        </button>
                      ) : (
                        <span className="text-[10px] text-faint">lifecycle complete</span>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="anim-rise border-t border-edge/60 bg-hull/40 p-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-edge/60 bg-panel/40 p-2">
                          <p className="text-[10px] uppercase tracking-wide text-faint">Responsible now</p>
                          <p className="mt-0.5 text-[11px] text-ink">{r.responsible}</p>
                        </div>
                        <div className="rounded-lg border border-edge/60 bg-panel/40 p-2">
                          <p className="text-[10px] uppercase tracking-wide text-faint">Next step</p>
                          <p className="mt-0.5 text-[11px] text-ink">{r.nextAction ?? "—"} ({r.nextActor ?? "—"})</p>
                        </div>
                        <div className="rounded-lg border border-edge/60 bg-panel/40 p-2">
                          <p className="text-[10px] uppercase tracking-wide text-faint">Ordering</p>
                          <p className="mt-0.5 font-mono text-[11px] text-amber-300">
                            sort key {r.sortKey.toFixed(1)} = criticality × ×{r.boost.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {/* Stage-specific actions */}
                      {r.stage === "VERIFIED" && (
                        <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
                            <Wrench size={12} /> Detailed inspection workflow
                          </p>
                          <p className="mt-1 text-[10px] leading-relaxed text-dim">
                            Going beyond the first report: the maintenance duration is revised upward (carried into the
                            optimizer) and priority can never fall below HIGH afterwards.
                          </p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <input
                              value={inspectForm.finding}
                              onChange={(e) => setInspectForm({ ...inspectForm, finding: e.target.value })}
                              placeholder="Finding, e.g. web fracture 12 mm"
                              className="rounded-lg border border-edge bg-hull/60 px-2 py-1.5 text-[11px] text-ink outline-none"
                            />
                            <input
                              value={inspectForm.note}
                              onChange={(e) => setInspectForm({ ...inspectForm, note: e.target.value })}
                              placeholder="Inspection note for the audit trail"
                              className="rounded-lg border border-edge bg-hull/60 px-2 py-1.5 text-[11px] text-ink outline-none"
                            />
                            <label className="flex items-center gap-2 text-[10px] text-dim">
                              Extra duration (min)
                              <input
                                type="number"
                                value={inspectForm.extraDurationMin}
                                onChange={(e) => setInspectForm({ ...inspectForm, extraDurationMin: Number(e.target.value) })}
                                className="w-20 rounded-lg border border-edge bg-hull/60 px-2 py-1 text-[11px] text-ink outline-none"
                              />
                            </label>
                            <label className="flex items-center gap-2 text-[10px] text-dim">
                              <input
                                type="checkbox"
                                checked={inspectForm.needsPowerBlock}
                                onChange={(e) => setInspectForm({ ...inspectForm, needsPowerBlock: e.target.checked })}
                              />
                              Power block required
                            </label>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              disabled={busy === r.id}
                              onClick={() =>
                                post(r.id, {
                                  action: "inspect",
                                  note: inspectForm.note || "detailed inspection recorded",
                                  finding: inspectForm.finding || undefined,
                                  extraDurationMin: inspectForm.extraDurationMin,
                                  needsPowerBlock: inspectForm.needsPowerBlock,
                                })
                              }
                              className="rounded-lg bg-cyan-600 px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                            >
                              Record inspection & prioritise
                            </button>
                            <button
                              disabled={busy === r.id}
                              onClick={() => post(r.id, { action: "advance", to: "AI_PRIORITIZED", note: "verified on site" })}
                              className="rounded-lg border border-edge px-3 py-1.5 text-[10px] font-semibold text-dim transition hover:text-ink disabled:opacity-50"
                            >
                              Skip to AI prioritisation
                            </button>
                          </div>
                        </div>
                      )}

                      {(r.stage === "MAINTENANCE_REQUIRED" || r.stage === "AI_PRIORITIZED") && (
                        <div className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300">
                            <Clock size={12} /> Long-term maintenance
                          </p>
                          <p className="mt-1 text-[10px] leading-relaxed text-dim">
                            For work that needs more than one window: register the extended duration and the optimizer
                            will place it as an OFFPEAK extended super-block instead of splitting it across blocks.
                          </p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <input
                              type="number"
                              value={longTermForm.durationMin}
                              onChange={(e) => setLongTermForm({ ...longTermForm, durationMin: Number(e.target.value) })}
                              className="rounded-lg border border-edge bg-hull/60 px-2 py-1.5 text-[11px] text-ink outline-none"
                              placeholder="Duration (min)"
                            />
                            <input
                              value={longTermForm.plannedFor}
                              onChange={(e) => setLongTermForm({ ...longTermForm, plannedFor: e.target.value })}
                              className="rounded-lg border border-edge bg-hull/60 px-2 py-1.5 text-[11px] text-ink outline-none"
                              placeholder="Target window"
                            />
                            <input
                              value={longTermForm.note}
                              onChange={(e) => setLongTermForm({ ...longTermForm, note: e.target.value })}
                              className="rounded-lg border border-edge bg-hull/60 px-2 py-1.5 text-[11px] text-ink outline-none"
                              placeholder="Scope note"
                            />
                          </div>
                          <button
                            disabled={busy === r.id}
                            onClick={() =>
                              post(r.id, {
                                action: "long-term",
                                durationMin: longTermForm.durationMin,
                                note: longTermForm.note || "long-term maintenance planned",
                                plannedFor: longTermForm.plannedFor,
                              })
                            }
                            className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                          >
                            Register long-term maintenance
                          </button>
                        </div>
                      )}

                      {r.nextAction && r.stage !== "VERIFIED" && r.stage !== "CLOSED" && (
                        <button
                          disabled={busy === r.id}
                          onClick={() =>
                            r.stage === "PLANNING"
                              ? runPlanner(r.id)
                              : post(r.id, { action: "advance", to: nextStageOf(r.stage), note: `advanced from the lifecycle workbench (${r.stage})` })
                          }
                          className="mt-3 rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                        >
                          {busy === r.id ? "Working…" : `${r.nextAction} (${r.nextActor})`}
                        </button>
                      )}

                      {message?.id === r.id && (
                        <p className={`mt-2 text-[11px] ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.text}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="rounded-xl border border-edge/70 bg-panel/50 p-6 text-center text-xs text-dim">
                No defects match these filters.
              </p>
            )}
          </div>
        </div>

        {/* Urgency side panel */}
        <div className="space-y-3">
          <UrgencySummary summary={urgency} />
          <div className="rounded-xl border border-edge/70 bg-panel/50 p-4 text-[10px] leading-relaxed text-dim">
            <p className="text-[11px] font-bold uppercase tracking-wide text-faint">How the ordering works</p>
            <p className="mt-2">
              The AI criticality score is multiplied by an urgency boost of ×0.70–×1.30 derived from the permitted
              rectification deadline. A low-severity defect due tomorrow therefore outranks a higher-severity defect
              with a month of runway — and the boost is shown on every row so the ordering stays inspectable.
            </p>
            <p className="mt-2 text-faint">
              Recurrence is rule-based, not machine learning: ≥4 similar defects on the same asset within 180 days
              escalates the priority to HIGH.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The single legal next stage for a row's action (mirrors lifecycleStages). */
function nextStageOf(stage: string): string {
  const order = [
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
  ];
  const i = order.indexOf(stage);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : stage;
}
