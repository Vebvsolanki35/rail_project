import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { analyseShadow, runShadowAnalysis, shadowHistory, shadowInput, workedExample } from "@/lib/engine/shadowblock";

export const dynamic = "force-dynamic";

/** GET /api/shadow — live combined-block analysis over the open register. */
export async function GET() {
  try {
    await ensureSeeded();
    const sections = await shadowInput();
    const results = analyseShadow(sections);
    const totals = results.reduce(
      (s, r) => ({
        independentMin: s.independentMin + r.independentMin,
        combinedMin: s.combinedMin + r.combinedMin,
        savedMin: s.savedMin + r.savedMin,
        duplicatePossessionsAvoided: s.duplicatePossessionsAvoided + r.duplicatePossessionsAvoided,
        trainDelaySavedMin: s.trainDelaySavedMin + r.trainDelaySavedMin,
      }),
      { independentMin: 0, combinedMin: 0, savedMin: 0, duplicatePossessionsAvoided: 0, trainDelaySavedMin: 0 }
    );
    return NextResponse.json({
      sectionsAnalysed: sections.length,
      combinations: results.length,
      totals: { ...totals, savedH: Math.round((totals.savedMin / 60) * 10) / 10 },
      workedExample: workedExample(results[0]),
      results,
      persisted: await shadowHistory(15),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/shadow — re-run the analysis and persist the combinations. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as { actorName?: string; actorRole?: string };
    const run = await runShadowAnalysis(body.actorName ?? "Shadow Block Engine", body.actorRole ?? "SYSTEM");
    return NextResponse.json(run);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
