"use client";

/**
 * Alternative plan comparison.
 *
 * Three planning strategies over the SAME live defects (plus a custom weight
 * profile), scored on identical KPI formulas so they compare like with like.
 * The point is to make the safety ↔ traffic trade-off visible instead of hiding
 * it inside a single "optimal" answer.
 */
import { useState } from "react";
import { BarChart3, Layers, Sliders, Trophy } from "lucide-react";
import BlockExplain from "./BlockExplain";
import type { AlternativeBlock, AlternativeComparison, AlternativePlan } from "@/lib/engine/alternatives";
import type { BlockItemDTO } from "@/lib/engine/types";

/** Reuse the engine's own plan/comparison types so UI and API cannot drift. */
type AltBlock = AlternativeBlock;
type AltPlan = AlternativePlan;
type Comparison = AlternativeComparison;

function toBlockDTO(b: AltBlock, index: number): BlockItemDTO {
  return {
    id: index,
    segmentId: b.segmentId,
    segmentCode: b.segmentCode,
    corridor: b.corridor,
    day: b.day,
    startMin: b.startMin,
    endMin: b.endMin,
    departments: b.departments,
    defectIds: b.defectIds,
    defectCount: b.defectIds.length,
    isSuperBlock: b.isSuperBlock,
    mode: "physical",
    window: b.window,
    delayCostMin: b.delayCostMin,
    rationale: b.rationale,
    status: "proposed",
  };
}

export default function PlanCompare({
  initialPlans,
  initialComparison,
  profileList,
}: {
  initialPlans: AltPlan[];
  initialComparison: Comparison;
  profileList: { key: string; name: string; blurb: string; weights: Record<string, number> }[];
}) {
  const [plans, setPlans] = useState<AltPlan[]>(initialPlans);
  const [comparison, setComparison] = useState<Comparison>(initialComparison);
  const [selected, setSelected] = useState<string>(initialComparison.best);
  const [weights, setWeights] = useState({ criticality: 35, urgency: 30, risk: 20, availability: 15 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = plans.find((p) => p.key === selected) ?? plans[0];

  async function regenerate(custom?: typeof weights) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/alternatives", {
        method: custom ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        body: custom
          ? JSON.stringify({
              weights: {
                criticality: custom.criticality / 100,
                urgency: custom.urgency / 100,
                risk: custom.risk / 100,
                availability: custom.availability / 100,
              },
            })
          : undefined,
      });
      const json = (await res.json()) as { plans?: AltPlan[]; comparison?: Comparison; error?: string };
      if (!res.ok || !json.plans || !json.comparison) {
        setError(json.error ?? "Could not generate alternatives");
        return;
      }
      setPlans(json.plans);
      setComparison(json.comparison);
      setSelected(custom ? "custom" : json.comparison.best);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const total = weights.criticality + weights.urgency + weights.risk + weights.availability;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
            <BarChart3 size={14} className="text-amber-400" /> Strategy comparison
          </h3>
          <span className="text-[10px] text-faint">{comparison.note}</span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-faint">
              <tr>
                <th className="px-2 py-1.5">Strategy</th>
                <th className="px-2 py-1.5">Weights (crit/urg/risk/avail)</th>
                <th className="px-2 py-1.5 text-right">Quality</th>
                <th className="px-2 py-1.5 text-right">Downtime</th>
                <th className="px-2 py-1.5 text-right">Blocks</th>
                <th className="px-2 py-1.5 text-right">Super</th>
                <th className="px-2 py-1.5 text-right">Coverage</th>
                <th className="px-2 py-1.5 text-right">Avg delay</th>
                <th className="px-2 py-1.5 text-right">High-risk covered</th>
                <th className="px-2 py-1.5 text-right">Deferred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/50">
              {plans.map((p) => {
                const best = comparison.best === p.key;
                return (
                  <tr
                    key={p.key}
                    onClick={() => setSelected(p.key)}
                    className={`cursor-pointer ${selected === p.key ? "bg-amber-500/10" : "hover:bg-hull/40"}`}
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        {best && <Trophy size={12} className="text-amber-400" />}
                        <span className="font-semibold text-ink">{p.name}</span>
                      </div>
                      <p className="max-w-[260px] text-[10px] leading-relaxed text-faint">{p.tradeoff}</p>
                    </td>
                    <td className="px-2 py-2 font-mono text-[10px] text-dim">
                      {Math.round(p.weights.criticality * 100)}/{Math.round(p.weights.urgency * 100)}/
                      {Math.round(p.weights.risk * 100)}/{Math.round(p.weights.availability * 100)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-ink">{p.score}</td>
                    <td className="px-2 py-2 text-right font-mono text-dim">{p.kpis.downtimeOptimizedH} h</td>
                    <td className="px-2 py-2 text-right font-mono text-dim">{p.kpis.blocks}</td>
                    <td className="px-2 py-2 text-right font-mono text-emerald-300">{p.kpis.superBlocks}</td>
                    <td className="px-2 py-2 text-right font-mono text-dim">{p.kpis.coveragePct}%</td>
                    <td className="px-2 py-2 text-right font-mono text-dim">{p.kpis.avgDelayMin}m</td>
                    <td className="px-2 py-2 text-right font-mono text-dim">{p.kpis.highRiskCoveredPct}%</td>
                    <td className="px-2 py-2 text-right font-mono text-faint">{p.kpis.unplaced}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-1">
          {comparison.ranked.map((r, i) => (
            <p key={r.key} className="text-[10px] text-dim">
              <span className="font-mono text-faint">#{i + 1}</span>{" "}
              <span className="font-semibold text-ink">{r.name}</span> — {r.verdict}
            </p>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
            <Layers size={13} className="text-amber-400" /> {active?.name} — {active?.blocks.length} blocks
          </h3>
          {active?.blocks.slice(0, 12).map((b, i) => (
            <BlockExplain key={`${active.key}-${i}`} block={toBlockDTO(b, i)} />
          ))}
          {active && active.blocks.length === 0 && <p className="text-[11px] text-faint">No blocks generated for this profile.</p>}
        </div>

        <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
            <Sliders size={13} className="text-amber-400" /> Custom weights
          </h3>
          <p className="mt-1 text-[10px] leading-relaxed text-faint">
            Move the sliders to express your own trade-off; Rail Rakshak generates a fourth plan with exactly those
            weights and adds it to the comparison.
          </p>
          <div className="mt-3 space-y-3">
            {(["criticality", "urgency", "risk", "availability"] as const).map((key) => (
              <label key={key} className="block text-[10px] text-dim">
                <span className="flex items-center justify-between">
                  <span className="capitalize">{key === "risk" ? "ML failure risk" : key}</span>
                  <span className="font-mono text-ink">{weights[key]}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={weights[key]}
                  onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })}
                  className="mt-1 w-full accent-amber-500"
                />
              </label>
            ))}
          </div>
          <p className={`mt-2 text-[10px] ${total === 100 ? "text-emerald-300" : "text-amber-300"}`}>
            Total {total}% {total === 100 ? "— normalised exactly" : "— will be normalised to 100%"}
          </p>
          <button
            onClick={() => regenerate(weights)}
            disabled={busy}
            className="mt-3 w-full rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate custom plan"}
          </button>
          <button
            onClick={() => regenerate()}
            disabled={busy}
            className="mt-2 w-full rounded-lg border border-edge px-3 py-2 text-[11px] font-semibold text-dim transition hover:text-ink disabled:opacity-50"
          >
            Reset to profiles
          </button>
          {error && <p className="mt-2 text-[10px] text-red-300">{error}</p>}
          <div className="mt-3 space-y-1">
            {profileList.map((p) => (
              <p key={p.key} className="text-[10px] leading-relaxed text-faint">
                <span className="font-semibold text-dim">{p.name}:</span> {p.blurb}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
