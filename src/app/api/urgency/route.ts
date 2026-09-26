import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { getDefectDTOs } from "@/lib/engine/state";
import { PRIORITY_WEIGHTS, URGENCY_META, scoreForQueue, urgencyQueue, urgencySummary } from "@/lib/engine/urgency";
import type { RecurrenceLevel } from "@/lib/engine/lifecycleStages";

export const dynamic = "force-dynamic";

/**
 * GET /api/urgency — the prioritisation queue.
 * Every row carries its urgency class, 0–100 urgency index and the ×boost the
 * optimizer applies, so the ordering is inspectable rather than a black box.
 */
export async function GET() {
  try {
    await ensureSeeded();
    const defects = await getDefectDTOs();
    const open = defects.filter((d) => d.status !== "closed");
    const queue = urgencyQueue(
      open.map((d) =>
        scoreForQueue({
          id: d.id,
          defectCode: d.defectCode,
          title: d.title,
          segmentCode: d.segmentCode,
          department: d.department,
          severity: d.severity,
          dueInDays: d.dueInDays,
          overdueDays: d.overdueDays,
          aiScore: d.aiScore,
          recurrenceBand: d.recurrenceBand as RecurrenceLevel,
          priority: d.priority,
          lifecycleStatus: d.lifecycleStatus,
        })
      )
    );
    return NextResponse.json({
      queue,
      summary: urgencySummary(queue),
      classes: URGENCY_META,
      weights: PRIORITY_WEIGHTS,
      formula: "final priority = 35% criticality · 30% urgency · 20% ML failure risk · 15% asset availability",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
