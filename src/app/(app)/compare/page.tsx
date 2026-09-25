import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import PlanCompare from "@/components/PlanCompare";
import PlanQualityCard from "@/components/PlanQualityCard";
import { alternativeDefectInput, getDashboardState } from "@/lib/engine/state";
import { WEIGHT_PROFILES, compareAlternatives, generateAlternatives, normalizeWeights } from "@/lib/engine/alternatives";

export const dynamic = "force-dynamic";

/**
 * STRATEGY COMPARISON — the same defect queue, three defensible answers.
 *
 * The planner publishes one plan; this desk lets the DRM/CONTROL argue about it
 * with data: what a safety-first strategy would cost in downtime, what a
 * traffic-first strategy would defer, and what changes when you set your own
 * weights. Everything here is computed by src/lib/engine/alternatives.ts over
 * the live queue — no numbers are hand-written.
 */
export default async function ComparePage() {
  const [state, altInput] = await Promise.all([getDashboardState(), alternativeDefectInput()]);
  const plans = generateAlternatives(altInput, 7);
  const comparison = compareAlternatives(plans);
  // `comparison.best` is a plan key; the balanced profile is the reference the
  // other strategies are scored against (see engine/alternatives.ts).
  const best = plans.find((p) => p.key === comparison.best);
  const reference = plans.find((p) => p.key === "balanced") ?? plans[0];

  return (
    <RoleGate title="Strategy Comparison">
      <div className="space-y-3">
        <PageHeader
          module="AIP-CMP"
          title="Strategy Comparison"
          titleKey="page.compare"
          subtitleKey="page.compare.sub"
          subtitle={`${altInput.length} queued tasks, three strategies, one trade-off surface. Each strategy re-ranks the same defects with different weights and re-packs the blocks — the comparison is computed, not authored.`}
          crumbs={[{ label: "AI Planning" }, { label: "Strategy Comparison" }]}
          state={state.latestPlan ? `Plan #${state.latestPlan.id} published · ${state.latestPlan.blocks.length} occupancies` : "No plan published"}
          stateTone={state.latestPlan ? "success" : "warning"}
          reference={`${altInput.length} queued maintenance tasks`}
        />

        {reference && best && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure
              label="Recommended strategy"
              value={best.name}
              hint={`quality score ${best.score}/100 over the live queue`}
              tone="good"
            />
            <Figure
              label="Reference plan"
              value={reference.name}
              hint={`${reference.kpis.defectsCleared} tasks · ${reference.kpis.downtimeOptimizedH} h downtime · ${reference.kpis.avgDelayMin} min average delay`}
            />
            <Figure
              label="Safety headroom"
              value={`day ${reference.kpis.criticalClearanceDays || 1}`}
              hint="days until every severity ≥ 8 defect is cleared under the reference strategy"
            />
          </div>
        )}

        <PlanCompare
          initialPlans={plans}
          initialComparison={comparison}
          profileList={WEIGHT_PROFILES.map((p) => ({ key: p.key, name: p.name, blurb: p.blurb, weights: normalizeWeights(p.weights) }))}
        />

        {state.planQuality && (
          <section className="space-y-3">
            <header>
              <h2 className="text-sm font-bold text-ink">Published plan quality</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-dim">
                The plan currently on the Gantt chart, scored on the same yardsticks as the alternatives above.
              </p>
            </header>
            <PlanQualityCard
              score={state.planQuality.score}
              items={state.planQuality.items}
              vsManual={state.planQuality.vsManual ?? undefined}
            />
          </section>
        )}
      </div>
    </RoleGate>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "good" }) {
  return (
    <div className="rounded-[4px] border border-edge bg-panel/60 p-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</span>
      <p className={`mt-1 text-sm font-bold ${tone === "good" ? "text-mint" : "text-ink"}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-dim">{hint}</p>
    </div>
  );
}
