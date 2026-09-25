import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { alternativeDefectInput } from "@/lib/engine/state";
import { WEIGHT_PROFILES, compareAlternatives, generateAlternatives, normalizeWeights } from "@/lib/engine/alternatives";

export const dynamic = "force-dynamic";

/**
 * GET /api/alternatives — three planning strategies over the same live defects.
 * POST /api/alternatives { weights: {criticality, urgency, risk, availability} }
 *   → the same three plus a Custom profile with the operator's weights.
 */
async function build(custom?: Partial<{ criticality: number; urgency: number; risk: number; availability: number }>) {
  const defects = await alternativeDefectInput();
  const plans = generateAlternatives(defects, 7, custom);
  return {
    defectCount: defects.length,
    profiles: WEIGHT_PROFILES.map((p) => ({ key: p.key, name: p.name, blurb: p.blurb, weights: normalizeWeights(p.weights) })),
    plans,
    comparison: compareAlternatives(plans),
  };
}

export async function GET() {
  try {
    await ensureSeeded();
    return NextResponse.json(await build());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as {
      weights?: Partial<{ criticality: number; urgency: number; risk: number; availability: number }>;
    };
    return NextResponse.json(await build(body.weights));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
