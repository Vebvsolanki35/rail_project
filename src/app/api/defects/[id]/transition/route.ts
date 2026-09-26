import { NextResponse } from "next/server";
import { advanceDefect, runDetailedInspection, setLongTermMaintenance, type Actor } from "@/lib/engine/defectlifecycle";
import { ensureSeeded } from "@/lib/engine/seed";
import type { LifecycleStage } from "@/lib/engine/lifecycleStages";

export const dynamic = "force-dynamic";

/**
 * POST /api/defects/:id/transition
 *
 * Body:
 *   { action: "advance", to: "<STAGE>", note?, actorName?, actorRole? }
 *   { action: "inspect",  note, finding?, extraDurationMin?, needsPowerBlock? }
 *   { action: "long-term", durationMin, note, plannedFor }
 *
 * The transition graph is enforced SERVER-SIDE (lifecycleStages.canTransition):
 * a caller cannot jump REPORTED → CLOSED, and every accepted move is written to
 * the defect_events audit trail.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSeeded();
    const { id } = await params;
    const defectId = Number(id);
    const body = (await req.json().catch(() => ({}))) as {
      action?: "advance" | "inspect" | "long-term";
      to?: LifecycleStage;
      note?: string;
      finding?: string;
      extraDurationMin?: number;
      needsPowerBlock?: boolean;
      durationMin?: number;
      plannedFor?: string;
      actorName?: string;
      actorRole?: string;
    };

    const actor: Actor = { name: body.actorName || "Desk Officer", role: body.actorRole || "CONTROL" };
    const action = body.action ?? "advance";

    if (action === "inspect") {
      const res = await runDetailedInspection(defectId, {
        actor,
        note: body.note || "detailed inspection recorded",
        finding: body.finding,
        extraDurationMin: body.extraDurationMin,
        needsPowerBlock: body.needsPowerBlock,
      });
      return NextResponse.json({ ok: true, action, ...res });
    }

    if (action === "long-term") {
      await setLongTermMaintenance(defectId, {
        actor,
        durationMin: body.durationMin ?? 240,
        note: body.note || "long-term maintenance planned",
        plannedFor: body.plannedFor || "next engineering block",
      });
      return NextResponse.json({ ok: true, action, stage: "MAINTENANCE_REQUIRED" });
    }

    if (!body.to) return NextResponse.json({ error: "`to` stage is required" }, { status: 400 });
    const res = await advanceDefect(defectId, body.to, { actor, note: body.note });
    return NextResponse.json({ ok: true, action: "advance", stage: res.stage, priority: res.priority, breakdown: res.breakdown });
  } catch (e) {
    // Invalid transitions surface as 400 with the reason — the UI shows it verbatim.
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
