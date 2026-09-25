"use client";

/**
 * Urgency KPI card: class distribution, overdue/emergency counts and the top
 * item. The weighting formula is printed on the card so the prioritisation is
 * auditable rather than a black box.
 */
import { AlarmClock, Flame, Gauge, ShieldAlert } from "lucide-react";
import { URGENCY_META } from "@/lib/engine/urgency";
import { UrgencyChip } from "./DefectBadges";
import type { UrgencySummary as Summary } from "@/lib/engine/urgency";

const ORDER = ["EMERGENCY", "CRITICALLY_OVERDUE", "OVERDUE", "DUE_SOON", "UPCOMING", "NORMAL"] as const;

export default function UrgencySummary({ summary, compact }: { summary: Summary; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
          <Gauge size={14} className="text-amber-400" /> Urgency Engine
        </h3>
        <span className="text-[10px] text-faint">avg index {summary.avgUrgency}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2">
          <div className="flex items-center gap-1 text-[10px] text-faint">
            <Flame size={11} className="text-red-400" /> Emergency
          </div>
          <p className="mt-0.5 font-mono text-lg text-red-300">{summary.emergencyCount}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
          <div className="flex items-center gap-1 text-[10px] text-faint">
            <AlarmClock size={11} className="text-amber-400" /> Overdue
          </div>
          <p className="mt-0.5 font-mono text-lg text-amber-300">{summary.overdueCount}</p>
        </div>
        <div className="rounded-lg border border-edge/70 bg-hull/40 p-2">
          <div className="flex items-center gap-1 text-[10px] text-faint">
            <ShieldAlert size={11} className="text-dim" /> Tracked
          </div>
          <p className="mt-0.5 font-mono text-lg text-ink">{summary.total}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ORDER.filter((c) => (summary.counts[c] ?? 0) > 0).map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <UrgencyChip cls={c} score={undefined} />
            <span className="font-mono text-[10px] text-faint">×{summary.counts[c]}</span>
          </span>
        ))}
      </div>

      {summary.top && (
        <div className="mt-3 rounded-lg border border-edge/70 bg-hull/40 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-faint">Highest priority now</p>
          <p className="mt-1 text-[11px] font-semibold text-ink">
            <span className="font-mono text-amber-400">{summary.top.defectCode}</span> · {summary.top.title}
          </p>
          <p className="text-[10px] text-dim">
            {summary.top.segmentCode} · sort key {summary.top.sortKey.toFixed(1)} (criticality × ×{summary.top.boost.toFixed(2)} urgency boost)
          </p>
        </div>
      )}

      {!compact && (
        <p className="mt-3 text-[10px] leading-relaxed text-faint">
          {URGENCY_META.EMERGENCY.hint} Final priority = 35% criticality · 30% urgency · 20% ML failure risk · 15% asset availability.
        </p>
      )}
    </div>
  );
}
