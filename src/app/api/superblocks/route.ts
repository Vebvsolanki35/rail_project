import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { superBlockCandidates } from "@/lib/engine/state";
import { analyzeSuperBlocks, splitBlockAnalysis, superBlockKpis, FEASIBILITY_WEIGHTS } from "@/lib/engine/superblock";
import { getLatestPlan } from "@/lib/engine/optimizer";

export const dynamic = "force-dynamic";

/**
 * GET /api/superblocks — queue opportunities, planned super blocks, split-block
 * findings and the feasibility maths behind every recommendation.
 */
export async function GET() {
  try {
    await ensureSeeded();
    const [candidates, plan] = await Promise.all([superBlockCandidates(), getLatestPlan()]);
    const opportunities = analyzeSuperBlocks(candidates);
    const planned = (plan?.blocks ?? []).filter((b) => b.isSuperBlock);
    return NextResponse.json({
      kpis: superBlockKpis({ candidates, plannedBlocks: plan?.blocks ?? [] }),
      opportunities,
      plannedSuperBlocks: planned.map((b) => ({
        ...b,
        // Independent vs coordinated downtime for the actual planned bundle.
        coordinatedMin: b.endMin - b.startMin,
      })),
      splitFindings: splitBlockAnalysis(plan?.blocks ?? []),
      weights: FEASIBILITY_WEIGHTS,
      model: {
        setupMin: 40,
        firstWaveSetupMin: 15,
        waveSpacingMin: 8,
        formula: "independent = Σ(duration + 40) · coordinated = packWaves + 15 + 8 × (waves − 1)",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
