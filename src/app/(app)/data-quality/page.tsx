import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import QualityClient from "@/components/QualityClient";
import { qualityReport, qualityTrend } from "@/lib/engine/dataquality";

export const dynamic = "force-dynamic";

/**
 * DATA QUALITY (Phase 17) — findings with the field and reason that failed.
 *
 * The rule the SIH states is respected literally: bad records are NEVER dropped.
 * Each finding points at the stored row, and the repairs offered are recorded,
 * audited and reversible in the sense that nothing is overwritten silently.
 */
export default async function DataQualityPage() {
  const [report, trend] = await Promise.all([qualityReport(140), qualityTrend(20)]);
  const repairable = report.findings.filter((f) => f.repair);

  return (
    <RoleGate title="Data Quality Monitor">
      <div className="space-y-3">
        <PageHeader
          module="ADM-DQ"
          title="Data Quality Monitor"
          titleKey="page.quality"
          subtitleKey="page.quality.sub"
          subtitle="Ingested rows are validated against their declared contract, then checked again in the store: missing mandatory fields, duplicate source references, stale records, assets that do not exist, coordinates that fail the station geometry test, conflicting values from two source systems, orphans and schema mismatches."
          crumbs={[{ label: "Administration" }, { label: "Data Quality" }]}
          state={report.totals.critical > 0 ? `${report.totals.critical} finding(s) need a steward decision` : `${report.totals.findings} finding(s) logged`}
          stateTone={report.totals.critical > 0 ? "critical" : report.totals.warning > 0 ? "warning" : "success"}
          reference={`Quality score ${report.score}/100 · ${report.checked.ingestRecords} ingested row(s) · ${report.checked.defects} defect(s) · ${report.checked.assets} asset(s) checked`}
          actions={
            <>
              <Link href="/data" className="btn btn-xs">
                Integration hub
              </Link>
              <Link href="/alerts" className="btn btn-xs">
                Alerts
              </Link>
            </>
          }
        />
        <QualityClient report={report} trend={trend} repairable={repairable.length} />
      </div>
    </RoleGate>
  );
}
