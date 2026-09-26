import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { availabilityAnalytics, availabilityBySection, availabilitySnapshots, snapshotAvailability, type TrendWindow } from "@/lib/engine/analytics";
import { buildComparison, comparisonSummary } from "@/lib/engine/baseline";

export const dynamic = "force-dynamic";

/** GET /api/analytics?window=30&compare=WEEKLY — availability analytics + baseline comparison. */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const url = new URL(req.url);
    const window = Number(url.searchParams.get("window") ?? 30) as TrendWindow;
    const compare = (url.searchParams.get("compare") ?? "WEEKLY") as "WEEKLY" | "MONTHLY";
    const [analytics, sections, snapshots, comparison] = await Promise.all([
      availabilityAnalytics([7, 30, 90].includes(window) ? window : 30),
      availabilityBySection(),
      availabilitySnapshots(40),
      buildComparison(compare),
    ]);
    return NextResponse.json({
      analytics,
      sections,
      snapshots,
      comparison: { ...comparison, summary: comparisonSummary(comparison) },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/analytics — write an availability snapshot from the current plan. */
export async function POST() {
  try {
    await ensureSeeded();
    return NextResponse.json({ ok: true, snapshot: await snapshotAvailability(), snapshots: await availabilitySnapshots(20) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
