import { getDashboardState, alternativeDefectInput, superBlockCandidates } from "@/lib/engine/state";
import { getLatestPlan } from "@/lib/engine/optimizer";
import { analyzeSuperBlocks, splitBlockAnalysis } from "@/lib/engine/superblock";
import { WEIGHT_PROFILES, compareAlternatives, generateAlternatives, normalizeWeights } from "@/lib/engine/alternatives";
import PlannerClient from "@/components/PlannerClient";
import PlanQualityCard from "@/components/PlanQualityCard";
import PlanCompare from "@/components/PlanCompare";
import SuperBlockPanel from "@/components/SuperBlockPanel";
import ExplainPanel from "@/components/ExplainPanel";
import HorizonBriefing from "@/components/HorizonBriefing";
import ChangeWatch from "@/components/ChangeWatch";
import { explainPlan, weatherDesk } from "@/lib/engine/explain";
import { horizonBriefing } from "@/lib/engine/horizons";
import { CHANGE_KINDS, CHANGE_META, scanNetwork } from "@/lib/engine/changeimpact";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const [state, plan, candidates, explanations, weather, briefings, changes] = await Promise.all([
    getDashboardState(),
    getLatestPlan(),
    superBlockCandidates(),
    explainPlan(6),
    weatherDesk(),
    Promise.all([horizonBriefing("WEEKLY"), horizonBriefing("MONTHLY")]),
    scanNetwork(),
  ]);

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
        <header className="border-l-2 border-saffron pl-2.5">
          <h2 className="text-[13px] font-bold text-ink">Plan quality &amp; alternatives</h2>
          <p className="mt-0.5 max-w-3xl text-[11.5px] leading-relaxed text-dim">
            A single plan is never the only defensible answer. Compare the balanced, safety-first and traffic-first
            strategies over the same defects, or set your own weights — then inspect the quality score of the plan that
            is actually published.
          </p>
        </header>
        <div className="grid gap-3 xl:grid-cols-[340px_1fr]">
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
            <p className="rounded-[4px] border border-edge/70 bg-panel/50 p-4 text-[11px] text-dim">
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

      {/* Phase 8 — the weekly and monthly plans, side by side with what limits them */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-bold text-ink">Multi-horizon plan briefing</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-dim">
            The weekly and monthly plans over the same register: what is planned, what is still backlog, which windows and crews are free, how much availability the
            plan defends, the residual risk, the conflicts the plan still carries and the freight traffic it expects to work around.
          </p>
        </header>
        <HorizonBriefing briefings={briefings} weather={weather} />
      </section>

      {/* Phase 5 + 12 — why each recommendation was made, and the weather that shaped it */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-bold text-ink">AI explainability — recommended because…</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-dim">
            Every recommendation carries the factor table behind it: modelled failure risk, severity, overdue age, asset health, section criticality, traffic
            exposure, freight impact, weather restrictions and department compatibility. The engine advises; the officer decides.
          </p>
        </header>
        <ExplainPanel explanations={explanations} weather={weather} />
      </section>

      {/* Phase 9 — the network is watched for anything that invalidates the plan */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-bold text-ink">Network change watch</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-dim">
            Train delay, a new critical defect, a block overrun, a crew withdrawn, a freight surge or a corridor closure — the four change kinds the engine
            watches. Detection is a live re-read of the register; publishing the new plan version runs the existing re-planner and shows OLD / NEW / DIFF.
          </p>
        </header>
        <ChangeWatch
          initial={changes}
          kindMeta={Object.fromEntries(CHANGE_KINDS.map((k) => [k, { label: CHANGE_META[k].label, blurb: CHANGE_META[k].blurb, paramLabel: CHANGE_META[k].paramLabel, defaultParam: CHANGE_META[k].defaultParam }])) as Record<import("@/lib/engine/changeimpact").ChangeKind, { label: string; blurb: string; paramLabel: string; defaultParam: number }>}
        />
      </section>
    </div>
  );
}
