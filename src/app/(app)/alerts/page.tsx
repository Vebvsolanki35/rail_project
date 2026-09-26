import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import AlertsClient from "@/components/AlertsClient";
import { alertSummary, generateAlerts, RISK_THRESHOLD } from "@/lib/engine/alerts";

export const dynamic = "force-dynamic";

/**
 * ALERT CENTRE (Phase 18) — CRITICAL / WARNING / INFO, each linked to its record.
 */
export default async function AlertsPage() {
  const alerts = await generateAlerts();
  const summary = await alertSummary();
  const worst = alerts[0];

  return (
    <RoleGate title="Alert Centre">
      <div className="space-y-3">
        <PageHeader
          module="OPS-ALT"
          title="Alert Centre"
          titleKey="page.alerts"
          subtitleKey="page.alerts.sub"
          subtitle="Alerts are not a notification log — each one is derived from a live row and states the rule that fired, the value measured and the threshold crossed, with a link straight to the affected defect, block, plan, feed or section. Acknowledge records who saw it; the condition itself has to be fixed for the alert to clear."
          crumbs={[{ label: "Operations" }, { label: "Alert Centre" }]}
          state={summary.critical > 0 ? `${summary.critical} critical alert(s)` : summary.warning > 0 ? `${summary.warning} warning(s) under watch` : "no active alert"}
          stateTone={summary.critical > 0 ? "critical" : summary.warning > 0 ? "warning" : "success"}
          reference={worst ? `Priority action: ${worst.title} (${worst.measured} vs ${worst.threshold})` : "register clear"}
          actions={
            <>
              <Link href="/defects" className="btn btn-xs">
                Defect register
              </Link>
              <Link href="/conflicts" className="btn btn-xs">
                Conflicts
              </Link>
            </>
          }
        />
        <AlertsClient initial={alerts} summary={summary} riskThreshold={RISK_THRESHOLD} />
      </div>
    </RoleGate>
  );
}
