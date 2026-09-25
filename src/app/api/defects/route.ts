import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { getLifecycleBoard, lifecycleRollup } from "@/lib/engine/defectlifecycle";
import { urgencyQueue, urgencySummary } from "@/lib/engine/urgency";
import { scoreForQueue } from "@/lib/engine/urgency";

export const dynamic = "force-dynamic";

/**
 * GET /api/defects
 *   ?stage=REPORTED|…            filter by lifecycle stage
 *   ?urgency=EMERGENCY|…         filter by urgency class
 *   ?department=ENG|TRD|SNT
 *   ?q=text                      free-text over defect code / title / section
 *
 * Returns the lifecycle board, the roll-up and the urgency queue — the three
 * views the Defect Lifecycle page renders.
 */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const url = new URL(req.url);
    const stage = url.searchParams.get("stage");
    const urgency = url.searchParams.get("urgency");
    const department = url.searchParams.get("department");
    const q = url.searchParams.get("q")?.toLowerCase().trim();

    const [board, rollup] = await Promise.all([getLifecycleBoard(), lifecycleRollup()]);
    const filtered = board.filter(
      (r) =>
        (!stage || r.stage === stage) &&
        (!urgency || r.urgencyClass === urgency) &&
        (!department || r.department === department) &&
        (!q || r.defectCode.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.segmentCode.toLowerCase().includes(q))
    );

    const queue = urgencyQueue(
      filtered.map((r) =>
        scoreForQueue({
          id: r.id,
          defectCode: r.defectCode,
          title: r.title,
          segmentCode: r.segmentCode,
          department: r.department,
          severity: r.severity,
          dueInDays: r.dueInDays,
          overdueDays: 0,
          aiScore: r.sortKey / (r.boost || 1),
          recurrenceBand: r.recurrenceBand,
          priority: r.priority,
          lifecycleStatus: r.stage,
        })
      )
    );

    return NextResponse.json({
      board: filtered,
      rollup,
      urgency: urgencySummary(queue),
      queue,
      filters: { stage, urgency, department, q: q ?? null },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
