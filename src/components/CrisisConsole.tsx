"use client";

import { useState } from "react";
import { AlertOctagon, CheckCircle2, Crosshair, Loader2, RefreshCcw, Route, ShieldCheck, Siren } from "lucide-react";
import type { CrisisResult, CrisisStep } from "@/lib/engine/types";

const TONE: Record<CrisisStep["tone"], { color: string; bg: string }> = {
  info: { color: "var(--color-cyan)", bg: "rgba(56, 189, 248, 0.08)" },
  warn: { color: "var(--color-saffron)", bg: "rgba(245, 158, 11, 0.08)" },
  critical: { color: "var(--color-signal)", bg: "rgba(244, 63, 94, 0.1)" },
  ok: { color: "var(--color-mint)", bg: "rgba(16, 185, 129, 0.08)" },
};

export default function CrisisConsole() {
  const [data, setData] = useState<CrisisResult | null>(null);
  const [visible, setVisible] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [resolvedWall, setResolvedWall] = useState(0);

  async function run() {
    setRunning(true);
    setData(null);
    setVisible(0);
    setResolvedWall(0);
    const t0 = performance.now();
    const tick = setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    try {
      const res = await fetch("/api/crisis", { method: "POST" });
      const d = (await res.json()) as CrisisResult;
      setData(d);
      for (let i = 1; i <= d.steps.length; i++) {
        await new Promise((r) => setTimeout(r, i === 1 ? 250 : 550));
        setVisible(i);
      }
      setResolvedWall((performance.now() - t0) / 1000);
    } finally {
      clearInterval(tick);
      setRunning(false);
    }
  }

  const done = !!(data && visible >= data.steps.length);
  const lakh = (n: number) => `₹${(n / 100000).toFixed(1)}L`;

  return (
    <section className="panel overflow-hidden border-signal/20">
      <div className="border-b border-signal/20 bg-signal/[0.04] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[4px] bg-signal/15 text-signal border border-signal/30">
              <Siren size={20} className={running ? "animate-pulse" : ""} />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">Final Boss Protocol — Multi-Crisis Autonomous Resolution</h2>
              <p className="text-xs text-dim">Simultaneous dense fog + VVIP movement + Yamuna rail fracture + DFC heavy freight + RRTS peak</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(running || done) && (
              <div className={`flex flex-col items-end rounded-[4px] border px-3.5 py-1.5 ${done ? "border-mint/40 bg-mint/10" : "border-signal/40 bg-signal/10"}`}>
                {done ? (
                  <>
                    <span className="font-mono text-base font-bold text-mint">{(resolvedWall || 0).toFixed(1)}s</span>
                    <span className="text-[10px] font-semibold text-mint uppercase">Resolved (60s SLA)</span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-base font-bold text-signal animate-pulse">{Math.max(0, 60 - elapsed).toFixed(1)}s</span>
                    <span className="text-[10px] font-semibold text-signal uppercase">SLA Countdown</span>
                  </>
                )}
              </div>
            )}

            <button
              onClick={run}
              disabled={running}
              className="flex items-center gap-2 rounded-[4px] border border-signal bg-signal px-4 py-2.5 text-xs font-bold on-accent transition-colors hover:bg-signal/90 disabled:opacity-60"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : data ? <RefreshCcw size={14} /> : <Crosshair size={14} />}
              {running ? "Resolving Scenario…" : data ? "Re-run Scenario" : "Initiate Protocol"}
            </button>
          </div>
        </div>
      </div>

      {!data && !running && (
        <div className="gridlines p-10 text-center">
          <AlertOctagon size={32} className="mx-auto text-signal/80" />
          <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-dim">
            The worst-case scenario that defeats manual control: morning fog at 35m, VVIP special with 2 hours notice, ITMS critical rail fracture on Yamuna Bridge #2, 10,200T DFC freight approaching, and peak Namo Bharat RRTS. <strong className="text-ink">Click &quot;Initiate Protocol&quot; to watch the tactical planner solve it in under 60 seconds.</strong>
          </p>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-5">
          {/* Autonomous Step Timeline */}
          <div className="space-y-2.5 border-b border-edge bg-abyss/60 p-4 lg:col-span-3 lg:border-b-0 lg:border-r">
            {data.steps.slice(0, visible).map((s, i) => (
              <div
                key={i}
                className="anim-rise flex gap-3 rounded-[4px] border p-3"
                style={{ borderColor: `${TONE[s.tone].color}35`, backgroundColor: TONE[s.tone].bg }}
              >
                <div className="mt-0.5 flex shrink-0 items-center gap-1 font-mono text-[11px] font-bold" style={{ color: TONE[s.tone].color }}>
                  <CheckCircle2 size={13} />
                  <span>T+{String(s.tSec).padStart(2, "0")}s</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-[2px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider" style={{ backgroundColor: `${TONE[s.tone].color}25`, color: TONE[s.tone].color }}>
                      {s.tag}
                    </span>
                    <span className="text-xs font-bold text-ink">{s.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-dim leading-relaxed">{s.detail}</p>
                </div>
              </div>
            ))}

            {!done && (
              <div className="flex items-center gap-2 p-3 font-mono text-xs text-dim">
                <Loader2 size={13} className="animate-spin text-saffron" />
                Agents negotiating operational consensus...
              </div>
            )}
          </div>

          {/* Decision Outcome */}
          <div className="p-5 lg:col-span-2">
            {done ? (
              <div className="anim-rise space-y-3">
                <div className="rounded-[4px] border border-mint/30 bg-mint/10 p-4">
                  <p className="flex items-center gap-2 text-xs font-bold text-mint uppercase tracking-wide">
                    <ShieldCheck size={16} /> Crisis Resolved in {data.resolvedInSec}s — Zero Cancellations
                  </p>
                  <p className="mt-2 text-xs font-semibold text-ink leading-relaxed">{data.decision.action}</p>
                </div>

                <div className="rounded-[4px] border border-edge bg-panel p-4 text-xs space-y-2">
                  <div className="flex justify-between text-dim">
                    <span className="flex items-center gap-1.5"><Route size={12} /> Diversion Route</span>
                    <span className="font-semibold text-ink">{data.decision.rerouteVia}</span>
                  </div>
                  <div className="flex justify-between text-dim">
                    <span>Block Window</span>
                    <span className="font-mono font-bold text-ink">{data.decision.blockMin} min</span>
                  </div>
                  <div className="flex justify-between text-dim">
                    <span>DFC Freight Held</span>
                    <span className="font-mono text-saffron">{data.decision.freightHeld} @ TKD Yard</span>
                  </div>
                  <div className="flex justify-between text-dim">
                    <span>Manual Hold-All Cost</span>
                    <span className="font-mono text-signal">{lakh(data.decision.costHold)}</span>
                  </div>
                  <div className="flex justify-between text-dim">
                    <span>AI Dynamic Reroute Cost</span>
                    <span className="font-mono text-cyan">{lakh(data.decision.costReroute)}</span>
                  </div>
                  <div className="flex justify-between border-t border-edge pt-2 font-semibold">
                    <span className="text-dim">Net Economic Savings</span>
                    <span className="font-mono text-sm font-bold text-mint">{lakh(data.decision.savings)}</span>
                  </div>
                </div>

                <div className="rounded-[4px] border border-edge bg-panel p-4">
                  <p className="text-xs font-semibold text-dim">Machine Justification Audit:</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-dim">
                    {data.decision.justification.map((j, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-mint" />
                        <span>{j}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                <div className="anim-spin-slow h-12 w-12 rounded-full border-2 border-dashed border-saffron" />
                <p className="mt-3 text-xs text-dim">Tactical planner evaluating 6 candidate doctrines...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
