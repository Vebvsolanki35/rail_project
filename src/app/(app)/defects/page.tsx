import RoleGate from "@/components/RoleGate";
import DefectsClient from "@/components/DefectsClient";
import { getLifecycleBoard, lifecycleRollup } from "@/lib/engine/defectlifecycle";
import { scoreForQueue, urgencyQueue, urgencySummary } from "@/lib/engine/urgency";
import type { RecurrenceLevel } from "@/lib/engine/lifecycleStages";

export const dynamic = "force-dynamic";

/**
 * Smart Defect Lifecycle workbench — the inspector's and control office's home.
 * Server-rendered so the board is real data on first paint; actions refresh it.
 */
export default async function DefectsPage() {
  const [board, rollup] = await Promise.all([getLifecycleBoard(), lifecycleRollup()]);
  const queue = urgencyQueue(
    board
      .filter((r) => r.stage !== "CLOSED")
      .map((r) =>
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
          recurrenceBand: r.recurrenceBand as RecurrenceLevel,
          priority: r.priority,
          lifecycleStatus: r.stage,
        })
      )
  );

  return (
    <RoleGate title="Smart Defect Lifecycle">
      <div className="space-y-4">
        <header>
          <h1 className="text-lg font-bold text-ink">Smart Defect Lifecycle</h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-dim">
            Every defect carries one identity (DEF-&lt;SECTION&gt;-&lt;YEAR&gt;-&lt;SEQ&gt;) through eleven stages, from the
            patrol report to validated closure. At every stage the system states what is happening, what comes next and
            who is responsible — and every transition is written to an append-only audit trail.
          </p>
        </header>
        <DefectsClient board={board} rollup={rollup} urgency={urgencySummary(queue)} />
      </div>
    </RoleGate>
  );
}
