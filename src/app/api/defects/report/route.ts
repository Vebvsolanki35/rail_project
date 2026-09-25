import { NextResponse } from "next/server";
import { PATROL_CATEGORIES, reportFieldDefect } from "@/lib/engine/fieldreport";
import { ensureSeeded } from "@/lib/engine/seed";

export const dynamic = "force-dynamic";

/** GET — the patrol handset's category catalogue (single source of truth). */
export async function GET() {
  return NextResponse.json({ categories: PATROL_CATEGORIES });
}

/**
 * POST /api/defects/report — Rakshak Patrol / field-worker intake.
 * Creates the defect at stage REPORTED with a stable DEF-<SECTION>-<YEAR>-<SEQ>
 * id, runs rule-based recurrence detection and returns "what's next".
 */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body.category) return NextResponse.json({ error: "category is required" }, { status: 400 });
    const result = await reportFieldDefect({
      category: String(body.category),
      segmentCode: body.segmentCode ? String(body.segmentCode) : undefined,
      segmentId: body.segmentId ? Number(body.segmentId) : undefined,
      title: body.title ? String(body.title) : undefined,
      note: body.note ? String(body.note) : undefined,
      severity: body.severity ? Number(body.severity) : undefined,
      durationMin: body.durationMin ? Number(body.durationMin) : undefined,
      department: body.department ? String(body.department) : undefined,
      photo: body.photo ? String(body.photo) : undefined,
      gps: body.gps ? String(body.gps) : undefined,
      reporterName: body.reporterName ? String(body.reporterName) : undefined,
      reporterMobile: body.reporterMobile ? String(body.reporterMobile) : undefined,
      needsPowerBlock: body.needsPowerBlock === undefined ? undefined : Boolean(body.needsPowerBlock),
      needsLineBlock: body.needsLineBlock === undefined ? undefined : Boolean(body.needsLineBlock),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
