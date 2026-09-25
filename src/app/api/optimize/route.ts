import { NextResponse } from "next/server";
import { runOptimizer, runRollingPlan } from "@/lib/engine/optimizer";
import { ensureSeeded } from "@/lib/engine/seed";

export const dynamic = "force-dynamic";

const HORIZONS = ["WEEKLY", "MONTHLY", "ROLLING"] as const;

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as { horizon?: string };
    /* An unrecognised horizon is refused rather than silently planned as WEEKLY —
       a mis-typed request must never produce a plan the officer did not ask for. */
    const horizon = body.horizon ? String(body.horizon).toUpperCase() : "WEEKLY";
    if (!HORIZONS.includes(horizon as (typeof HORIZONS)[number]))
      return NextResponse.json({ error: `horizon must be one of ${HORIZONS.join(", ")}` }, { status: 400 });
    const result =
      horizon === "ROLLING"
        ? await runRollingPlan()
        : await runOptimizer(horizon === "MONTHLY" ? "MONTHLY" : "WEEKLY");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
