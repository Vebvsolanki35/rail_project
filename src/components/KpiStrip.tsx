import type { ReactNode } from "react";
import { AlarmClock, ArrowDownRight, Boxes, ClipboardCheck, Clock, Gauge, ShieldCheck, Timer, Zap } from "lucide-react";
import type { DashboardState } from "@/lib/engine/types";

function Card({
  label,
  value,
  sub,
  icon,
  tone,
  spark,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tone: string;
  spark?: number[];
}) {
  return (
    <div className="panel flex flex-col justify-between p-4 transition hover:border-edge/90">
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">{label}</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-hull border border-edge/60" style={{ color: tone }}>
            {icon}
          </span>
        </div>
        <div className="tabular mt-2.5 text-2xl font-bold tracking-tight text-ink font-mono" style={{ color: tone }}>
          {value}
        </div>
      </div>

      {spark && spark.length > 0 ? (
        <div className="mt-3">
          <div className="flex h-5 items-end gap-1">
            {spark.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all duration-300"
                style={{
                  height: `${Math.max(12, (h / Math.max(...spark, 1)) * 100)}%`,
                  backgroundColor: tone,
                  opacity: 0.3 + (i / spark.length) * 0.5,
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 text-[11px] text-faint leading-snug truncate">{sub}</div>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-faint leading-snug">{sub}</div>
      )}
    </div>
  );
}

export default function KpiStrip({ state }: { state: DashboardState }) {
  const k = state.kpis;
  const hasPlan = !!state.latestPlan;
  const reduction = k.downtimeBaselineH > 0 ? Math.round((1 - k.downtimeOptimizedH / k.downtimeBaselineH) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <Card
        label="Asset Downtime"
        value={hasPlan ? `${k.downtimeOptimizedH.toFixed(1)}h` : "—"}
        sub={hasPlan ? `vs ${k.downtimeBaselineH.toFixed(1)}h manual baseline` : "Run optimizer to calculate"}
        icon={<Timer size={14} />}
        tone="#f59e0b"
      />
      <Card
        label="Downtime Reduction"
        value={hasPlan ? `${reduction}%` : "—"}
        sub="Single-corridor bundled occupancy"
        icon={<ArrowDownRight size={14} />}
        tone="#10b981"
      />
      <Card
        label="Super-Block Overlap"
        value={hasPlan ? `${k.bundlingPct}%` : "—"}
        sub="Multi-department shared minutes"
        icon={<Boxes size={14} />}
        tone="#8b5cf6"
      />
      <Card
        label="Avg Train Delay"
        value={hasPlan ? `${k.avgDelayMin.toFixed(1)}m` : "—"}
        sub="Target < 8 min · baseline 28+ min"
        icon={<Gauge size={14} />}
        tone="#0ea5e9"
      />
      <Card
        label="Resilience Index"
        value={hasPlan ? `${k.resilienceScore}/100` : "—"}
        sub="500 Monte Carlo stress runs"
        icon={<ShieldCheck size={14} />}
        tone="#10b981"
        spark={state.latestPlan ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => state.latestPlan!.kpis[`h${i}`] ?? 0) : undefined}
      />
      <Card
        label="Open Defects"
        value={`${state.counts.openDefects}`}
        sub={`${state.counts.criticalDefects} critical · ${state.counts.assetsBelowHealth} degraded`}
        icon={<Zap size={14} />}
        tone={state.counts.criticalDefects > 4 ? "#f43f5e" : "#f59e0b"}
      />
      {/* PS #26027 headline objective: availability maximised, downtime minimised */}
      <Card
        label="Asset Availability"
        value={state.availability ? `${state.availability.optimizedPct.toFixed(1)}%` : "—"}
        sub={
          state.availability
            ? `vs ${state.availability.baselinePct.toFixed(1)}% manual (+${state.availability.gainPts} pts)`
            : "Run optimizer to calculate"
        }
        icon={<Clock size={14} />}
        tone="#22c55e"
      />
      <Card
        label="Urgency Load"
        value={`${state.urgency.emergency > 0 ? `${state.urgency.emergency}🔥` : state.urgency.overdue}`}
        sub={
          state.urgency.emergency > 0
            ? `${state.urgency.emergency} emergency · ${state.urgency.overdue} overdue`
            : `${state.urgency.overdue} overdue · avg index ${state.urgency.avgUrgency}`
        }
        icon={<AlarmClock size={14} />}
        tone={state.urgency.emergency > 0 ? "#ef4444" : "#f59e0b"}
      />
      <Card
        label="Lifecycle Open"
        value={`${state.lifecycle.open}`}
        sub={`${state.lifecycle.awaitingValidation} awaiting validation · ${state.lifecycle.chronic} chronic`}
        icon={<ClipboardCheck size={14} />}
        tone="#38bdf8"
      />
    </div>
  );
}
