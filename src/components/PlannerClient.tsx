"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, BrainCircuit, ChevronRight, Clock3, Cpu, FileCheck2, Layers, Loader2, Play, Sparkles, X, ShieldAlert } from "lucide-react";
import GanttChart from "@/components/GanttChart";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { AiRecommendationPanel, PlanningActions, WorkflowSteps, detectConflicts, type WorkflowStep } from "@/components/PlannerPanel";
import { DEPT_COLORS, fmtMin } from "@/lib/engine/network";
import { useRole } from "@/lib/role";
import type { DashboardState, DefectDTO, OptimizeResponse, PlanDTO, SafetyOrderDTO } from "@/lib/engine/types";

/* ---------------- Safety Work Order Panel ---------------- */

function SafetyOrderPanel({ blockId, onClose }: { blockId: number; onClose: () => void }) {
  const [order, setOrder] = useState<SafetyOrderDTO | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    // Deferred a tick: the fetch and its setState land in callbacks rather than
    // synchronously inside the effect body (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      setBusy(true);
      setOrder(null);
      fetch("/api/safety-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockItemId: blockId }),
      })
        .then((r) => r.json())
        .then((d) => setOrder(d))
        .catch(() => setOrder(null))
        .finally(() => setBusy(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [blockId]);

  return (
    <div className="anim-rise rounded-[4px] border border-mint/30 bg-panel p-5 shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]">
      <div className="flex items-center justify-between border-b border-edge/80 pb-3">
        <div className="flex items-center gap-2">
          <FileCheck2 size={16} className="text-mint" />
          <span className="text-xs font-bold text-ink">Block Safety Work Order</span>
          {order && (
            <span className="rounded-full bg-mint/10 border border-mint/20 px-2 py-0.5 text-[10.5px] font-mono text-mint">
              Compiled in {(order.generatedInMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-[3px] border border-edge bg-hull px-2.5 py-1 text-xs text-dim hover:text-ink transition"
        >
          <X size={12} /> Close
        </button>
      </div>

      {busy && <div className="skeleton mt-3 h-36 rounded-[4px]" />}

      {order && (
        <div className="mt-4 space-y-3 rounded-[4px] border border-edge bg-hull/60 p-4">
          <div className="flex items-center justify-between text-[11px] font-mono text-dim">
            <span>REF: {order.ref}</span>
            <span className="text-mint">DIGITALLY SIGNED & AUDITED</span>
          </div>
          <h3 className="text-sm font-bold text-saffron">{order.title}</h3>
          <div className="space-y-2 text-xs text-dim leading-relaxed">
            {order.body.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <div className="border-t border-edge pt-2 text-[10.5px] text-faint">
            Generated according to IRS-2024 interlock rules and General & Subsidiary Rules (GR&SR 15.06).
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Comparative Downtime Bar ---------------- */

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-dim">
        <span>{label}</span>
        <span className="tabular font-mono font-semibold text-ink">{value.toFixed(1)} hrs</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-edge">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, (value / Math.max(max, 1)) * 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/* ---------------- Main Planner Component ---------------- */

export default function PlannerClient({ initial }: { initial: DashboardState }) {
  const [state, setState] = useState(initial);
  const [plan, setPlan] = useState<PlanDTO | null>(initial.latestPlan);
  const [horizon, setHorizon] = useState<"ROLLING" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [week, setWeek] = useState(0);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const role = useRole();
  const isDrm = role?.role === "DRM";
  const [mc, setMc] = useState<OptimizeResponse["monteCarlo"] | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [defects, setDefects] = useState<DefectDTO[]>([]);
  const role = useRole();
  const isDrm = role?.role === "DRM";
  const [approveBusy, setApproveBusy] = useState(false);
  const [conflictCheck, setConflictCheck] = useState<{ at: number; count: number; sections: string[] } | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [resizeInfo, setResizeInfo] = useState<{ delayCostMin: number; affected: number; startMin: number; endMin: number } | null>(null);

  useEffect(() => {
    fetch("/api/defects")
      .then((r) => r.json())
      .then((d) => setDefects(d.defects ?? []))
      .catch(() => setDefects([]));
  }, []);

  const refreshState = useCallback(async () => {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }, []);

  async function run() {
    setRunning(true);
    setLogs([]);
    setSelectedBlock(null);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon }),
      });
      const data = (await res.json()) as OptimizeResponse & { error?: string };
      if (data.error) {
        setLogs(["SOLVER ERROR: " + data.error]);
        return;
      }
      for (let i = 0; i < data.log.length; i++) {
        await new Promise((r) => setTimeout(r, 200));
        setLogs((prev) => [...prev, data.log[i]]);
      }
      setPlan(data.plan);
      setMc(data.monteCarlo);
      setWeek(0);
      const d = await fetch("/api/defects").then((r) => r.json());
      setDefects(d.defects ?? []);
      refreshState();
    } finally {
      setRunning(false);
    }
  }

  /** Step 1/3 — re-read the divisional dashboard so the workflow reflects reality. */
  async function analyzeNetwork() {
    await refreshState();
    setLogs((l) => [
      ...l,
      `NETWORK ANALYSED — ${state.segments.length} sections, ${state.stations.length} stations, ${state.liveTrains.length} trains in the tracking window, ${state.counts.openDefects} open defects in the sanctioned queue.`,
    ]);
  }

  /** Step 5 — measured overlap detection over the plan actually on screen. */
  function runConflictCheck() {
    const blocks = plan?.blocks ?? [];
    const found = detectConflicts(blocks);
    const sections = [...new Set(found.map((f) => f.section))];
    setConflictCheck({ at: Date.now(), count: found.length, sections });
    setLogs((l) => [
      ...l,
      found.length === 0
        ? "CONFLICT CHECK — no same-section overlapping occupancy measured in this plan."
        : `CONFLICT CHECK — ${found.length} overlap(s) measured: ${found.slice(0, 3).map((f) => `${f.section} D+${f.day} (${f.minutes} min)`).join(", ")}${found.length > 3 ? `, +${found.length - 3} more` : ""}.`,
    ]);
  }

  /** Step 6 — formal submission for divisional approval (state recorded server-side). */
  async function submitForApproval() {
    setSubmitBusy(true);
    try {
      await fetch("/api/veto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "PROPOSED" }) });
      await refreshState();
      window.dispatchEvent(new Event("rr-veto"));
      setLogs((l) => [...l, "SUBMITTED FOR APPROVAL — publication withheld until a recorded divisional decision."]);
    } finally {
      setSubmitBusy(false);
    }
  }

  /** Step 6 (DRM) — approve. */
  async function approvePlan() {
    if (!isDrm) return;
    setApproveBusy(true);
    try {
      await fetch("/api/veto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "APPROVED" }) });
      await refreshState();
      window.dispatchEvent(new Event("rr-veto"));
    } finally {
      setApproveBusy(false);
    }
  }

  /** Step 6 (DRM) — reject / override the AI recommendation, with a recorded reason. */
  async function recordOverride() {
    if (!isDrm || overrideNote.trim().length < 6) return;
    setApproveBusy(true);
    try {
      await fetch("/api/veto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "VETOED", reason: "AI recommendation overridden by DRM", note: overrideNote }),
      });
      await refreshState();
      window.dispatchEvent(new Event("rr-veto"));
      setLogs((l) => [...l, `HUMAN OVERRIDE — DRM rejected the AI recommendation. Reason recorded: ${overrideNote}`]);
      setOverrideOpen(false);
      setOverrideNote("");
    } finally {
      setApproveBusy(false);
    }
  }

  async function onGanttResize(id: number, startMin: number, endMin: number) {
    setPlan((p) =>
      p ? { ...p, blocks: p.blocks.map((b) => (b.id === id ? { ...b, startMin, endMin } : b)) } : p
    );
    try {
      const res = await fetch("/api/blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, startMin, endMin }),
      });
      const d = await res.json();
      if (d.ok) {
        setResizeInfo({ delayCostMin: d.delayCostMin, affected: d.affected, startMin: d.startMin, endMin: d.endMin });
        setPlan((p) => (p ? { ...p, blocks: p.blocks.map((b) => (b.id === id ? { ...b, delayCostMin: d.delayCostMin } : b)) } : p));
        refreshState();
      }
    } catch {
      /* keep optimistic state */
    }
  }

  const k = plan?.kpis;
  const weeks = plan?.horizon === "MONTHLY" ? 4 : 1;
  const approved = state.settings.planStatus === "APPROVED";
  const vetoed = state.settings.planStatus === "VETOED";
  const conflictCount = conflictCheck?.count ?? 0;
  const conflictSections = conflictCheck?.sections ?? [];

  const steps: WorkflowStep[] = [
    {
      n: 1,
      label: "Select Section",
      owner: "Control office · COA",
      state: "done",
      detail: `${state.segments.length} sections in this division; ${state.segments.reduce((n, sg) => n + sg.dailyTrains, 0)} daily train paths modelled.`,
    },
    {
      n: 2,
      label: "Maintenance Requirements",
      owner: "Section Inspector / TMS",
      state: state.counts.openDefects > 0 ? "done" : "pending",
      detail: `${state.counts.openDefects} open defect(s) in the sanctioned queue · ${state.counts.criticalDefects} critical.`,
    },
    {
      n: 3,
      label: "Analyse Train Operations",
      owner: "Control office",
      state: state.liveTrains.length > 0 ? "done" : "pending",
      detail: `${state.liveTrains.length} train(s) tracked in the running window · ${state.overrun ? "live overrun risk open" : "no overrun risk open"}.`,
    },
    {
      n: 4,
      label: "Generate AI Plan",
      owner: "Optimiser (advisory)",
      state: plan ? "done" : "active",
      detail: plan
        ? `Plan #${plan.id} generated — ${plan.blocks.length} occupancy(ies), ${plan.blocks.filter((b) => b.isSuperBlock).length} super-block(s).`
        : "No plan generated for this queue yet.",
    },
    {
      n: 5,
      label: "Review Conflicts",
      owner: "Control office",
      state: conflictCheck ? (conflictCount > 0 ? "active" : "done") : plan ? "active" : "pending",
      detail: conflictCheck
        ? conflictCount > 0
          ? `${conflictCount} same-section overlap(s) measured${conflictSections.length ? ` — ${conflictSections.slice(0, 2).join(", ")}` : ""}.`
          : "No same-section overlap measured in this plan."
        : "Overlap detection has not been run on this plan.",
    },
    {
      n: 6,
      label: "Human Approval",
      owner: "DRM (divisional)",
      state: approved ? "done" : plan ? "active" : "pending",
      detail: approved
        ? "Approved by the divisional officer; decision recorded with actor and timestamp."
        : vetoed
          ? "Rejected by the divisional officer — publication withheld."
          : plan
            ? "Awaiting the divisional decision (approve, reject or override with a recorded reason)."
            : "Cannot be reached until a plan exists.",
    },
    {
      n: 7,
      label: "Publish Block",
      owner: "Control office",
      state: approved ? "done" : "pending",
      detail: approved ? "Occupancies published to the field desks, the station board and the audit trail." : "Publication is blocked until step 6 records an approval.",
    },
  ];

  return (
    <div className="anim-rise space-y-3">
      <PageHeader
        module="AIP-BLK"
        title="AI Block Planner"
        titleKey="page.planner"
        subtitleKey="page.planner.sub"
        subtitle="Combinatorial wave packer with multi-department super-block bundling and Monte-Carlo validation. The optimiser is advisory: every occupancy needs a recorded human decision before it is published."
        crumbs={[{ label: "AI Planning" }, { label: "AI Block Planner" }]}
        state={
          approved
            ? "Plan approved — occupancies published"
            : vetoed
              ? "Plan rejected by DRM — awaiting re-plan"
              : plan
                ? "AI recommendation awaiting human approval"
                : "No candidate plan generated"
        }
        stateTone={approved ? "success" : vetoed ? "critical" : plan ? "warning" : "info"}
        reference={plan ? `Plan #${plan.id} · ${plan.horizon} · ${plan.blocks.length} occupancies` : "—"}
        actions={
          <>
            <Link href="/superblocks" className="btn">
              Super-block opportunities
            </Link>
            <Link href="/compare" className="btn">
              Compare strategies
            </Link>
          </>
        }
      />

      <WorkflowSteps
        steps={steps}
        note="Steps 1–3 establish the problem, step 4 is machine analysis, step 5 verifies the machine's output, and steps 6–7 are human decisions. Regenerating a plan returns the workflow to step 4 — an approval is never carried forward automatically."
      />

      <AiRecommendationPanel plan={plan} state={state} conflictChecked={!!conflictCheck} conflicts={conflictCount} conflictSections={conflictSections} />

      <PlanningActions
        running={running}
        plan={plan}
        approved={approved}
        vetoed={vetoed}
        isDrm={isDrm}
        conflictChecked={!!conflictCheck}
        conflicts={conflictCount}
        busy={approveBusy || submitBusy}
        onAnalyze={analyzeNetwork}
        onGenerate={run}
        onConflictCheck={runConflictCheck}
        onCompare={run}
        onSubmit={submitForApproval}
        onApprove={approvePlan}
        onReject={() => setOverrideOpen(true)}
        onOverride={() => setOverrideOpen(true)}
      />
      {/* Control Deck */}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[4px] bg-saffron/15 text-saffron border border-saffron/30">
              <BrainCircuit size={20} />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">Strategic Block Optimization Engine</h2>
              <p className="text-xs text-dim">Combinatorial wave packer · Super-block bundling · 500-run Monte Carlo validation</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Horizon Switcher Tabs */}
            <div className="flex rounded-[4px] border border-edge bg-hull p-1">
              {(["ROLLING", "WEEKLY", "MONTHLY"] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={`rounded-[3px] px-3 py-1.5 text-xs font-semibold transition ${
                    horizon === h ? "bg-saffron text-abyss" : "text-dim hover:text-ink"
                  }`}
                >
                  {h === "ROLLING" ? "4H Rolling" : h === "WEEKLY" ? "7-Day Weekly" : "28-Day Monthly"}
                </button>
              ))}
            </div>

            <span className="flex items-center gap-1.5 rounded-[3px] border border-mint/40 bg-mint/10 px-2.5 py-1.5 text-[11px] font-semibold text-mint">
              <BadgeCheck size={13} aria-hidden /> {state.settings.planStatus === "APPROVED" ? "DRM approved" : state.settings.planStatus === "VETOED" ? "Veto active" : "Approval pending"}
            </span>
          </div>
        </div>

        {/* Model Card Strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-edge bg-panel/40 px-5 py-2.5 text-xs text-dim">
          <span className="font-semibold text-saffron">Model Card:</span>
          <span>{state.modelCard.algorithm}</span>
          <span>·</span>
          <span>Trained on {state.modelCard.trainedOn} maintenance records</span>
          <span>·</span>
          <span className="font-mono font-medium text-mint">Accuracy: {state.modelCard.accuracy}% (AUC {state.modelCard.auc})</span>
          <span>·</span>
          <span className="text-faint">80/20 train/test holdout fitted runtime</span>
        </div>

        {/* Solver Execution Console */}
        <div className="code-panel border-t border-edge px-4 py-3 font-mono text-[11.5px]">
          <div className="flex items-center gap-2 text-dim text-[11px] mb-1">
            <Cpu size={12} className={running ? "animate-pulse text-saffron" : ""} />
            <span className="font-semibold tracking-wider uppercase">Solver Output Stream</span>
          </div>
          <div className="space-y-1">
            {logs.length === 0 && (
              <p className="text-faint">Idle · Click &quot;Run Optimizer&quot; to schedule {state.counts.openDefects} defects across {state.segments.length} sections.</p>
            )}
            {logs.map((l, i) => (
              <p key={i} className="anim-rise text-mint/90 leading-relaxed">
                <span className="text-faint mr-1.5">▸</span> {l}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* DRM override dialog — records the human decision against the plan */}
      {overrideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={() => setOverrideOpen(false)}>
          <div
            role="dialog"
            aria-label="Override AI recommendation"
            className="anim-rise w-full max-w-md border border-signal/45 bg-panel shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-signal/30 bg-signal/[0.06] px-4 py-2.5">
              <p className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wide text-signal">
                <ShieldAlert size={14} aria-hidden /> Override AI recommendation
              </p>
              <button onClick={() => setOverrideOpen(false)} className="p-0.5 text-dim hover:text-ink" aria-label="Close">
                <X size={15} aria-hidden />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-[11.5px] leading-relaxed text-dim">
                The AI recommendation is withheld and the plan must be regenerated. Your reason is recorded against the plan with your desk, name and
                timestamp in the approvals and audit trail.
              </p>
              <label className="block">
                <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-faint">Decision reason (recorded)</span>
                <textarea
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. crew not available on D+2; traffic regulation with four late-running Rajdhani paths…"
                  className="w-full border border-edge bg-abyss px-3 py-2 text-[12px] text-ink placeholder:text-faint focus:border-primary focus:outline-none"
                />
              </label>
              <button onClick={recordOverride} disabled={approveBusy || overrideNote.trim().length < 6} className="btn btn-danger w-full">
                {approveBusy ? "Recording…" : "Record override"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Summary */}
      {plan && k && (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="panel p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-dim">Total Asset Downtime</span>
            <div className="mt-4 space-y-3">
              <Bar label="Manual BDMS Baseline" value={k.downtimeBaselineH ?? 0} max={k.downtimeBaselineH ?? 1} color="#475569" />
              <Bar label="Rail Rakshak Optimized" value={k.downtimeOptimizedH ?? 0} max={k.downtimeBaselineH ?? 1} color="#10b981" />
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-mint">
              <Sparkles size={14} /> {k.reductionPct ?? 0}% Downtime Eliminated via Super-Blocks
            </p>
          </div>

          <div className="panel p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-dim">Super-Block Bundling</span>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight text-violet font-mono">{k.bundlingPct ?? 0}%</span>
              <span className="text-xs text-dim">
                {k.superBlocks ?? 0} super-blocks of {k.blocks ?? 0} total
              </span>
            </div>
            <div className="mt-4 flex gap-1.5">
              {Array.from({ length: Math.max(k.blocks ?? 0, 1) }).map((_, i) => (
                <span
                  key={i}
                  className="h-3 flex-1 rounded-[2px]"
                  style={{ backgroundColor: i < (k.superBlocks ?? 0) ? "var(--color-violet)" : "var(--color-edge)" }}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-faint">Target: ≥ 70% multi-department overlap (Legacy &lt; 10%)</p>
          </div>

          <div className="panel p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-dim">Monte Carlo Robustness</span>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight text-mint font-mono">{plan.resilienceScore}</span>
              <span className="text-xs text-dim">/ 100 resilience score</span>
            </div>
            {mc && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-[3px] border border-edge bg-hull/60 p-2">
                  <span className="block font-mono font-bold text-ink">{mc.p50Delay}m</span>
                  <span className="text-[10px] text-dim">p50 Delay</span>
                </div>
                <div className="rounded-[3px] border border-edge bg-hull/60 p-2">
                  <span className="block font-mono font-bold text-saffron">{mc.p95Delay}m</span>
                  <span className="text-[10px] text-dim">p95 Delay</span>
                </div>
                <div className="rounded-[3px] border border-edge bg-hull/60 p-2">
                  <span className="block font-mono font-bold text-cyan">{mc.stdDev}m</span>
                  <span className="text-[10px] text-dim">Std-dev σ</span>
                </div>
              </div>
            )}
            <p className="mt-3 text-[11px] text-faint">500 runs tested against fog, freight surges & VIP holds</p>
          </div>
        </section>
      )}

      {/* Gantt Schedule */}
      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <Layers size={14} className="text-saffron" />
            {plan ? plan.name : "Weekly Block Schedule"} — Multi-Department Gantt
          </span>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: weeks }).map((_, w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeek(w)}
                className={`rounded-[3px] px-2.5 py-1 text-xs font-semibold transition ${
                  week === w ? "bg-saffron/20 text-saffron border border-saffron/40" : "text-dim hover:text-ink"
                }`}
              >
                Week {w + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto p-4">
          <GanttChart
            blocks={plan?.blocks ?? []}
            week={week}
            selectedId={selectedBlock}
            onSelect={(id) => setSelectedBlock(id === selectedBlock ? null : id)}
            onResize={plan ? onGanttResize : undefined}
          />
          {!plan && (
            <p className="py-12 text-center text-xs text-dim">
              No schedule generated yet. Click &quot;Run Optimizer&quot; to generate the {horizon.toLowerCase()} block plan.
            </p>
          )}
        </div>

        {resizeInfo && (
          <div className="anim-rise mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-cyan/30 bg-cyan/10 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-cyan">Cascade Recalculated:</span>
              <span className="text-ink">
                New window {fmtMin(resizeInfo.startMin)}–{fmtMin(resizeInfo.endMin)} · Affected Trains: <strong className="text-saffron">{resizeInfo.affected}</strong> · Network Delay: <strong className="text-saffron">{Math.round(resizeInfo.delayCostMin)} min</strong>
              </span>
            </div>
            <button onClick={() => setResizeInfo(null)} className="text-xs text-dim hover:text-ink">Dismiss</button>
          </div>
        )}

        {selectedBlock && (
          <div className="border-t border-edge p-4">
            <SafetyOrderPanel blockId={selectedBlock} onClose={() => setSelectedBlock(null)} />
          </div>
        )}
      </section>

      {/* Defect Backlog Table */}
      <section className="panel">
        <div className="panel-hd">
          <span>Live Defect Backlog (TMS · TDMS · SMMS)</span>
          <span className="text-xs font-mono text-dim">{defects.filter((d) => d.status === "open").length} open</span>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <table className="gov-table">
            <thead className="sticky top-0 bg-panel border-b border-edge text-[11px] font-semibold text-dim uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Risk Score</th>
                <th className="px-3 py-3">Defect Description</th>
                <th className="px-3 py-3">Section</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">P(fail 72h)</th>
                <th className="px-3 py-3">Overdue</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {defects.slice(0, 24).map((d) => (
                <tr key={d.id} className="hover:bg-primary/[0.04]">
                  <td className="px-4 py-2.5">
                    <span
                      className="rounded-[2px] px-2 py-0.5 font-mono font-bold text-[11px]"
                      style={{
                        backgroundColor: d.aiScore > 70 ? "color-mix(in srgb, var(--color-signal) 15%, transparent)" : d.aiScore > 45 ? "color-mix(in srgb, var(--color-saffron) 15%, transparent)" : "color-mix(in srgb, var(--color-mint) 15%, transparent)",
                        color: d.aiScore > 70 ? "var(--color-signal)" : d.aiScore > 45 ? "var(--color-saffron)" : "var(--color-mint)",
                      }}
                    >
                      {d.aiScore.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-ink">{d.title}</td>
                  <td className="px-3 py-2.5 font-mono text-dim">{d.segmentCode}</td>
                  <td className="px-3 py-2.5 font-semibold" style={{ color: DEPT_COLORS[d.department] }}>
                    {d.department}
                  </td>
                  <td className="px-3 py-2.5 text-faint">{d.sourceSystem}</td>
                  <td className="px-3 py-2.5 font-mono text-ink">{(d.failureProb72h * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2.5 font-mono text-dim">{d.overdueDays}d</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`inline-flex items-center gap-1 font-medium capitalize ${d.status === "scheduled" ? "text-mint" : "text-saffron"}`}>
                      {d.status} <ChevronRight size={11} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
