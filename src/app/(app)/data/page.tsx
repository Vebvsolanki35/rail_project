import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import DataHubClient from "@/components/DataHubClient";
import { feedStatus, hubSummary, recentThroughput } from "@/lib/engine/ingestion";
import { qualityReport } from "@/lib/engine/dataquality";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * DATA INTEGRATION HUB (Phase 1) — every departmental contract, its latest
 * ingestion cycle and the integrity proof behind it.
 */
export default async function DataPage() {
  const [status, summary, throughput, quality] = await Promise.all([feedStatus(), hubSummary(), recentThroughput(60), qualityReport(12)]);
  const degraded = status.filter((s) => s.state !== "CONNECTED");

  return (
    <RoleGate title="Data Integration Hub">
      <div className="space-y-3">
        <PageHeader
          module="ADM-INT"
          title="Data Integration Hub"
          titleKey="page.data"
          subtitleKey="page.data.sub"
          subtitle="TMS, SMMS, TDMS, COA, FOIS, the working timetable and IMD nowcast arrive through one normalising layer. Each cycle stores its own integrity proof: record counts, validation outcome, checksum and duration. Invalid rows are quarantined with the field and reason that failed them."
          crumbs={[{ label: "Administration" }, { label: "Data Integration Hub" }]}
          state={
            degraded.length === 0
              ? `${status.length} contracts connected`
              : `${degraded.length} contract(s) need attention: ${degraded.map((d) => d.system).join(", ")}`
          }
          stateTone={degraded.length === 0 ? "success" : "warning"}
          reference={`${summary.records.toLocaleString("en-IN")} normalised records · integrity ${summary.integrityPct}% · ${quality.totals.findings} quality finding(s)`}
          actions={
            <Link href="/data-quality" className="btn btn-xs">
              Data quality monitor
            </Link>
          }
        />

        <DataHubClient
          initialStatus={status}
          summary={summary as unknown as Record<string, unknown>}
          throughput={throughput as unknown as Record<string, unknown>}
        />

        {/* Contract schemas — the documented shape each source must deliver */}
        <section className="panel">
          <div className="panel-hd">
            <span>Declared contract schemas</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">validated on every cycle</span>
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
            {status.map((s) => (
              <article key={s.system} className="border border-edge">
                <header className="flex items-center justify-between border-b border-edge bg-abyss px-2.5 py-1.5">
                  <span className="text-[11.5px] font-bold text-ink">{s.system}</span>
                  <span className="font-mono text-[10px] text-faint">{s.contractVersion}</span>
                </header>
                <dl className="kv px-2.5 py-2">
                  {Object.entries(s.schema).map(([field, type]) => (
                    <div key={field} className="contents">
                      <dt className="font-mono text-[10px]">{field}</dt>
                      <dd className="font-mono text-[10px] text-dim">{type}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        </section>
      </div>
    </RoleGate>
  );
}
