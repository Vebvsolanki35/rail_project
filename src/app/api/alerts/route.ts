import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { acknowledgeAlert, alertSummary, generateAlerts, RISK_THRESHOLD } from "@/lib/engine/alerts";

export const dynamic = "force-dynamic";

/** GET /api/alerts — operational alerts derived from the live register. */
export async function GET() {
  try {
    await ensureSeeded();
    const alerts = await generateAlerts();
    return NextResponse.json({ riskThreshold: RISK_THRESHOLD, summary: await alertSummary(), alerts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/alerts { id, actorName, actorRole, note? } — acknowledge an alert. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await acknowledgeAlert({
      id: String(body.id),
      by: String(body.actorName ?? "Duty Officer"),
      role: String(body.actorRole ?? "CONTROL"),
      note: body.note ? String(body.note) : undefined,
    });
    return NextResponse.json({ ...result, summary: await alertSummary() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
