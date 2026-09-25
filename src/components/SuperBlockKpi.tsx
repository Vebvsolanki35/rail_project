"use client";

/** Super-block headline KPIs — the efficiency claim, quantified. */
import { Boxes, Layers, Scissors, TrendingDown } from "lucide-react";

export interface SuperBlockKpiDTO {
  opportunities: number;
  recommended: number;
  conditional: number;
  rejected: number;
  potentialSavingMin: number;
  potentialSavingH: number;
  plannedSuperBlocks: number;
  plannedCoordinationMin: number;
  splitFindings: number;
  goldenUtilisationPct: number;
  topOpportunity: { segmentCode: string; savingMin: number } | null;
}

export default function SuperBlockKpi({ kpi }: { kpi: SuperBlockKpiDTO }) {
  const cards = [
    {
      icon: <Layers size={14} className="text-saffron" />,
      label: "Coordinated opportunities",
      value: `${kpi.recommended}/${kpi.opportunities}`,
      sub: `${kpi.conditional} conditional · ${kpi.rejected} rejected (reasons shown)`,
    },
    {
      icon: <TrendingDown size={14} className="text-mint" />,
      label: "Recoverable downtime",
      value: `${kpi.potentialSavingH} h`,
      sub: kpi.topOpportunity ? `largest: ${kpi.topOpportunity.segmentCode} (${kpi.topOpportunity.savingMin} min)` : "no bundles above threshold",
    },
    {
      icon: <Boxes size={14} className="text-cyan" />,
      label: "Super blocks planned",
      value: `${kpi.plannedSuperBlocks}`,
      sub: `${Math.round((kpi.plannedCoordinationMin / 60) * 10) / 10} h of coordinated occupancy`,
    },
    {
      icon: <Scissors size={14} className="text-violet" />,
      label: "Split-block waste found",
      value: `${kpi.splitFindings}`,
      sub: `GOLDEN window utilisation ${kpi.goldenUtilisationPct}%`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-[4px] border border-edge/70 bg-panel/50 p-4">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
            {c.icon} {c.label}
          </p>
          <p className="mt-1 font-mono text-2xl text-ink">{c.value}</p>
          <p className="text-[10px] leading-relaxed text-faint">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
