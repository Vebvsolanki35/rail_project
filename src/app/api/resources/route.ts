import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { listResources, rejectionsSince, resourceBoard, setResourceAvailable, utilisation } from "@/lib/engine/resources";
import { getLatestPlan } from "@/lib/engine/optimizer";

export const dynamic = "force-dynamic";

/** GET /api/resources — establishment + crew utilisation of the published plan. */
export async function GET() {
  try {
    await ensureSeeded();
    const [board, plan, rejections] = await Promise.all([resourceBoard(), getLatestPlan(), rejectionsSince(1440)]);
    const blocks = (plan?.blocks ?? []).map((b) => ({ segmentCode: b.segmentCode, day: b.day, startMin: b.startMin, endMin: b.endMin, departments: b.departments }));
    return NextResponse.json({
      resources: board.resources,
      establishment: board.establishment,
      utilisation: utilisation(blocks, board.resources),
      rejections,
      planId: plan?.id ?? null,
      note: "Crew shifts, section scope, machine availability and daily capacity are hard constraints checked per candidate slot in the optimizer.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/resources { code, available, reason? } — mark a resource out of service. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as { code?: string; available?: boolean; reason?: string };
    if (!body.code) return NextResponse.json({ error: "code is required" }, { status: 400 });
    if (typeof body.available !== "boolean")
      return NextResponse.json({ error: "available must be true or false" }, { status: 400 });
    /* Refuse an unknown code instead of reporting success for a no-op update. */
    const known = await listResources();
    if (!known.some((r) => r.code === body.code))
      return NextResponse.json(
        { error: `unknown resource code ${body.code} — ${known.length} resource(s) are on the establishment (see GET /api/resources)` },
        { status: 400 }
      );
    await setResourceAvailable(body.code, body.available, body.reason);
    return NextResponse.json({ ok: true, resources: await listResources() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
