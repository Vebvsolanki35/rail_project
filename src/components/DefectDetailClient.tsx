"use client";

/**
 * Defect detail — the full story of one defect: where it is in the 11-stage
 * lifecycle, what is happening now, what happens next, who is responsible, how
 * its priority was computed, and the complete audit trail of who moved it.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Clock, FileText, Gauge, History, Info, UserCog } from "lucide-react";
import { DueChip, DepartmentChip, PriorityChip, RecurrenceChip, StageChip, UrgencyChip } from "./DefectBadges";
import type { DefectLifecycleDTO } from "@/lib/engine/defectlifecycle";

export default function DefectDetailClient({ defect }: { defect: DefectLifecycleDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [note, setNote] = useState("");

  const stage = defect.stageConfig;
  const order = defect.timeline;
  const completedAt = new Map(defect.events.filter((e) => e.toStage !== e.fromStage).map((e) => [e.toStage, e.at]));

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/defects/${defect.id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actorName: "Desk Officer (Defect Detail)", actorRole: "CONTROL", ...body }),
      });
      const json = (await res.json()) as { error?: string; stage?: string };
      setMsg({ text: res.ok ? `Recorded — now at ${String(json.stage ?? "").replace(/_/g, " ")}.` : json.error ?? "Refused", ok: res.ok });
      if (res.ok) startTransition(() => router.refresh());
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Network error", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/defects" className="inline-flex items-center gap-1.5 text-xs text-dim transition hover:text-ink">
        <ArrowLeft size={13} /> Back to defect lifecycle
      </Link>

      {/* Identity */}
      <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-amber-400">{defect.defectCode}</span>
              <StageChip stage={defect.stage} />
              <PriorityChip priority={defect.priority} />
              <UrgencyChip cls={defect.urgencyClass} score={defect.urgencyScore} />
              <DueChip dueInDays={defect.dueInDays} />
              <RecurrenceChip band={defect.recurrenceBand} occurrences={defect.occurrences} />
            </div>
            <h1 className="mt-2 text-lg font-bold text-ink">{defect.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-dim">
              <span>{defect.segmentCode} · {defect.corridor}</span>
              <DepartmentChip dept={defect.department} />
              <span>source: {defect.sourceSystem}</span>
              <span>asset: {defect.assetLabel}</span>
              <span>severity {defect.severity}/10</span>
              <span>duration {defect.durationMin} min</span>
              <span>inspection: {defect.inspectionMode}</span>
            </p>
          </div>
          <div className="text-right text-[10px] text-faint">
            <p>detected {new Date(defect.detectedAt).toLocaleString()}</p>
            {defect.closedAt && <p className="text-emerald-300">closed {new Date(defect.closedAt).toLocaleString()}</p>}
            <p className="mt-1">occurrences on this asset: {defect.occurrences}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* What's happening / what's next */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
                <Info size={11} className="text-amber-400" /> What&apos;s happening now
              </p>
              <p className="mt-1 text-[12px] text-ink">{stage.happening}</p>
            </div>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
                <Clock size={11} className="text-sky-400" /> What&apos;s next
              </p>
              <p className="mt-1 text-[12px] text-ink">{stage.next}</p>
            </div>
            <div className="rounded-xl border border-edge/70 bg-hull/40 p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
                <UserCog size={11} className="text-dim" /> Responsible
              </p>
              <p className="mt-1 text-[12px] text-ink">{stage.responsible}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-dim">Lifecycle timeline</h2>
            <ol className="mt-3 space-y-0">
              {order.map((t, i) => (
                <li key={t.stage} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {t.state === "done" ? (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    ) : t.state === "current" ? (
                      <span className="relative flex h-4 w-4 items-center justify-center">
                        <span className="absolute h-4 w-4 animate-ping rounded-full bg-amber-500/40" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      </span>
                    ) : (
                      <Circle size={16} className="text-edge" />
                    )}
                    {i < order.length - 1 && <span className={`w-px flex-1 ${t.state === "done" ? "bg-emerald-500/40" : "bg-edge/70"}`} />}
                  </div>
                  <div className={`pb-3 ${t.state === "future" ? "opacity-55" : ""}`}>
                    <p className={`text-[12px] font-semibold ${t.state === "current" ? "text-amber-300" : t.state === "done" ? "text-ink" : "text-dim"}`}>
                      {t.stage.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-faint">
                      {t.state === "done"
                        ? `completed ${completedAt.get(t.stage) ? new Date(completedAt.get(t.stage)!).toLocaleString() : ""}`
                        : t.state === "current"
                          ? "current stage"
                          : "pending"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Audit trail */}
          <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
              <History size={13} className="text-amber-400" /> Audit trail ({defect.events.length} records)
            </h2>
            <div className="mt-3 space-y-2">
              {defect.events.map((e) => (
                <div key={e.id} className="rounded-lg border border-edge/60 bg-hull/40 p-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="font-semibold text-ink">
                      {e.fromStage === e.toStage ? e.fromStage.replace(/_/g, " ") : `${e.fromStage.replace(/_/g, " ")} → ${e.toStage.replace(/_/g, " ")}`}
                    </span>
                    <span className="text-faint">{new Date(e.at).toLocaleString()}</span>
                    <span className="rounded-full border border-edge px-1.5 py-0.5 text-dim">{e.actorRole}</span>
                    <span className="text-dim">{e.actor}</span>
                  </div>
                  {e.note && <p className="mt-1 text-[11px] text-dim">{e.note}</p>}
                </div>
              ))}
              {defect.events.length === 0 && <p className="text-[11px] text-faint">No transitions recorded yet.</p>}
            </div>
          </div>
        </div>

        {/* Priority + actions */}
        <div className="space-y-4">
          <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
              <Gauge size={13} className="text-amber-400" /> Priority computation
            </h2>
            {defect.priorityBreakdown ? (
              <div className="mt-3 space-y-2">
                {[
                  { label: "Criticality", pct: defect.priorityBreakdown.criticalityPct, weight: 35 },
                  { label: "Urgency", pct: defect.priorityBreakdown.urgencyPct, weight: 30 },
                  { label: "ML failure risk", pct: defect.priorityBreakdown.mlRiskPct, weight: 20 },
                  { label: "Asset availability", pct: defect.priorityBreakdown.availabilityPct, weight: 15 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-[10px] text-dim">
                      <span>
                        {row.label} <span className="text-faint">({row.weight}%)</span>
                      </span>
                      <span className="font-mono text-ink">{row.pct.toFixed(1)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge/60">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500" style={{ width: `${Math.max(2, Math.min(100, row.pct))}%` }} />
                    </div>
                  </div>
                ))}
                <p className="mt-2 rounded-lg border border-edge/60 bg-hull/40 p-2 text-[10px] text-dim">
                  Blended priority <span className="font-mono text-ink">{defect.priorityBreakdown.final.toFixed(1)}/100</span> → band{" "}
                  <span className="font-semibold text-ink">{defect.priorityBreakdown.band}</span>. Urgency boost applied by the
                  planner: <span className="font-mono text-amber-300">×{defect.boost.toFixed(2)}</span>.
                </p>
                <ul className="space-y-1">
                  {defect.priorityBreakdown.reasons.map((r) => (
                    <li key={r} className="text-[10px] leading-relaxed text-faint">
                      • {r}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-faint">Priority breakdown unavailable (section data missing).</p>
            )}
          </div>

          {defect.longTermMaintenance && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
                <FileText size={13} className="text-indigo-300" /> Long-term maintenance
              </h2>
              <p className="mt-2 text-[11px] text-ink">
                {defect.longTermMaintenance.durationMin} min · {defect.longTermMaintenance.note}
              </p>
              <p className="text-[10px] text-faint">target: {defect.longTermMaintenance.plannedFor} — planned as an OFFPEAK extended super-block</p>
            </div>
          )}

          <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-dim">Actions</h2>
            {defect.stage === "CLOSED" ? (
              <p className="mt-2 flex items-center gap-2 text-[11px] text-emerald-300">
                <CheckCircle2 size={13} /> Lifecycle completed — the asset&apos;s maintenance status has been updated.
              </p>
            ) : (
              <>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Reason / note for the audit trail"
                  className="mt-2 w-full rounded-lg border border-edge bg-hull/50 px-2 py-1.5 text-[11px] text-ink outline-none"
                />
                {stage.action ? (
                  <button
                    disabled={busy}
                    onClick={() => act({ action: "advance", to: nextStage(defect.stage), note: note || undefined })}
                    className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                  >
                    {busy ? "Working…" : stage.action.label}
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] text-faint">No manual action at this stage — the Job Portal drives it from here.</p>
                )}
                {stage.correction && (
                  <button
                    disabled={busy}
                    onClick={() => act({ action: "advance", to: "WORK_ASSIGNED", note: note || "reopened for rework" })}
                    className="mt-2 w-full rounded-lg border border-rose-500/50 px-3 py-2 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    {stage.correction.label} (administrative correction)
                  </button>
                )}
                <p className="mt-2 text-[10px] leading-relaxed text-faint">
                  Transitions are validated server-side against the lifecycle graph. The single deliberate non-adjacent
                  edge is the clearly-labelled rework correction AWAITING VALIDATION → WORK ASSIGNED.
                </p>
              </>
            )}
            {msg && <p className={`mt-2 text-[11px] ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
            {pending && <p className="mt-1 text-[10px] text-faint">refreshing…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function nextStage(stage: string): string {
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
