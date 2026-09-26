import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import ResourceClient from "@/components/ResourceClient";
import { rejectionsSince, resourceBoard, utilisation } from "@/lib/engine/resources";
import { getLatestPlan } from "@/lib/engine/optimizer";

export const dynamic = "force-dynamic";

/**
 * RESOURCE OPTIMIZATION (Phase 7) — crew, machine and equipment capacity.
 *
 * The day sheet is derived from the plan's own block items: a department's
 * commitment on a day is the number of blocks it was detailed to, measured
 * against the gang units that are actually in service. Withdrawing a gang here
 * changes the ceiling, and the next optimizer run refuses the placements that no
 * longer fit.
 */
export default async function ResourcesPage() {
  const [board, plan, rejections] = await Promise.all([resourceBoard(), getLatestPlan(), rejectionsSince(1440)]);
  const blocks = (plan?.blocks ?? []).map((b) => ({ segmentCode: b.segmentCode, day: b.day, startMin: b.startMin, endMin: b.endMin, departments: b.departments }));
  const use = utilisation(blocks, board.resources);

  /* Crew detail per department per day, against the in-service gang units. */
  const dayCapacity = ["ENG", "TRD", "SNT"].flatMap((dept) =>
    [0, 1, 2].map((day) => ({
      department: dept,
      day,
      crewUsed: blocks.filter((b) => b.day === day && b.departments.includes(dept)).length,
      crewCap: board.resources.filter((r) => r.department === dept && r.kind === "CREW" && r.available).reduce((s, r) => s + r.units, 0),
    }))
  );

  const totalUnits = board.resources.reduce((s, r) => s + (r.kind === "CREW" ? r.units : 0), 0);
  const outOfService = board.resources.filter((r) => !r.available);
  const criticalGangs = use.byDept.filter((d) => d.utilisationPct >= 90);

  return (
    <RoleGate title="Crew & Machine Resources">
      <div className="space-y-3">
        <PageHeader
          module="AIP-RSC"
          title="Crew & Machine Resources"
          titleKey="page.resources"
          subtitleKey="page.resources.sub"
          subtitle="The optimizer is only allowed to place a block if a crew gang, a machine and a workable shift actually exist for it. This desk shows the establishment, what the current plan consumes, which placements were refused and why — and it lets an officer withdraw a gang so the constraint can be felt immediately."
          crumbs={[{ label: "AI Planning" }, { label: "Crew & Machine Resources" }]}
          state={outOfService.length > 0 ? `${outOfService.length} resource(s) out of service` : `${totalUnits} crew unit(s) in service`}
          stateTone={outOfService.length > 0 ? "warning" : "success"}
          reference={`${board.resources.length} resource(s) across ${board.establishment} establishment row(s) · ${use.totalCommitted} crew-slot(s) committed${criticalGangs.length ? ` · ${criticalGangs.map((d) => d.department).join(", ")} near capacity` : ""}`}
          actions={
            <>
              <Link href="/planner" className="btn btn-xs">
                Planner
              </Link>
              <Link href="/blocks" className="btn btn-xs">
                Block requests
              </Link>
            </>
          }
        />

        <ResourceClient board={{ resources: board.resources, establishment: board.establishment }} utilisation={use} dayCapacity={dayCapacity} rejections={rejections} planId={plan?.id ?? null} />

        {rejections.length > 0 && (
          <p className="text-[10.5px] leading-relaxed text-faint">
            {rejections.length} refusal(s) recorded in the last 24 hours across this division. Each one is stored as a
            <span className="font-mono"> RESOURCE_REJECT</span> ledger entry, so the refusal survives the plan run that caused it and can be explained to the
            departments whose work was displaced.
          </p>
        )}
        <p className="text-[10.5px] leading-relaxed text-faint">
          Availability, section scope and shift windows on this screen are the division&apos;s configured establishment values (SIMULATED / DEMO DATA for this
          prototype). The constraint logic itself is production-shaped: <span className="font-mono">checkPlacement()</span> runs the same five rules for a block
          request, a planner candidate and a replan.
        </p>
      </div>
    </RoleGate>
  );
}
