import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { freightSummary, listForecasts, syncForecasts } from "@/lib/engine/freight";

export const dynamic = "force-dynamic";

/** GET /api/forecast — the Control Office goods-train forecast the optimizer uses. */
export async function GET() {
  try {
    await ensureSeeded();
    const [summary, rows] = await Promise.all([freightSummary(), listForecasts(200)]);
    return NextResponse.json({
      simulated: true,
      disclaimer: "SIMULATED / DEMO DATA — forecast derived from FOIS rake telemetry carried over the demo contract.",
      source: "FOIS (fois-rakes.v2) + COA corridor availability",
      summary,
      rows,
      consumedBy: "src/lib/engine/optimizer.ts → freightPressure() (per-candidate-slot penalty)",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/forecast — rebuild the forecast table from the newest FOIS cycle. */
export async function POST() {
  try {
    await ensureSeeded();
    const result = await syncForecasts();
    return NextResponse.json({ ok: true, ...result, rows: await listForecasts(200) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
