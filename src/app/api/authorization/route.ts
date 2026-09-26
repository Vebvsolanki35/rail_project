import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { authorizationForBlock, authorizationSummary, issueAuthorization, listAuthorizations } from "@/lib/engine/authorization";

export const dynamic = "force-dynamic";

/** GET /api/authorization            — issued block authorizations
 *  GET /api/authorization?blockItemId=7 — authorizations for one block */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const blockItemId = new URL(req.url).searchParams.get("blockItemId");
    if (blockItemId) return NextResponse.json({ authorizations: await authorizationForBlock(Number(blockItemId)) });
    return NextResponse.json({ summary: await authorizationSummary(), authorizations: await listAuthorizations(60) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/authorization { blockItemId, actorName, actorRole } — issue after DRM approval. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const blockItemId = Number(body.blockItemId);
    if (!Number.isFinite(blockItemId))
      return NextResponse.json({ error: "blockItemId is required — authorise a block of the approved plan" }, { status: 400 });
    const result = await issueAuthorization({
      blockItemId,
      actorName: String(body.actorName ?? "Control Office"),
      actorRole: String(body.actorRole ?? "CONTROL"),
      fogMode: !!body.fogMode,
      rainMm: body.rainMm ? Number(body.rainMm) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
