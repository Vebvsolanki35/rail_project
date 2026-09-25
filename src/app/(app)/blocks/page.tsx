import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import BlockExchangeClient from "@/components/BlockExchangeClient";
import { competingDemand, listRequests, requestSummary, STATUS_META } from "@/lib/engine/blockrequests";
import { db } from "@/db";
import { assets, defects, segments } from "@/db/schema";
import { ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * BLOCK REQUEST EXCHANGE (Phase 3) — departmental demands to one possession.
 */
export default async function BlocksPage() {
  const [requests, summary, demand, segRows, assetRows, openDefects] = await Promise.all([
    listRequests(),
    requestSummary(),
    competingDemand(),
    db.select().from(segments).orderBy(segments.code),
    db.select({ id: assets.id, segmentId: assets.segmentId }).from(assets),
    db.select().from(defects).where(ne(defects.status, "closed")),
  ]);

  /* Defect → section comes from the real asset register (defect.assetId →
     asset.segmentId), so a request prefilled here always names the right section. */
  const segOfAsset = new Map(assetRows.map((a) => [a.id, a.segmentId]));
  const defectOptions = openDefects.map((d) => ({
    id: d.id,
    defectCode: d.defectCode || `#${d.id}`,
    title: d.title,
    department: d.department,
    durationMin: d.durationMin,
    segmentId: segOfAsset.get(d.assetId) ?? 0,
  }));

  return (
    <RoleGate title="Block Request Exchange">
      <div className="space-y-3">
        <PageHeader
          module="AIP-BRQ"
          title="Block Request Exchange"
          titleKey="page.blocks"
          subtitleKey="page.blocks.sub"
          subtitle="Engineering, Traction and S&T raise maintenance block requests here. Each request carries the section, asset, duration, priority, resources, power-isolation and line-block requirements, and the window asked for. The exchange then holds it against the established status machine — and against the resource roster and the live plan."
          crumbs={[{ label: "AI Planning" }, { label: "Block Request Exchange" }]}
          state={summary.conflicts > 0 ? `${summary.conflicts} request(s) in conflict · ${summary.awaitingApproval} awaiting approval` : `${summary.open} open request(s)`}
          stateTone={summary.conflicts > 0 ? "critical" : summary.awaitingApproval > 0 ? "warning" : "success"}
          reference={`${summary.total} request(s) · ${summary.powerIsolation} with power isolation · departments ${summary.departments.join(", ") || "—"}`}
          actions={
            <>
              <Link href="/shadow" className="btn btn-xs">
                Shadow block intelligence
              </Link>
              <Link href="/conflicts" className="btn btn-xs">
                Conflict centre
              </Link>
            </>
          }
        />

        {/* Status pipeline */}
        <section className="panel">
          <div className="panel-hd">
            <span>Exchange pipeline</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">draft → submitted → conflict/optimizing → proposed → approved → published → completed</span>
          </div>
          <div className="flex flex-wrap gap-1.5 p-3">
            {summary.byStatus.map((s) => (
              <span key={s.status} className="flex items-center gap-1.5 border border-edge px-2 py-1">
                <StatusPill label={s.label} tone={STATUS_META[s.status].tone} />
                <span className="font-mono text-[11px] font-bold text-ink">{s.n}</span>
                <span className="text-[10px] text-faint">{STATUS_META[s.status].actor}</span>
              </span>
            ))}
          </div>
        </section>

        {demand.length > 0 && (
          <section className="panel">
            <div className="panel-hd">
              <span>Competing departmental demand</span>
              <StatusPill label={`${demand.length} section(s)`} tone="warning" />
            </div>
            <ul className="divide-y divide-edge">
              {demand.map((d) => {
                const seg = segRows.find((s) => s.id === d.segmentId);
                return (
                  <li key={d.segmentId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11.5px]">
                    <span className="ref">{seg?.code ?? `#${d.segmentId}`}</span>
                    <span className="text-dim">{d.departments.split(",").join(" + ")} all want this section</span>
                    <Link href="/shadow" className="btn-link ml-auto text-[10.5px]">
                      check combined possession
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <BlockExchangeClient initial={requests} segments={segRows.map((s) => ({ id: s.id, code: s.code, corridor: s.corridor, dailyTrains: s.dailyTrains }))} defects={defectOptions} />
      </div>
    </RoleGate>
  );
}
