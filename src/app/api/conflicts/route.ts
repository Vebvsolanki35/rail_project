import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { applyAlternative, conflictSummary, detectPlanConflicts } from "@/lib/engine/conflicts";

export const dynamic = "force-dynamic";

/** GET /api/conflicts?planId=3 — conflicts on a plan with computed alternatives. */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const planId = new URL(req.url).searchParams.get("planId");
    const rows = await detectPlanConflicts(planId ? Number(planId) : undefined);
    return NextResponse.json({
      summary: conflictSummary(rows),
      conflicts: rows,
      note: "Alternatives are re-scored with the same delay model the optimizer minimises. The HUMAN chooses the final option.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/conflicts { blockItemId, option, actorName, actorRole, reason? } — apply a chosen option. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await applyAlternative({
      blockItemId: Number(body.blockItemId),
      option: String(body.option),
      actorName: String(body.actorName ?? "Section Controller"),
      actorRole: String(body.actorRole ?? "CONTROL"),
      reason: body.reason ? String(body.reason) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
