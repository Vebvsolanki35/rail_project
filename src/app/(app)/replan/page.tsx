import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import ReplanPanel from "@/components/ReplanPanel";
import { REPLAN_EVENT_META, planHistory } from "@/lib/engine/replan";
import { getLatestPlan } from "@/lib/engine/optimizer";
import { db } from "@/db";
import { segments } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Dynamic re-planning console — fire a live event, inspect the new version. */
export default async function ReplanPage() {
  const [history, latestPlan, segmentRows] = await Promise.all([planHistory(), getLatestPlan(), db.select().from(segments)]);

  return (
    <RoleGate title="Dynamic Re-Planning">
      <div className="space-y-3">
        <PageHeader
          module="AIP-RPL"
          title="Dynamic Re-Planning"
          titleKey="page.replan"
          subtitleKey="page.replan.sub"
          subtitle="Plans are living documents. When a train loses time, a crew overruns, a new defect appears, OHE fails, freight surges or a sanctioned block is cancelled, Rail Rakshak publishes a new version: committed blocks stay frozen because a crew is physically on site, everything else may move — and the diff shows exactly what changed and why."
          crumbs={[{ label: "Operations" }, { label: "Dynamic Re-Planning" }]}
          state={latestPlan ? `Current version #${latestPlan.id} · ${history.length} published version(s)` : "No plan published"}
          stateTone={latestPlan ? "info" : "warning"}
          reference={`${Object.keys(REPLAN_EVENT_META).length} live event types armed`}
        />
        <ReplanPanel
          events={REPLAN_EVENT_META}
          history={history}
          latestPlan={latestPlan}
          segments={segmentRows.map((s) => ({ id: s.id, code: s.code, corridor: s.corridor, dailyTrains: s.dailyTrains }))}
        />
      </div>
    </RoleGate>
  );
}
