import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import StationClient from "@/components/StationClient";
import { getDashboardState, getDefectDTOs } from "@/lib/engine/state";
import { getJobs } from "@/lib/engine/jobs";
import { getLatestPlan } from "@/lib/engine/optimizer";

export const dynamic = "force-dynamic";

/** Station Master desk — the station-level view of blocks, defects and crews. */
export default async function StationPage() {
  const [state, defects, jobs, plan] = await Promise.all([getDashboardState(), getDefectDTOs(), getJobs(), getLatestPlan()]);

  return (
    <RoleGate title="Station Master Desk">
      <div className="space-y-3">
        <PageHeader
          module="OPS-SM"
          title="Station Master Desk"
          titleKey="page.station"
          subtitleKey="page.station.sub"
          subtitle="What a block means where it is actually worked: the sections attached to your station, the sanctioned occupancies touching them, the defects live on those sections and the patrol reports still waiting for an inspector. Station masters can forward reports but cannot approve a block or close verified work."
          crumbs={[{ label: "Operations" }, { label: "Station Master Desk" }]}
          state={`${jobs.length} work order(s) · ${defects.filter((d) => d.status !== "closed").length} open defect(s)`}
          stateTone={defects.some((d) => d.severity >= 8 && d.status !== "closed") ? "critical" : "info"}
          reference={plan ? `Plan #${plan.id} in force` : "No plan published"}
        />
        <StationClient
          stations={state.stations.map((s) => ({ id: s.id, code: s.code, name: s.name, kind: s.kind, dailyTrains: s.dailyTrains, vipZone: s.vipZone }))}
          sections={state.segments.map((s) => ({
            id: s.id,
            code: s.code,
            fromCode: s.fromCode,
            toCode: s.toCode,
            corridor: s.corridor,
            dailyTrains: s.dailyTrains,
            criticality: s.criticality,
            isLevelCrossing: s.isLevelCrossing,
            isBridge: s.isBridge,
          }))}
          defects={defects}
          blocks={plan?.blocks ?? []}
          jobs={jobs}
        />
      </div>
    </RoleGate>
  );
}
