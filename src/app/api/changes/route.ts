import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { CHANGE_KINDS, CHANGE_META, detectChange, scanNetwork, type ChangeKind } from "@/lib/engine/changeimpact";
import { replan } from "@/lib/engine/replan";

export const dynamic = "force-dynamic";

/**
 * GET /api/changes              — scan every change class against the live plan
 * GET /api/changes?kind=TRAIN_DELAY&segmentId=4 — quantify one change
 */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const segmentId = url.searchParams.get("segmentId");
    if (kind && CHANGE_KINDS.includes(kind as ChangeKind)) {
      const impact = await detectChange(kind as ChangeKind, {
        segmentId: segmentId ? Number(segmentId) : undefined,
        amountMin: url.searchParams.get("amountMin") ? Number(url.searchParams.get("amountMin")) : undefined,
        defectId: url.searchParams.get("defectId") ? Number(url.searchParams.get("defectId")) : undefined,
      });
      return NextResponse.json({ kinds: CHANGE_META, impact });
    }
    return NextResponse.json({ kinds: CHANGE_META, detected: await scanNetwork(segmentId ? Number(segmentId) : undefined) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/**
 * POST /api/changes  { kind, segmentId?, amountMin?, defectId?, note?, actorName?, actorRole?, apply? }
 * Detects the change; when `apply` is true it publishes a new plan version
 * through the existing re-plan engine and returns the old/new diff.
 */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = String(body.kind) as ChangeKind;
    if (!CHANGE_KINDS.includes(kind)) return NextResponse.json({ error: `kind must be one of ${CHANGE_KINDS.join(", ")}` }, { status: 400 });
    const impact = await detectChange(kind, {
      segmentId: body.segmentId ? Number(body.segmentId) : undefined,
      amountMin: body.amountMin ? Number(body.amountMin) : undefined,
      defectId: body.defectId ? Number(body.defectId) : undefined,
      note: body.note ? String(body.note) : undefined,
    });
    if (!body.apply) return NextResponse.json({ impact, applied: false });
    if (!impact.detected) return NextResponse.json({ impact, applied: false, error: "change has no plan impact — nothing to re-plan" }, { status: 409 });
    const result = await replan({
      kind: impact.replanKind,
      segmentId: impact.section.id ?? undefined,
      defectId: body.defectId ? Number(body.defectId) : undefined,
      amountMin: body.amountMin ? Number(body.amountMin) : undefined,
      note: `${CHANGE_META[kind].label}: ${impact.evidence.join("; ")}`,
      actor: { name: String(body.actorName ?? "Control Office"), role: String(body.actorRole ?? "CONTROL") },
    });
    return NextResponse.json({ impact, applied: true, plan: result.plan, diff: result.diff, supersedes: result.supersedes, frozenCount: result.frozenCount, log: result.log });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
