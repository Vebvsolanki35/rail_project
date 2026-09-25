"use client";

/**
 * Super-block intelligence panel.
 *
 * Independent vs coordinated downtime for every queue opportunity, the five
 * weighted feasibility factors, and — for anything not recommended — the
 * COMPUTED reasons (window caps, dense-corridor rules, minimum interval, or no
 * cross-department gain). Planned super blocks and split-block waste follow.
 */
import { useState } from "react";
import { AlertOctagon, CheckCircle2, ChevronDown, Link2, Scissors, Sigma } from "lucide-react";
import BlockExplain from "./BlockExplain";
import type { BlockItemDTO } from "@/lib/engine/types";

export interface FeasibilityFactorDTO {
  key: string;
  label: string;
  weight: number;
  pct: number;
  note: string;
}

export interface OpportunityDTO {
  id: string;
  segmentCode: string;
  corridor: string;
  departments: string[];
  defectCount: number;
  defects: { id: number; title: string; department: string; durationMin: number; severity: number; dueInDays: number }[];
  independentMin: number;
  coordinatedMin: number;
  savingMin: number;
  savingPct: number;
  waves: number;
  window: string;
  feasibility: {
    score: number;
    factors: FeasibilityFactorDTO[];
    reasons: string[];
    decision: "RECOMMEND" | "CONDITIONAL" | "REJECT";
    recommendation: string;
  };
}

export interface SplitFindingDTO {
  segmentCode: string;
  blocks: { id: number; day: number; startMin: number; endMin: number; defectCount: number; isSuperBlock: boolean }[];
  mergeSavingMin: number;
  note: string;
}

const DECISION_TONE = {
  RECOMMEND: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  CONDITIONAL: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  REJECT: "border-rose-500/40 bg-rose-500/10 text-rose-300",
} as const;

export default function SuperBlockPanel({
  opportunities,
  plannedSuperBlocks,
  splitFindings,
  model,
}: {
  opportunities: OpportunityDTO[];
  plannedSuperBlocks: BlockItemDTO[];
  splitFindings: SplitFindingDTO[];
  model: { setupMin: number; firstWaveSetupMin: number; waveSpacingMin: number; formula: string };
}) {
  const [open, setOpen] = useState<string | null>(opportunities[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-edge/70 bg-panel/50 p-3">
        <p className="flex items-center gap-2 text-[11px] text-dim">
          <Sigma size={13} className="text-amber-400" />
          {model.formula}
        </p>
        <p className="mt-1 text-[10px] text-faint">
          Setup {model.setupMin} min per standalone block · first wave {model.firstWaveSetupMin} min · wave spacing{" "}
          {model.waveSpacingMin} min. Feasibility weights: window fit 25 · traffic impact 25 · safety criticality 20 ·
          resource readiness 15 · maintenance recency 15.
        </p>
      </div>

      <div className="space-y-2">
        {opportunities.map((o) => {
          const expanded = open === o.id;
          return (
            <div key={o.id} className="rounded-xl border border-edge/70 bg-panel/50">
              <button onClick={() => setOpen(expanded ? null : o.id)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left">
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-ink">{o.segmentCode}</span>
                    <span className="text-[10px] text-faint">{o.corridor}</span>
                    <span className="rounded-full border border-edge px-1.5 py-0.5 text-[10px] text-dim">{o.departments.join(" + ")}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${DECISION_TONE[o.feasibility.decision]}`}>
                      {o.feasibility.decision} · {o.feasibility.score}/100
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-dim">
                    {o.defectCount} queued task(s) · independent <span className="font-mono text-ink">{o.independentMin} min</span> → coordinated{" "}
                    <span className="font-mono text-emerald-300">{o.coordinatedMin} min</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg text-emerald-300">−{o.savingMin} min</p>
                  <p className="text-[10px] text-faint">{o.savingPct}% less occupancy · {o.waves} wave(s)</p>
                </div>
                <ChevronDown size={14} className={`text-faint transition ${expanded ? "rotate-180" : ""}`} />
              </button>

              {expanded && (
                <div className="anim-rise border-t border-edge/60 bg-hull/40 p-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-faint">Downtime comparison</p>
                      <div className="mt-2 space-y-2">
                        <div>
                          <div className="flex justify-between text-[10px] text-dim">
                            <span>Independent (manual practice)</span>
                            <span className="font-mono">{o.independentMin} min</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-edge/60">
                            <div className="h-full rounded-full bg-rose-500/70" style={{ width: "100%" }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-dim">
                            <span>Coordinated super block ({o.window})</span>
                            <span className="font-mono">{o.coordinatedMin} min</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-edge/60">
                            <div
                              className="h-full rounded-full bg-emerald-500/80"
                              style={{ width: `${Math.max(3, (o.coordinatedMin / Math.max(o.independentMin, 1)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 text-[10px] uppercase tracking-wide text-faint">Bundled tasks</p>
                      <ul className="mt-1.5 space-y-1">
                        {o.defects.slice(0, 6).map((d) => (
                          <li key={d.id} className="flex items-center justify-between text-[10px] text-dim">
                            <span className="truncate pr-2">
                              {d.department} · {d.title}
                            </span>
                            <span className="shrink-0 font-mono">
                              {d.durationMin}m · sev {d.severity} · {d.dueInDays < 0 ? `${Math.abs(d.dueInDays)}d late` : `${d.dueInDays}d`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-faint">Feasibility factors (weighted)</p>
                      <div className="mt-2 space-y-2">
                        {o.feasibility.factors.map((f) => (
                          <div key={f.key}>
                            <div className="flex items-center justify-between text-[10px] text-dim">
                              <span>
                                {f.label} <span className="text-faint">({f.weight}%)</span>
                              </span>
                              <span className="font-mono text-ink">{f.pct}</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge/60">
                              <div className="h-full rounded-full bg-sky-500/80" style={{ width: `${Math.max(2, f.pct)}%` }} />
                            </div>
                            <p className="mt-0.5 text-[9px] text-faint">{f.note}</p>
                          </div>
                        ))}
                      </div>

                      {o.feasibility.reasons.length > 0 && (
                        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2">
                          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-300">
                            <AlertOctagon size={11} /> Computed constraints
                          </p>
                          <ul className="mt-1 space-y-1">
                            {o.feasibility.reasons.map((r) => (
                              <li key={r} className="text-[10px] leading-relaxed text-dim">
                                • {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-[10px] leading-relaxed text-emerald-200">
                        <Link2 size={11} className="mt-0.5 shrink-0" /> {o.feasibility.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {opportunities.length === 0 && (
          <p className="rounded-xl border border-edge/70 bg-panel/50 p-6 text-center text-xs text-dim">
            No two tasks are queued on the same section right now — run the block planner after new defects arrive.
          </p>
        )}
      </div>

      {plannedSuperBlocks.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
            <CheckCircle2 size={13} className="text-emerald-400" /> Super blocks in the current plan
          </h3>
          <div className="space-y-2">
            {plannedSuperBlocks.map((b) => (
              <BlockExplain key={b.id} block={b} />
            ))}
          </div>
        </div>
      )}

      {splitFindings.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
            <Scissors size={13} className="text-violet-400" /> Split-block waste (the reverse of coordination)
          </h3>
          <div className="space-y-2">
            {splitFindings.map((s) => (
              <div key={s.segmentCode} className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
                <p className="text-[11px] text-ink">{s.note}</p>
                <p className="mt-1 text-[10px] text-faint">
                  Blocks: {s.blocks.map((b) => `D${b.day + 1} ${String(Math.floor(b.startMin / 60)).padStart(2, "0")}:${String(b.startMin % 60).padStart(2, "0")}`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
