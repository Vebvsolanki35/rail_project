import { getDashboardState, alternativeDefectInput, superBlockCandidates } from "@/lib/engine/state";
import { getLatestPlan } from "@/lib/engine/optimizer";
import { analyzeSuperBlocks, splitBlockAnalysis } from "@/lib/engine/superblock";
import { WEIGHT_PROFILES, compareAlternatives, generateAlternatives, normalizeWeights } from "@/lib/engine/alternatives";
import PlannerClient from "@/components/PlannerClient";
import PlanQualityCard from "@/components/PlanQualityCard";
import PlanCompare from "@/components/PlanCompare";
import SuperBlockPanel from "@/components/SuperBlockPanel";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const [state, plan, candidates] = await Promise.all([getDashboardState(), getLatestPlan(), superBlockCandidates()]);

  // Alternative strategies over the same live defect set (pure engine, no DB).
  const altInput = await alternativeDefectInput();
  const altPlans = generateAlternatives(altInput, 7);
  const altComparison = compareAlternatives(altPlans);

  const opportunities = analyzeSuperBlocks(candidates);
  const splitFindings = splitBlockAnalysis(plan?.blocks ?? []);

  return (
    <div className="space-y-6">
      <PlannerClient initial={state} />

      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-bold text-ink">Plan quality &amp; alternatives</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-dim">
            A single plan is never the only defensible answer. Compare the balanced, safety-first and traffic-first
            strategies over the same defects, or set your own weights — then inspect the quality score of the plan that
            is actually published.
          </p>
        </header>
        <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
          {state.planQuality ? (
            <PlanQualityCard
              score={state.planQuality.score}
              items={state.planQuality.items}
              vsManual={{
                downtimePct: plan?.kpis.reductionPct != null ? Math.round(plan.kpis.reductionPct) : null,
                availabilityPts: plan?.kpis.availabilityGainPts != null ? Math.round(plan.kpis.availabilityGainPts) : null,
              }}
            />
          ) : (
            <p className="rounded-xl border border-edge/70 bg-panel/50 p-4 text-[11px] text-dim">
              No plan published yet — run the optimizer to score plan quality.
            </p>
          )}
          <PlanCompare
            initialPlans={altPlans}
            initialComparison={altComparison}
            profileList={WEIGHT_PROFILES.map((p) => ({ key: p.key, name: p.name, blurb: p.blurb, weights: normalizeWeights(p.weights) }))}
          />
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-bold text-ink">Super-block opportunities</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-dim">
            The same bundling logic the optimizer applies, surfaced before the plan is generated: which queued tasks can
            share one corridor occupancy, how much downtime that recovers, and why Rail Rakshak declines when it does.
          </p>
        </header>
        <SuperBlockPanel
          opportunities={opportunities}
          plannedSuperBlocks={(plan?.blocks ?? []).filter((b) => b.isSuperBlock)}
          splitFindings={splitFindings}
          model={{
            setupMin: 40,
            firstWaveSetupMin: 15,
            waveSpacingMin: 8,
            formula: "independent downtime = Σ(task duration + 40 min) · coordinated downtime = packed waves + 15 min + 8 min × (waves − 1)",
          }}
        />
      </section>
    </div>
  );
}
