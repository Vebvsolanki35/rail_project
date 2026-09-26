import { AlertTriangle, Boxes, CalendarClock, Gauge, HardHat, ShieldAlert, ShieldCheck, Siren, Undo2 } from "lucide-react";
import type { DashboardState } from "@/lib/engine/types";
import { RailKpiCard, type RailTone } from "./rail/RailKit";

/**
 * COMMAND CENTRE — OPERATIONAL KPI ROW
 *
 * Six operational counters in the order a shift officer reads them, then the
 * plan-performance group. Every card drills through to the desk that owns the
 * number, because a counter that opens nothing is decoration.
 *
 * Honesty rule: a KPI whose source is empty renders an em dash, never a zero —
 * "no plan generated yet" and "a plan with 0 blocks" are different facts.
 *
 * The numbers are computed by the engines and read from GET /api/state; this
 * component performs no arithmetic of its own beyond formatting.
 */
export default function KpiStrip({ state }: { state: DashboardState }) {
  const k = state.kpis;
  const hasPlan = !!state.latestPlan;
  const reduction = k.downtimeBaselineH > 0 ? Math.round((1 - k.downtimeOptimizedH / k.downtimeBaselineH) * 100) : 0;
  const crewsEngaged =
    Number(state.lifecycle.counts?.WORK_ASSIGNED ?? 0) +
    Number(state.lifecycle.counts?.WORK_STARTED ?? 0) +
    Number(state.lifecycle.counts?.WORK_IN_PROGRESS ?? 0);
  const emergency = state.urgency.emergency;

  const cards: {
    label: string;
    value: string;
    sub: string;
    tone: RailTone;
    icon: React.ReactNode;
    href: string;
    footer: string;
  }[] = [
    {
      label: "Critical defects",
      value: `${state.counts.criticalDefects}`,
      sub: `${state.counts.openDefects} open in the register · severity 8+`,
      tone: state.counts.criticalDefects > 0 ? "critical" : "success",
      icon: <ShieldAlert size={12} />,
      href: "/defects",
      footer: "Defect register",
    },
    {
      label: "Emergency / overdue",
      value: `${emergency} / ${state.urgency.overdue}`,
      sub: emergency > 0 ? `${emergency} emergency class in the priority queue` : `${state.lifecycle.overdue} past permitted deadline`,
      tone: emergency > 0 ? "critical" : state.urgency.overdue > 0 ? "warning" : "success",
      icon: <Siren size={12} />,
      href: "/defects",
      footer: "Priority queue",
    },
    {
      label: "Live block occupation",
      value: `${state.activeBlockSegments.length}`,
      sub: hasPlan ? `section(s) held now · ${state.latestPlan!.blocks.length} in the standing plan` : "Section(s) held now",
      tone: "info",
      icon: <AlertTriangle size={12} />,
      href: "/network",
      footer: "Situation overview",
    },
    {
      label: "Crews engaged",
      value: `${crewsEngaged}`,
      sub: `${state.lifecycle.awaitingValidation} awaiting officer validation`,
      tone: "info",
      icon: <HardHat size={12} />,
      href: "/field",
      footer: "Field operations",
    },
    {
      label: "Assets below health",
      value: `${state.counts.assetsBelowHealth}`,
      sub: state.availability ? `${state.availability.monitoredAssets} monitored · ${state.availability.optimizedPct.toFixed(1)}% availability` : "Monitored assets below the health threshold",
      tone: state.counts.assetsBelowHealth > 0 ? "warning" : "success",
      icon: <Gauge size={12} />,
      href: "/analytics",
      footer: "Availability analytics",
    },
    {
      label: "Block overrun risk",
      value: state.overrun ? `${state.overrun.probability.toFixed(0)}%` : "None",
      sub: state.overrun ? `Job #${state.overrun.jobId} on ${state.overrun.segCode} · ${state.overrun.remainingMin} min left` : "No working block is approaching its release time",
      tone: state.overrun ? "warning" : "success",
      icon: <Undo2 size={12} />,
      href: "/jobs",
      footer: state.overrun ? "Extend or release" : "Work orders",
    },
  ];

  const planCards: typeof cards = [
    {
      label: "Asset downtime",
      value: hasPlan ? `${k.downtimeOptimizedH.toFixed(1)}h` : "—",
      sub: hasPlan ? `against ${k.downtimeBaselineH.toFixed(1)}h under the manual single-department baseline` : "Run the planner to compute",
      tone: hasPlan ? "warning" : "neutral",
      icon: <CalendarClock size={12} />,
      href: "/planner",
      footer: "Planner",
    },
    {
      label: "Downtime avoided",
      value: hasPlan ? `${reduction}%` : "—",
      sub: "Recovered by bundling departments into one possession",
      tone: hasPlan ? "success" : "neutral",
      icon: <ShieldCheck size={12} />,
      href: "/compare",
      footer: "Baseline comparison",
    },
    {
      label: "Super-block overlap",
      value: hasPlan ? `${k.bundlingPct}%` : "—",
      sub: "Shared minutes across ENG · TRD · SNT",
      tone: "advisory",
      icon: <Boxes size={12} />,
      href: "/superblocks",
      footer: "Super blocks",
    },
    {
      label: "Avg train delay",
      value: hasPlan ? `${k.avgDelayMin.toFixed(1)}m` : "—",
      sub: "Modelled against the working timetable · target under 8 min",
      tone: hasPlan ? (k.avgDelayMin <= 8 ? "success" : "warning") : "neutral",
      icon: <Gauge size={12} />,
      href: "/conflicts",
      footer: "Conflict centre",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <RailKpiCard key={c.label} {...c} />
        ))}
      </div>

      {/* Plan performance — the optimization result, kept visually separate from
          the live operational counters above. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {planCards.map((c) => (
          <RailKpiCard key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}
