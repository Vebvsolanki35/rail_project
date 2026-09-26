import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { AI_AUTHORITY, explainDefect, explainPlan, weatherDesk } from "@/lib/engine/explain";

export const dynamic = "force-dynamic";

/**
 * GET /api/explain?defectId=12 — full factor breakdown + reasoning for one task
 * GET /api/explain            — the top tasks by priority, + weather desk
 */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const url = new URL(req.url);
    const defectId = url.searchParams.get("defectId");
    if (defectId) {
      const explanation = await explainDefect(Number(defectId));
      if (!explanation) return NextResponse.json({ error: `defect ${defectId} not found` }, { status: 404 });
      return NextResponse.json({ authority: AI_AUTHORITY, explanation });
    }
    const [explanations, weather] = await Promise.all([explainPlan(Number(url.searchParams.get("limit") ?? 12)), weatherDesk()]);
    return NextResponse.json({ authority: AI_AUTHORITY, explanations, weather });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
