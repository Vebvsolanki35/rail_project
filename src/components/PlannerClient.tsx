"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, BrainCircuit, ChevronRight, Clock3, Cpu, FileCheck2, Layers, Loader2, Play, Sparkles, X, ShieldAlert } from "lucide-react";
import GanttChart from "@/components/GanttChart";
import { DEPT_COLORS, fmtMin } from "@/lib/engine/network";
import { getRole } from "@/lib/role";
import type { DashboardState, DefectDTO, OptimizeResponse, PlanDTO, SafetyOrderDTO } from "@/lib/engine/types";

/* ---------------- Safety Work Order Panel ---------------- */

function SafetyOrderPanel({ blockId, onClose }: { blockId: number; onClose: () => void }) {
  const [order, setOrder] = useState<SafetyOrderDTO | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    setOrder(null);
    fetch("/api/safety-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockItemId: blockId }),
    })
      .then((r) => r.json())
      .then((d) => setOrder(d))
      .finally(() => setBusy(false));
  }, [blockId]);

  return (
    <div className="anim-rise rounded-xl border border-emerald-500/30 bg-panel p-5 shadow-lg">
      <div className="flex items-center justify-between border-b border-edge/80 pb-3">
        <div className="flex items-center gap-2">
          <FileCheck2 size={16} className="text-emerald-400" />
          <span className="text-xs font-bold text-ink">Block Safety Work Order</span>
          {order && (
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10.5px] font-mono text-emerald-400">
              Compiled in {(order.generatedInMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg border border-edge bg-hull px-2.5 py-1 text-xs text-dim hover:text-ink transition"
        >
          <X size={12} /> Close
        </button>
      </div>

      {busy && <div className="skeleton mt-3 h-36 rounded-xl" />}

      {order && (
        <div className="mt-4 space-y-3 rounded-xl border border-edge bg-hull/60 p-4">
          <div className="flex items-center justify-between text-[11px] font-mono text-dim">
            <span>REF: {order.ref}</span>
            <span className="text-emerald-400">DIGITALLY SIGNED & AUDITED</span>
          </div>
          <h3 className="text-sm font-bold text-amber-400">{order.title}</h3>
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
  const [mc, setMc] = useState<OptimizeResponse["monteCarlo"] | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [defects, setDefects] = useState<DefectDTO[]>([]);
  const [isDrm, setIsDrm] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [resizeInfo, setResizeInfo] = useState<{ delayCostMin: number; affected: number; startMin: number; endMin: number } | null>(null);

  useEffect(() => {
    setIsDrm(getRole()?.role === "DRM");
    fetch("/api/defects").then((r) => r.json()).then((d) => setDefects(d.defects ?? []));
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

  return (
    <div className="anim-rise space-y-4">
      {/* Control Deck */}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <BrainCircuit size={20} />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">Strategic Block Optimization Engine</h2>
              <p className="text-xs text-dim">Combinatorial wave packer · Super-block bundling · 500-run Monte Carlo validation</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Horizon Switcher Tabs */}
            <div className="flex rounded-xl border border-edge bg-hull p-1">
              {(["ROLLING", "WEEKLY", "MONTHLY"] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    horizon === h ? "bg-amber-500 text-slate-950 shadow-sm" : "text-dim hover:text-ink"
                  }`}
                >
                  {h === "ROLLING" ? "4H Rolling" : h === "WEEKLY" ? "7-Day Weekly" : "28-Day Monthly"}
                </button>
              ))}
            </div>

            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition hover:bg-amber-400 disabled:opacity-50"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? "Solving Constraints…" : "Run Optimizer"}
            </button>

            {isDrm && plan && state.settings.planStatus !== "APPROVED" && (
              <button
                onClick={async () => {
                  setApproveBusy(true);
                  try {
                    await fetch("/api/veto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "APPROVED" }) });
                    await refreshState();
                  } finally {
                    setApproveBusy(false);
                  }
                }}
                disabled={approveBusy}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {approveBusy ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={14} />}
                Approve Schedule
              </button>
            )}

            {state.settings.planStatus === "APPROVED" && (
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
                <BadgeCheck size={14} /> DRM Approved
              </span>
            )}

            {state.settings.planStatus === "VETOED" && (
              <span className="anim-blink flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">
                <ShieldAlert size={14} /> Veto Active (Paused)
              </span>
            )}
          </div>
        </div>

        {/* Model Card Strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-edge bg-panel/40 px-5 py-2.5 text-xs text-dim">
          <span className="font-semibold text-amber-400">Model Card:</span>
          <span>{state.modelCard.algorithm}</span>
          <span>·</span>
          <span>Trained on {state.modelCard.trainedOn} maintenance records</span>
          <span>·</span>
          <span className="font-mono font-medium text-emerald-400">Accuracy: {state.modelCard.accuracy}% (AUC {state.modelCard.auc})</span>
          <span>·</span>
          <span className="text-faint">80/20 train/test holdout fitted runtime</span>
        </div>

        {/* Solver Execution Console */}
        <div className="border-t border-edge bg-[#080d16] px-5 py-3 font-mono text-xs">
          <div className="flex items-center gap-2 text-dim text-[11px] mb-1">
            <Cpu size={12} className={running ? "animate-pulse text-amber-400" : ""} />
            <span className="font-semibold tracking-wider uppercase">Solver Output Stream</span>
          </div>
          <div className="space-y-1">
            {logs.length === 0 && (
              <p className="text-faint">Idle · Click &quot;Run Optimizer&quot; to schedule {state.counts.openDefects} defects across {state.segments.length} sections.</p>
            )}
            {logs.map((l, i) => (
              <p key={i} className="anim-rise text-emerald-400/90 leading-relaxed">
                <span className="text-faint mr-1.5">▸</span> {l}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Analytics Summary */}
      {plan && k && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="panel p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-dim">Total Asset Downtime</span>
            <div className="mt-4 space-y-3">
              <Bar label="Manual BDMS Baseline" value={k.downtimeBaselineH ?? 0} max={k.downtimeBaselineH ?? 1} color="#475569" />
              <Bar label="Rail Rakshak Optimized" value={k.downtimeOptimizedH ?? 0} max={k.downtimeBaselineH ?? 1} color="#10b981" />
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Sparkles size={14} /> {k.reductionPct ?? 0}% Downtime Eliminated via Super-Blocks
            </p>
          </div>

          <div className="panel p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-dim">Super-Block Bundling</span>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight text-purple-400 font-mono">{k.bundlingPct ?? 0}%</span>
              <span className="text-xs text-dim">
                {k.superBlocks ?? 0} super-blocks of {k.blocks ?? 0} total
              </span>
            </div>
            <div className="mt-4 flex gap-1.5">
              {Array.from({ length: Math.max(k.blocks ?? 0, 1) }).map((_, i) => (
                <span
                  key={i}
                  className="h-3 flex-1 rounded-sm"
                  style={{ backgroundColor: i < (k.superBlocks ?? 0) ? "#a855f7" : "#1e293b" }}
                />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-faint">Target: ≥ 70% multi-department overlap (Legacy &lt; 10%)</p>
          </div>

          <div className="panel p-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-dim">Monte Carlo Robustness</span>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight text-emerald-400 font-mono">{plan.resilienceScore}</span>
              <span className="text-xs text-dim">/ 100 resilience score</span>
            </div>
            {mc && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-edge bg-hull/60 p-2">
                  <span className="block font-mono font-bold text-ink">{mc.p50Delay}m</span>
                  <span className="text-[10px] text-dim">p50 Delay</span>
                </div>
                <div className="rounded-lg border border-edge bg-hull/60 p-2">
                  <span className="block font-mono font-bold text-amber-400">{mc.p95Delay}m</span>
                  <span className="text-[10px] text-dim">p95 Delay</span>
                </div>
                <div className="rounded-lg border border-edge bg-hull/60 p-2">
                  <span className="block font-mono font-bold text-sky-400">{mc.stdDev}m</span>
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
            <Layers size={14} className="text-amber-400" />
            {plan ? plan.name : "Weekly Block Schedule"} — Multi-Department Gantt
          </span>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: weeks }).map((_, w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeek(w)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  week === w ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "text-dim hover:text-ink"
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
          <div className="anim-rise mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sky-400">Cascade Recalculated:</span>
              <span className="text-ink">
                New window {fmtMin(resizeInfo.startMin)}–{fmtMin(resizeInfo.endMin)} · Affected Trains: <strong className="text-amber-400">{resizeInfo.affected}</strong> · Network Delay: <strong className="text-amber-400">{Math.round(resizeInfo.delayCostMin)} min</strong>
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
          <table className="w-full text-left text-xs">
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
                <tr key={d.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <span
                      className="rounded-md px-2 py-0.5 font-mono font-bold text-[11px]"
                      style={{
                        backgroundColor: d.aiScore > 70 ? "rgba(244,63,94,0.15)" : d.aiScore > 45 ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                        color: d.aiScore > 70 ? "#fb7185" : d.aiScore > 45 ? "#fbbf24" : "#34d399",
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
                    <span className={`inline-flex items-center gap-1 font-medium capitalize ${d.status === "scheduled" ? "text-emerald-400" : "text-amber-400"}`}>
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
