import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import SafetyConsole from "@/components/SafetyConsole";
import StatusPill from "@/components/StatusPill";
import { getDashboardState } from "@/lib/engine/state";
import { getJobs } from "@/lib/engine/jobs";
import { fmtMin } from "@/lib/engine/network";

export const dynamic = "force-dynamic";

/**
 * SAFETY & PERMITS — permit-to-work register, evidence compliance and the
 * combined block safety work order (existing `POST /api/safety-order`).
 */
export default async function SafetyPage() {
  const [state, jobs] = await Promise.all([getDashboardState(), getJobs()]);
  const blocks = (state.latestPlan?.blocks ?? []).map((b) => ({
    id: b.id,
    segmentCode: b.segmentCode,
    corridor: b.corridor,
    day: b.day,
    startMin: b.startMin,
    endMin: b.endMin,
    departments: b.departments,
    isSuperBlock: b.isSuperBlock,
    mode: b.mode,
    defectCount: b.defectCount,
  }));

  const superBlocks = blocks.filter((b) => b.isSuperBlock);
  const awaiting = jobs.filter((j) => j.status === "AWAITING_REVIEW");
  const onSite = jobs.filter((j) => j.status === "IN_PROGRESS");

  return (
    <RoleGate title="Safety & Permits">
      <div className="space-y-3">
        <PageHeader
          module="SAF-PTW"
          title="Safety & Permits"
          titleKey="page.safety"
          subtitleKey="page.safety.sub"
          subtitle="Permit-to-work register, evidence compliance for every sanctioned occupancy, and the combined block safety work order required before a line block is issued."
          crumbs={[{ label: "Safety" }, { label: "Permit to Work" }]}
          state={onSite.length > 0 ? `${onSite.length} possession(s) live` : "No possession in progress"}
          stateTone={onSite.length > 0 ? "warning" : "success"}
          reference={state.latestPlan ? `Plan #${state.latestPlan.id}` : "No plan published"}
        />

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Work orders total", value: jobs.length, sub: "permit-to-work records", tone: "info" as const },
            { label: "Possession live", value: onSite.length, sub: "crews on the line", tone: onSite.length ? ("warning" as const) : ("success" as const) },
            { label: "Awaiting sign-off", value: awaiting.length, sub: "inspector validation", tone: awaiting.length ? ("warning" as const) : ("success" as const) },
            { label: "Escalated permits", value: jobs.filter((j) => j.escalationLevel > 0).length, sub: "beyond allotted age", tone: jobs.some((j) => j.escalationLevel > 0) ? ("critical" as const) : ("success" as const) },
            { label: "Super-blocks to sanction", value: superBlocks.length, sub: "multi-department overlaps", tone: "ai" as const },
          ].map((k) => (
            <div key={k.label} className="panel px-3 py-2.5">
              <p className="flex items-center justify-between gap-2 text-[10.5px] font-bold uppercase tracking-wider text-faint">
                {k.label}
                <StatusPill label={k.tone === "success" ? "clear" : k.tone === "critical" ? "action" : "watch"} tone={k.tone} />
              </p>
              <p className="mt-1 font-mono text-xl font-bold leading-none text-ink">{k.value}</p>
              <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
            </div>
          ))}
        </section>

        <SafetyConsole blocks={blocks} jobs={jobs} fogMode={state.settings.fogMode} vipAlert={state.settings.vipAlert} />

        <section className="panel">
          <div className="panel-hd">
            <span>Statutory checks applied by the platform</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">advisory — divisional authority governs</span>
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              { t: "Block working & protection", d: "Combined block work order cites GR&SR 15.06 / 15.09 and Block Working Manual §4.2, with TSR and caution-order transmission recorded in the document." },
              { t: "Inter-department coordination", d: "Super-blocks require all listed disciplines (ENG / TRD / SNT) to accept a single occupancy; feasibility factors and any rejection reason are published on the Super Block page." },
              { t: "Photographic proof of work", d: "BEFORE and AFTER evidence is required per work order; the record stores GPS and timestamp for each capture." },
              { t: "Inspector validation", d: "A defect closes only after an inspector accepts the completed work, or moves to a documented rework edge." },
              { t: "Fog / visibility restriction", d: "When fog mode is enforced, physical-only maintenance is withheld by the planner and routed to remote inspection." },
              { t: "Protected movement protocol", d: "During a VVIP alert, sub-critical work within 5 km of NDLS / DLI / NZM is withheld; severity ≥ 8 continues under escort conditions." },
            ].map((r) => (
              <article key={r.t} className="border border-edge px-3 py-2.5">
                <p className="text-[11.5px] font-bold text-ink">{r.t}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-dim">{r.d}</p>
              </article>
            ))}
          </div>
          <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
            Latest sanctioned occupancies:{" "}
            {blocks.slice(0, 3).map((b) => `${b.segmentCode} D+${b.day} ${fmtMin(b.startMin)}–${fmtMin(b.endMin)}`).join(" · ") || "none published"}.{" "}
            <Link href="/audit" className="text-primary hover:underline">
              View the approval and audit trail
            </Link>
            .
          </div>
        </section>
      </div>
    </RoleGate>
  );
}
