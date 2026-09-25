import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { REPLAN_EVENTS, REPLAN_EVENT_META, planHistory, replan, type ReplanEventKind } from "@/lib/engine/replan";

export const dynamic = "force-dynamic";

/** GET /api/replan — the event catalogue + plan version lineage. */
export async function GET() {
  try {
    await ensureSeeded();
    return NextResponse.json({ events: REPLAN_EVENT_META, kinds: REPLAN_EVENTS, history: await planHistory() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST /api/replan — respond to a live event and publish a NEW plan version.
 * Body: { kind, segmentId?, blockItemId?, defectId?, amountMin?, note?, actorName?, actorRole? }
 * Committed (frozen) blocks are never moved; the returned `diff` lists exactly
 * what changed.
 */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as {
      kind?: string;
      segmentId?: number;
      blockItemId?: number;
      defectId?: number;
      amountMin?: number;
      note?: string;
      actorName?: string;
      actorRole?: string;
    };
    if (!body.kind || !REPLAN_EVENTS.includes(body.kind as ReplanEventKind)) {
      return NextResponse.json({ error: `kind must be one of ${REPLAN_EVENTS.join(", ")}` }, { status: 400 });
    }
    const result = await replan({
      kind: body.kind as ReplanEventKind,
      segmentId: body.segmentId,
      blockItemId: body.blockItemId,
      defectId: body.defectId,
      amountMin: body.amountMin,
      note: body.note,
      actor: { name: body.actorName || "Control Office", role: body.actorRole || "CONTROL" },
    });
    return NextResponse.json({ ...result, history: await planHistory() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
