"use client";

/**
 * Plan Quality Score — a single composite for the generated plan with every
 * sub-metric shown. Missing metrics are dropped and their weight redistributed,
 * so the score never invents data.
 */
import { Award } from "lucide-react";

export interface QualityItemDTO {
  key: string;
  label: string;
  pct: number;
  display: string;
  weight: number;
  note: string;
}

export default function PlanQualityCard({
  score,
  items,
  vsManual,
}: {
  score: number;
  items: QualityItemDTO[];
  vsManual?: { downtimePct: number | null; availabilityPts: number | null };
}) {
  const tone = score >= 80 ? "text-emerald-300" : score >= 60 ? "text-amber-300" : "text-orange-300";
  const ring = score >= 80 ? "#34d399" : score >= 60 ? "#f5a524" : "#fb923c";

  return (
    <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
        <Award size={14} className="text-amber-400" /> Plan Quality Score
      </h3>

      <div className="mt-3 flex items-center gap-4">
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${ring} ${score * 3.6}deg, rgba(148,163,184,0.15) 0deg)` }}
        >
          <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-panel">
            <span className={`font-mono text-xl font-bold ${tone}`}>{score}</span>
            <span className="text-[9px] text-faint">/ 100</span>
          </div>
        </div>
        <div className="space-y-1">
          {vsManual?.downtimePct != null && (
            <p className="text-[11px] text-dim">
              Downtime vs manual practice: <span className="font-semibold text-emerald-300">↓{vsManual.downtimePct}%</span>
            </p>
          )}
          {vsManual?.availabilityPts != null && (
            <p className="text-[11px] text-dim">
              Asset availability: <span className="font-semibold text-emerald-300">+{vsManual.availabilityPts} pts</span>
            </p>
          )}
          <p className="text-[10px] text-faint">Composite of the sub-metrics below (weights in brackets).</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {items.map((i) => (
          <div key={i.key}>
            <div className="flex items-center justify-between text-[10px] text-dim">
              <span>
                {i.label} <span className="text-faint">({Math.round(i.weight * 100)}%)</span>
              </span>
              <span className="font-mono text-ink">{i.display}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge/60">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, i.pct))}%`, background: ring }} />
            </div>
            <p className="mt-0.5 text-[9px] text-faint">{i.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
