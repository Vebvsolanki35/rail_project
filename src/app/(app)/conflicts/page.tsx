import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import ConflictClient from "@/components/ConflictClient";
import { conflictSummary, detectPlanConflicts } from "@/lib/engine/conflicts";
import { AI_AUTHORITY } from "@/lib/engine/explain";

export const dynamic = "force-dynamic";

/**
 * CONFLICT RESOLUTION CENTRE (Phase 10).
 *
 * Every conflict row is produced by re-reading the section's working timetable
 * paths against the plan's possession windows, so the exposure is measured, not
 * asserted. Options A–D are re-scored on the same delay model; the human picks.
 */
export default async function ConflictsPage() {
  const rows = await detectPlanConflicts();
  const summary = conflictSummary(rows);

  return (
    <RoleGate title="Conflict Resolution Centre">
      <div className="space-y-3">
        <PageHeader
          module="AIP-CFL"
          title="Conflict Resolution Centre"
          titleKey="page.conflicts"
          subtitleKey="page.conflicts.sub"
          subtitle="Each row names the section, the possession window, the trains whose paths it crosses and the severity of the crossing. The engine then offers several feasible alternatives — shift the block, shorten it, combine it with the neighbouring departmental tasks, or move it to the golden window — and re-scores the train delay for every one of them."
          crumbs={[{ label: "AI Planning" }, { label: "Conflict Resolution Centre" }]}
          state={summary.critical > 0 ? `${summary.critical} critical conflict(s)` : summary.total > 0 ? `${summary.total} conflict(s), all resolvable` : "no conflict on the current plan"}
          stateTone={summary.critical > 0 ? "critical" : summary.total > 0 ? "warning" : "success"}
          reference={`${summary.total} conflict(s) on ${summary.sections.length} section(s) · modelled delay ${summary.delayMin} min · best option would recover ${summary.bestOptionSaving} min`}
          actions={
            <>
              <Link href="/planner" className="btn btn-xs">
                Open the planner
              </Link>
              <Link href="/shadow" className="btn btn-xs">
                Combine instead
              </Link>
            </>
          }
        />

        <ConflictClient initial={rows} summary={summary} authority={`${AI_AUTHORITY.recommendationLabel} · ${AI_AUTHORITY.reviewLabel}`} />
      </div>
    </RoleGate>
  );
}
