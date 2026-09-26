import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import { db } from "@/db";
import { assets, defectEvents, defects, segments } from "@/db/schema";
import { getDashboardState } from "@/lib/engine/state";
import { planHistory } from "@/lib/engine/replan";

export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, "critical" | "warning" | "ai" | "info"> = {
  critical: "critical",
  warn: "warning",
  ai: "ai",
  info: "info",
};

const KIND_LABEL: Record<string, string> = {
  critical: "Critical",
  warn: "Warning",
  ai: "AI recommendation",
  info: "Information",
};

/** Human decision markers written into the operational event feed. */
const DECISION_MARKERS = ["APPROVED by DRM", "HUMAN VETO", "PLAN REJECTED", "DYNAMIC RE-PLAN", "SUBMITTED FOR APPROVAL"];

/**
 * APPROVALS & AUDIT TRAIL
 *
 * The accountability desk. Everything here is read-only and append-only in the
 * database: plan decisions and operational events (`events`), defect lifecycle
 * transitions (`defect_events`), and the full plan version lineage with the
 * change diff and trigger note recorded when each version superseded the last.
 *
 * A register a reviewer can sort through by classification (`?kind=critical`)
 * or inspect in full.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ kind?: string; view?: string }> }) {
  const { kind, view } = await searchParams;
  const [state, history, lifecycle, defectRows] = await Promise.all([
    getDashboardState(),
    planHistory(12),
    db
      .select({
        id: defectEvents.id,
        defectId: defectEvents.defectId,
        fromStage: defectEvents.fromStage,
        toStage: defectEvents.toStage,
        actor: defectEvents.actor,
        actorRole: defectEvents.actorRole,
        note: defectEvents.note,
        at: defectEvents.at,
        defectCode: defects.defectCode,
        title: defects.title,
        severity: defects.severity,
        priority: defects.priority,
        segmentCode: segments.code,
      })
      .from(defectEvents)
      .leftJoin(defects, eq(defectEvents.defectId, defects.id))
      .leftJoin(assets, eq(defects.assetId, assets.id))
      .leftJoin(segments, eq(assets.segmentId, segments.id))
      .orderBy(desc(defectEvents.at))
      .limit(120),
    db.select({ id: defects.id, priority: defects.priority, lifecycleStatus: defects.lifecycleStatus }).from(defects).orderBy(asc(defects.id)),
  ]);
  const priorityMix = defectRows.reduce<Record<string, number>>((acc, d) => {
    acc[d.priority] = (acc[d.priority] ?? 0) + 1;
    return acc;
  }, {});

  const events = [...state.events].reverse();
  const decisions = events.filter((e) => DECISION_MARKERS.some((m) => e.message.toUpperCase().includes(m)));
  const filtered = kind ? events.filter((e) => e.kind === kind) : events;
  const counts = { critical: 0, warn: 0, ai: 0, info: 0 } as Record<string, number>;
  for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  const planStatus = state.settings.planStatus ?? "PROPOSED";

  const tabs = [
    { key: "decisions", label: "Plan decisions", count: decisions.length },
    { key: "lineage", label: "Plan versions", count: history.length },
    { key: "defects", label: "Defect lifecycle audit", count: lifecycle.length },
    { key: "events", label: "Operational event ledger", count: events.length },
  ];
  const activeView = view && tabs.some((t) => t.key === view) ? view : "decisions";

  return (
    <RoleGate title="Approvals & Audit Trail">
      <div className="space-y-3">
        <PageHeader
          module="ADM-AUD"
          title="Approvals &amp; Audit Trail"
          subtitle="Every plan decision, defect stage transition, field sign-off and operational event is recorded against the actor, role and timestamp that produced it. Records are appended, never rewritten — the desk exists so a decision can always be reconstructed."
          crumbs={[{ label: "Administration" }, { label: "Approvals & Audit Trail" }]}
          state={
            planStatus === "APPROVED"
              ? "Current plan approved by DRM"
              : planStatus === "VETOED"
                ? "Current plan rejected by DRM"
                : "Current plan awaiting divisional decision"
          }
          stateTone={planStatus === "APPROVED" ? "success" : planStatus === "VETOED" ? "critical" : "warning"}
          reference={`${events.length} events · ${history.length} plan versions · ${lifecycle.length} lifecycle records`}
        />

        {/* Register summary */}
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Plan decision state", value: planStatus, sub: "settings.planStatus", tone: planStatus === "APPROVED" ? ("success" as const) : planStatus === "VETOED" ? ("critical" as const) : ("warning" as const) },
            { label: "Recorded decisions", value: String(decisions.length), sub: "approvals · vetoes · re-plans", tone: "info" as const },
            { label: "Critical events", value: String(counts.critical ?? 0), sub: `${counts.warn ?? 0} warning · ${counts.ai ?? 0} AI`, tone: (counts.critical ?? 0) > 0 ? ("critical" as const) : ("success" as const) },
            { label: "Plan versions", value: String(history.length), sub: history[0]?.supersedesId ? `latest supersedes #${history[0].supersedesId}` : "initial publication", tone: "ai" as const },
            { label: "Lifecycle transitions", value: String(lifecycle.length), sub: "defect_events rows", tone: "info" as const },
          ].map((k) => (
            <div key={k.label} className="panel px-3 py-2.5">
              <p className="flex items-center justify-between gap-2 text-[10.5px] font-bold uppercase tracking-wider text-faint">
                {k.label}
                <StatusPill label={k.tone === "success" ? "ok" : k.tone === "critical" ? "attention" : "recorded"} tone={k.tone} />
              </p>
              <p className="mt-1 font-mono text-[17px] font-bold leading-none text-ink">{k.value}</p>
              <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
            </div>
          ))}
        </section>

        {/* Tabs */}
        <nav aria-label="Audit sections" className="flex flex-wrap items-stretch gap-0 border border-edge bg-panel">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/audit?view=${t.key}`}
              aria-current={activeView === t.key ? "page" : undefined}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-[11.5px] font-semibold ${
                activeView === t.key ? "border-saffron bg-saffron/[0.06] text-saffron" : "border-transparent text-dim hover:bg-primary/[0.04] hover:text-ink"
              }`}
            >
              {t.label}
              <span className="rounded-[2px] border border-edge bg-abyss px-1 py-[1px] font-mono text-[9.5px] text-faint">{t.count}</span>
            </Link>
          ))}
        </nav>

        {/* ── Plan decisions ── */}
        {activeView === "decisions" && (
          <section className="panel">
            <div className="panel-hd">
              <span>Plan decision register</span>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">approvals · vetoes · submissions · re-plans</span>
            </div>
            <div className="gov-table-wrap">
              <table className="gov-table">
                <caption className="sr-only">Plan and operational decisions with actor and timestamp</caption>
                <thead>
                  <tr>
                    <th className="sr">Sr</th>
                    <th>Timestamp (IST)</th>
                    <th>Classification</th>
                    <th>Decision recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.slice(0, 30).map((e, i) => (
                    <tr key={e.id}>
                      <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                      <td className="whitespace-nowrap font-mono text-[10.5px]">
                        {new Date(e.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                      </td>
                      <td>
                        <StatusPill label={KIND_LABEL[e.kind] ?? e.kind} tone={KIND_TONE[e.kind] ?? "info"} />
                      </td>
                      <td className="text-[11.5px] text-ink">{e.message}</td>
                    </tr>
                  ))}
                  {decisions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[11.5px] text-faint">
                        No plan decision has been recorded yet. Approve, reject or override a plan from the AI Block Planner to open the record.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              Decision entries are written by the platform when a divisional officer approves (<span className="font-mono">/api/veto mode=APPROVED</span>),
              rejects or overrides (<span className="font-mono">mode=VETOED</span> with a reason), and when a re-plan publishes a new version.
            </div>
          </section>
        )}

        {/* ── Plan lineage ── */}
        {activeView === "lineage" && (
          <section className="panel">
            <div className="panel-hd">
              <span>Plan version lineage</span>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">committed blocks stay frozen across versions</span>
            </div>
            <div className="gov-table-wrap">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th className="sr">Sr</th>
                    <th>Version</th>
                    <th>Horizon</th>
                    <th>Supersedes</th>
                    <th>Trigger recorded</th>
                    <th>Change summary</th>
                    <th className="num">Resilience</th>
                    <th>Published</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((p, i) => (
                    <tr key={p.id}>
                      <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                      <td className="ref">
                        #{p.id}
                        {i === 0 && <span className="ml-1.5 align-middle"><StatusPill label="current" tone="success" /></span>}
                      </td>
                      <td className="text-[11px]">{p.horizon}</td>
                      <td className="font-mono text-[11px]">{p.supersedesId ? `#${p.supersedesId}` : "initial"}</td>
                      <td className="max-w-[22rem] text-[11px] text-dim">{p.triggerNote ?? "initial publication"}</td>
                      <td className="text-[10.5px] text-dim">
                        {p.diff ? (
                          <>
                            <span className="text-mint">+{p.diff.added.length}</span> added ·{" "}
                            <span className="text-signal">−{p.diff.removed.length}</span> removed · {p.diff.moved.length} moved ·{" "}
                            <span className="text-saffron">{p.diff.frozen.length}</span> frozen
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">{Math.round(p.resilienceScore)}</td>
                      <td className="whitespace-nowrap font-mono text-[10.5px]">
                        {new Date(p.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[11.5px] text-faint">
                        No plan has been published yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Defect lifecycle audit ── */}
        {activeView === "defects" && (
          <section className="panel">
            <div className="panel-hd">
              <span>Defect lifecycle audit</span>
              <StatusPill label="append-only" tone="success" />
            </div>
            <div className="gov-table-wrap max-h-[36rem]">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th className="sr">Sr</th>
                    <th>Defect</th>
                    <th>Section</th>
                    <th>Transition</th>
                    <th>Actor</th>
                    <th>Desk role</th>
                    <th>Note recorded</th>
                    <th>Timestamp (IST)</th>
                  </tr>
                </thead>
                <tbody>
                  {lifecycle.map((r, i) => (
                    <tr key={r.id}>
                      <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                      <td>
                        <Link href={`/defects/${r.defectId}`} className="ref hover:underline">
                          {r.defectCode ?? `#${r.defectId}`}
                        </Link>
                        <span className="mt-0.5 block max-w-[18rem] truncate text-[10.5px] text-faint">{r.title ?? "—"}</span>
                      </td>
                      <td className="font-mono text-[11px]">
                        {r.segmentCode ?? "—"}
                        {r.severity != null && <span className="ml-1 font-mono text-[10px] text-faint">sev {r.severity}/10</span>}
                      </td>
                      <td className="text-[10.5px] text-dim">
                        {r.fromStage.replace(/_/g, " ")} → <span className="font-semibold text-ink">{r.toStage.replace(/_/g, " ")}</span>
                      </td>
                      <td className="max-w-[14rem] truncate text-[11px]">{r.actor}</td>
                      <td className="text-[10.5px] text-dim">{r.actorRole}</td>
                      <td className="max-w-[20rem] text-[10.5px] text-dim">{r.note || "—"}</td>
                      <td className="whitespace-nowrap font-mono text-[10.5px]">
                        {new Date(r.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                      </td>
                    </tr>
                  ))}
                  {lifecycle.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[11.5px] text-faint">
                        No lifecycle transition recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              <span>
                Defect register: {defectRows.length} record(s) —{" "}
                {Object.entries(priorityMix)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </span>
              <span>Stage adjacency is enforced server-side, so this register cannot contain an impossible jump.</span>
            </div>
          </section>
        )}

        {/* ── Operational event ledger ── */}
        {activeView === "events" && (
          <section className="panel">
            <div className="panel-hd">
              <span>Operational event ledger</span>
              <span className="flex flex-wrap items-center gap-1">
                {(["critical", "warn", "ai", "info"] as const).map((k) => (
                  <Link
                    key={k}
                    href={kind === k ? "/audit?view=events" : `/audit?view=events&kind=${k}`}
                    aria-pressed={kind === k}
                    className={`border px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase ${
                      kind === k ? "border-primary bg-primary/[0.08] text-primary" : "border-edge text-dim hover:border-primary hover:text-primary"
                    }`}
                  >
                    {k} {counts[k] ?? 0}
                  </Link>
                ))}
                {kind && (
                  <Link href="/audit?view=events" className="btn-link text-[10px]">
                    clear filter
                  </Link>
                )}
              </span>
            </div>
            <div className="gov-table-wrap max-h-[36rem]">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th className="sr">Sr</th>
                    <th>Timestamp (IST)</th>
                    <th>Classification</th>
                    <th>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 80).map((e, i) => (
                    <tr key={e.id}>
                      <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                      <td className="whitespace-nowrap font-mono text-[10.5px]">
                        {new Date(e.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                      </td>
                      <td>
                        <StatusPill label={KIND_LABEL[e.kind] ?? e.kind} tone={KIND_TONE[e.kind] ?? "info"} />
                      </td>
                      <td className="text-[11.5px] text-ink">{e.message}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[11.5px] text-faint">
                        No events of this classification have been recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              Showing the most recent {Math.min(filtered.length, 80)} of {filtered.length} matching entries
              {kind ? ` (filtered to ${kind})` : ""}. Every desk action, field report and planning decision appends to this ledger.
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-hd">
            <span>How to read this desk</span>
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-3">
            {[
              { t: "Actor and role are always recorded", d: "Rows carry the acting name and desk role, so a decision can be attributed without reference to any other system." },
              { t: "Nothing is silently edited", d: "Defect transitions are appended; a correction appears as a further transition, not as an overwrite of history." },
              { t: "Decisions explain themselves", d: "Approvals, vetoes and overrides store the reason supplied at the time, alongside the plan version they apply to." },
            ].map((r) => (
              <article key={r.t} className="border border-edge px-3 py-2.5">
                <p className="text-[11.5px] font-bold text-ink">{r.t}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-dim">{r.d}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </RoleGate>
  );
}
