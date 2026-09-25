import RoleGate from "@/components/RoleGate";
import SuperBlockKpi from "@/components/SuperBlockKpi";
import SuperBlockPanel from "@/components/SuperBlockPanel";
import { superBlockCandidates } from "@/lib/engine/state";
import { analyzeSuperBlocks, splitBlockAnalysis, superBlockKpis } from "@/lib/engine/superblock";
import { getLatestPlan } from "@/lib/engine/optimizer";

export const dynamic = "force-dynamic";

/** Super-block intelligence — queue opportunities, planned bundles, split waste. */
export default async function SuperBlocksPage() {
  const [candidates, plan] = await Promise.all([superBlockCandidates(), getLatestPlan()]);
  const opportunities = analyzeSuperBlocks(candidates);
  const kpis = superBlockKpis({ candidates, plannedBlocks: plan?.blocks ?? [] });
  const plannedSuperBlocks = (plan?.blocks ?? []).filter((b) => b.isSuperBlock);
  const splitFindings = splitBlockAnalysis(plan?.blocks ?? []);

  return (
    <RoleGate title="Super Block Intelligence">
      <div className="space-y-4">
        <header>
          <h1 className="text-lg font-bold text-ink">Super Block Intelligence</h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-dim">
            One corridor occupancy for every department instead of three separate blocks. Rail Rakshak compares the
            manual practice (each task in its own block, {40} min setup each) with a coordinated super block, scores
            feasibility on five weighted factors, and states a reason whenever it declines to bundle.
          </p>
        </header>

        <SuperBlockKpi kpi={kpis} />

        <SuperBlockPanel
          opportunities={opportunities}
          plannedSuperBlocks={plannedSuperBlocks}
          splitFindings={splitFindings}
          model={{
            setupMin: 40,
            firstWaveSetupMin: 15,
            waveSpacingMin: 8,
            formula: "independent downtime = Σ(task duration + 40 min) · coordinated downtime = packed waves + 15 min + 8 min × (waves − 1)",
          }}
        />
      </div>
    </RoleGate>
  );
}
