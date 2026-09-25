import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { applyRepair, qualityReport, qualityTrend, snapshotQuality } from "@/lib/engine/dataquality";

export const dynamic = "force-dynamic";

/** GET /api/quality — data-quality findings computed from the live tables. */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 120);
    const [report, trend] = await Promise.all([qualityReport(limit), qualityTrend(60)]);
    return NextResponse.json({ ...report, trend });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/quality { snapshot?: true, action?, payload?, actorName?, actorRole? } */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action) {
      const result = await applyRepair(String(body.action), (body.payload as Record<string, unknown>) ?? {}, {
        name: String(body.actorName ?? "Data Steward"),
        role: String(body.actorRole ?? "CONTROL"),
      });
      return NextResponse.json({ repair: result, report: await qualityReport(40) });
    }
    return NextResponse.json({ ok: true, report: await snapshotQuality() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
