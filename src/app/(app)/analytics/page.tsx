import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import AnalyticsClient from "@/components/AnalyticsClient";
import { availabilityAnalytics, availabilityBySection, availabilitySnapshots } from "@/lib/engine/analytics";
import { buildComparison, comparisonSummary } from "@/lib/engine/baseline";

export const dynamic = "force-dynamic";

/**
 * ASSET AVAILABILITY ANALYTICS (Phase 16) + BASELINE COMPARISON (Phase 6).
 *
 * The SIH objective — maximising asset availability for train operations — is
 * the headline KPI, and the manual baseline it is measured against is a
 * simulation of roster-driven practice over the SAME live defect register. The
 * comparison screen states that provenance instead of implying measured history.
 */
export default async function AnalyticsPage() {
  const [analytics, sections, comparison, snapshots] = await Promise.all([
    availabilityAnalytics(30),
    availabilityBySection(),
    buildComparison("WEEKLY"),
    availabilitySnapshots(20),
  ]);
  const summary = comparisonSummary(comparison);
  const relevant = sections.filter((s) => s.openDefects > 0 || s.critical > 0).sort((a, b) => b.critical - a.critical || a.availabilityPct - b.availabilityPct);

  return (
    <RoleGate title="Asset Availability Analytics">
      <div className="space-y-3">
        <PageHeader
          module="ADM-AVA"
          title="Asset Availability Analytics"
          titleKey="page.analytics"
          subtitleKey="page.analytics.sub"
          subtitle="Availability leads; downtime avoided, duplicate possessions avoided, critical backlog, maintenance completion and train-delay impact follow. Trends come from the snapshot written after every optimizer run, and the baseline comparison is a simulation of roster-driven manual practice over the same defect register — calculated from live rows, never asserted."
          crumbs={[{ label: "Administration" }, { label: "Asset Availability Analytics" }]}
          state={
            analytics.headline.gainPts >= 0
              ? `Availability ${analytics.headline.availabilityPct.toFixed(1)}% — ${analytics.headline.gainPts.toFixed(1)} pts above the simulated baseline`
              : `Availability ${analytics.headline.availabilityPct.toFixed(1)}% — below the simulated baseline; review the plan`
          }
          stateTone={analytics.headline.gainPts >= 1 ? "success" : analytics.headline.gainPts >= 0 ? "info" : "critical"}
          reference={`${summary.possessionHoursSaved.toFixed(1)} h of possession saved · ${summary.duplicateBlocksAvoided} duplicate possession(s) avoided · ${snapshots.length} availability snapshot(s) on record`}
          actions={
            <>
              <Link href="/compare" className="btn btn-xs">
                Legacy comparison view
              </Link>
              <Link href="/planner" className="btn btn-xs">
                Planner
              </Link>
            </>
          }
        />

        <AnalyticsClient analytics={analytics} comparison={comparison} summary={summary} sections={relevant} />

        <p className="text-[10.5px] leading-relaxed text-faint">
          Trend points are written by the optimizer (<span className="font-mono">AVAILABILITY_SNAPSHOT</span> ledger entries) and never back-filled: a 90-day window
          on a young database is honest about having few points. The manual baseline assumes one possession per defect, full standalone setup each time, and
          roster-order sequencing — the same constants to which the optimizer is held.
        </p>
      </div>
    </RoleGate>
  );
}
