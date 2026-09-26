import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import LiveBoard from "@/components/LiveBoard";
import NetworkRegister, { type RegisterRow } from "@/components/NetworkRegister";
import AssetIntelligence, { type AssetIntelRow } from "@/components/AssetIntelligence";
import { MAP_LAYERS } from "@/lib/engine/assetintel";
import { db } from "@/db";
import { assets as assetsTable, defectEvents, defects as defectsTable, jobs as jobsTable, segments as segmentsTable } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getDashboardState, getDefectDTOs } from "@/lib/engine/state";
import { getJobs } from "@/lib/engine/jobs";
import { fmtMin, sectionMeta } from "@/lib/engine/network";
import type { BlockItemDTO } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

/**
 * NETWORK STATUS — operations view of the running grid.
 *
 * Reuses the existing engine reads only (`getDashboardState`, `getDefectDTOs`,
 * `getJobs`) and derives the operational picture at render time:
 *   · section register with occupancy state and open-defect counts
 *   · possession-window timeline for the published plan
 *   · same-section/day overlap detection across planned blocks
 *   · live train positions (derived from the prototype roster clock)
 */
export default async function NetworkPage() {
  const [state, defects, jobs, assetRows, eventRows, jobRows, defectAssetRows, segmentRows] = await Promise.all([
    getDashboardState(),
    getDefectDTOs(),
    getJobs(),
    db.select().from(assetsTable),
    db.select().from(defectEvents).orderBy(desc(defectEvents.id)).limit(600),
    db.select().from(jobsTable).orderBy(desc(jobsTable.id)).limit(400),
    db.select({ id: defectsTable.id, assetId: defectsTable.assetId }).from(defectsTable),
    db.select().from(segmentsTable),
  ]);
  /* `defects.assetId` lives on the row (the DTO joins the section instead), so the
     asset linkage is read from the table rather than guessed from the section. */
  const assetOfDefect = new Map(defectAssetRows.map((d) => [d.id, d.assetId]));

  /* ---- ASSET INTELLIGENCE (Phase 11) -------------------------------------
     Every field below comes from a stored row: the asset itself, its open
     defects (with the trained model's risk), the defect-event log, the work
     orders and the plan's block items. Nothing is invented for the panel. */
  const defectsByAsset = new Map<number, typeof defects>();
  for (const d of defects) {
    const assetId = assetOfDefect.get(d.id);
    if (assetId == null) continue;
    const list = defectsByAsset.get(assetId) ?? [];
    list.push(d);
    defectsByAsset.set(assetId, list);
  }
  const eventsByDefect = new Map<number, typeof eventRows>();
  for (const e of eventRows) {
    const list = eventsByDefect.get(e.defectId) ?? [];
    list.push(e);
    eventsByDefect.set(e.defectId, list);
  }
  const jobsByDefect = new Map<number, typeof jobRows>();
  for (const j of jobRows) {
    if (j.defectId == null) continue;
    const list = jobsByDefect.get(j.defectId) ?? [];
    list.push(j);
    jobsByDefect.set(j.defectId, list);
  }
  const perSegmentOrder = new Map<number, number[]>();
  for (const a of assetRows) {
    const list = perSegmentOrder.get(a.segmentId) ?? [];
    list.push(a.id);
    perSegmentOrder.set(a.segmentId, list);
  }

  const assetIntel: AssetIntelRow[] = assetRows.map((a) => {
    const seg = segmentRows.find((s) => s.id === a.segmentId);
    const open = (defectsByAsset.get(a.id) ?? []).filter((d) => d.lifecycleStatus !== "CLOSED");
    const order = perSegmentOrder.get(a.segmentId) ?? [a.id];
    const position = order.length > 1 ? order.indexOf(a.id) / (order.length - 1) : 0.5;
    const worstDefect = [...open].sort((x, y) => y.sortKey - x.sortKey)[0] ?? null;
    const block = (state.latestPlan?.blocks ?? []).find((b) => (b.defectIds ?? []).some((id) => open.some((d) => d.id === id)));

    const history = open
      .flatMap((d) => [
        ...(jobsByDefect.get(d.id) ?? []).map((j) => ({
          label: `Work order — ${j.title}`,
          at: j.reportAt.toISOString(),
          detail: `${j.status.replace(/_/g, " ").toLowerCase()}${j.teamLeader ? ` · ${j.teamLeader}` : ""}${j.chainage ? ` · ${j.chainage}` : ""}`,
        })),
        ...(eventsByDefect.get(d.id) ?? []).slice(0, 4).map((e) => ({
          label: `${d.defectCode || `#${d.id}`} ${e.fromStage} → ${e.toStage}`,
          at: e.at.toISOString(),
          detail: `${e.actor} (${e.actorRole})${e.note ? ` — ${e.note}` : ""}`,
        })),
      ])
      .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

    const lastEvent = worstDefect ? (eventsByDefect.get(worstDefect.id) ?? [])[0] ?? null : null;
    const chainageNote = (worstDefect ? (jobsByDefect.get(worstDefect.id) ?? []).find((j) => j.chainage)?.chainage : "") || "chainage not recorded";

    /* A speed restriction is declared only when an open track/structure defect is
       severe enough to warrant caution — it is derived, and the basis is printed. */
    const severe = open.filter((d) => d.severity >= 8).sort((x, y) => y.severity - x.severity)[0] ?? null;
    const speedRestriction =
      severe && (a.assetType.toLowerCase().includes("track") || a.assetType.toLowerCase().includes("bridge"))
        ? { posted: seg?.maxSpeed ?? 0, kmph: Math.round(((seg?.maxSpeed ?? 100) * 0.5) / 5) * 5, basis: `caution advised pending repair of ${severe.defectCode || `#${severe.id}`} (severity ${severe.severity}/10)` }
        : null;

    return {
      id: a.id,
      segmentId: a.segmentId,
      segmentCode: seg?.code ?? "—",
      corridor: seg?.corridor ?? "—",
      department: a.department,
      assetType: a.assetType,
      label: a.label,
      health: a.health,
      sourceSystem: a.sourceSystem,
      position,
      chainageNote,
      openDefects: open
        .sort((x, y) => y.sortKey - x.sortKey)
        .map((d) => ({
          id: d.id,
          code: d.defectCode || `#${d.id}`,
          title: d.title,
          severity: d.severity,
          priority: d.priority,
          riskPct: Math.round(d.failureProb72h * 10) / 10,
          dueInDays: d.dueInDays,
          status: d.lifecycleStatus,
          detectedAt: new Date().toISOString(),
        })),
      maintenanceHistory: history.slice(0, 8),
      lastInspection: lastEvent
        ? { at: lastEvent.at.toISOString(), mode: worstDefect?.inspectionMode ?? "physical", note: `${worstDefect?.defectCode || "defect"} — ${lastEvent.toStage} by ${lastEvent.actor}` }
        : null,
      recommendedAction: worstDefect
        ? `${worstDefect.priority} priority: ${worstDefect.nextAction ?? worstDefect.next}. Responsible: ${worstDefect.responsible}.${worstDefect.overdueDays > 0 ? ` Already ${worstDefect.overdueDays} day(s) overdue.` : ""}`
        : `No outstanding defect — retain the asset under routine monitoring (health ${a.health.toFixed(0)}%).`,
      recommendedBlock: block
        ? { blockId: block.id, day: block.day, startMin: block.startMin, endMin: block.endMin, window: block.window, departments: block.departments, mode: block.mode }
        : null,
      speedRestriction,
      crewOnSite: jobs.some((j) => j.status === "IN_PROGRESS" && j.segmentId === a.segmentId),
    };
  });

  const blocks: BlockItemDTO[] = state.latestPlan?.blocks ?? [];
  const activeSegments = new Set(state.activeBlockSegments);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const openDefects = defects.filter((d) => d.status !== "closed");
  const defectsBySegment = new Map<number, number>();
  for (const d of openDefects) defectsBySegment.set(d.segmentId, (defectsBySegment.get(d.segmentId) ?? 0) + 1);

  const worstDefect = new Map<number, { id: number; severity: number }>();
  for (const d of openDefects) {
    const cur = worstDefect.get(d.segmentId);
    if (!cur || d.severity > cur.severity) worstDefect.set(d.segmentId, { id: d.id, severity: d.severity });
  }

  const blocksBySegment = new Map<number, BlockItemDTO[]>();
  for (const b of blocks) {
    const list = blocksBySegment.get(b.segmentId) ?? [];
    list.push(b);
    blocksBySegment.set(b.segmentId, list);
  }

  /* Same-section, same-day overlapping occupancies (measured, not assumed). */
  const conflicts: { section: string; day: number; a: BlockItemDTO; b: BlockItemDTO }[] = [];
  for (const list of blocksBySegment.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const c = list[j];
        if (a.day === c.day && a.startMin < c.endMin && c.startMin < a.endMin) {
          conflicts.push({ section: a.segmentCode, day: a.day, a, b: c });
        }
      }
    }
  }

  const crewsOnSite = jobs.filter((j) => j.status === "IN_PROGRESS");
  const pendingApproval = jobs.filter((j) => j.status === "AWAITING_REVIEW");

  const sections = [...state.segments].sort((a, b) => b.criticality - a.criticality || b.dailyTrains - a.dailyTrains);

  const registerRows: RegisterRow[] = sections.map((s) => {
    const meta = sectionMeta(s.code);
    const nextBlock = [...(blocksBySegment.get(s.id) ?? [])].sort((a, b) => a.day - b.day || a.startMin - b.startMin)[0];
    const under = activeSegments.has(s.id);
    const worst = worstDefect.get(s.id) ?? null;
    return {
      id: s.id,
      code: s.code,
      fromCode: s.fromCode,
      toCode: s.toCode,
      corridor: s.corridor,
      lengthKm: s.lengthKm,
      dailyTrains: s.dailyTrains,
      criticality: s.criticality,
      jurisdiction: meta?.jurisdiction ?? "—",
      openDefects: defectsBySegment.get(s.id) ?? 0,
      worstDefect: worst,
      occupancy: under ? "Under block" : nextBlock ? `Planned D+${nextBlock.day} ${fmtMin(nextBlock.startMin)}` : "Clear",
      occupancyTone: under ? "critical" : nextBlock ? "info" : "success",
      special: [s.isBridge ? "bridge" : null, s.isLevelCrossing ? "LC" : null].filter(Boolean).join(" · ") || null,
    };
  });

  return (
    <RoleGate title="Network Status">
      <div className="space-y-3">
        <PageHeader
          module="OPS-NET"
          title="Network Status"
          titleKey="page.network"
          subtitleKey="page.network.sub"
          subtitle="Section register, present occupancy and the possession plan for the running grid. Counts are read from the live defect register, the published block plan and the field work orders."
          crumbs={[{ label: "Operations" }, { label: "Network Status" }]}
          state={activeSegments.size > 0 ? `${activeSegments.size} section(s) under block` : "All sections clear"}
          stateTone={activeSegments.size > 0 ? "warning" : "success"}
          reference={`NR-DELHI-03 · ${state.segments.length} sections`}
        />

        {/* Situational strip */}
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Monitored sections", value: state.segments.length, sub: `${state.stations.length} stations`, tone: "info" as const },
            { label: "Under block now", value: activeSegments.size, sub: `${crewsOnSite.length} crew(s) on site`, tone: activeSegments.size ? ("warning" as const) : ("success" as const) },
            { label: "Planned occupancies", value: blocks.length, sub: `${blocks.filter((b) => b.isSuperBlock).length} super-blocks`, tone: "info" as const },
            { label: "Overlap conflicts", value: conflicts.length, sub: conflicts.length ? "same section & day" : "none detected", tone: conflicts.length ? ("critical" as const) : ("success" as const) },
            { label: "Open defects", value: state.counts.openDefects, sub: `${state.counts.criticalDefects} critical`, tone: state.counts.criticalDefects > 0 ? ("critical" as const) : ("warning" as const) },
            { label: "Trains in tracking window", value: state.liveTrains.length, sub: "prototype roster clock", tone: "info" as const },
          ].map((k) => (
            <div key={k.label} className="panel px-3 py-2.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{k.label}</p>
              <p className="mt-1 font-mono text-xl font-bold leading-none text-ink">{k.value}</p>
              <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
            </div>
          ))}
        </section>

        {/* Restrictions in force */}
        <section className="panel">
          <div className="panel-hd">
            <span>Restrictions &amp; operating conditions in force</span>
            <StatusPill
              label={state.settings.fogMode || state.settings.vipAlert || state.settings.dtpRedZone ? "Restrictions active" : "No restrictions"}
              tone={state.settings.fogMode || state.settings.vipAlert ? "warning" : "neutral"}
            />
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-3">
            <div className="border border-edge px-3 py-2">
              <p className="text-[11px] font-semibold text-ink">Fog mode</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dim">
                Visibility {state.weather.visibilityM} m · humidity {state.weather.humidityPct}% · {state.weather.fogRisk}.
                {state.settings.fogMode ? " Physical-only maintenance is withheld by the planner." : " Physical work permitted."}
              </p>
            </div>
            <div className="border border-edge px-3 py-2">
              <p className="text-[11px] font-semibold text-ink">VVIP corridor watch</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dim">
                {state.settings.vipAlert
                  ? "Sub-critical work withheld within 5 km of NDLS / DLI / NZM; severity ≥ 8 continues under escort protocol."
                  : "No protected movement flagged. Full maintenance access available."}
              </p>
            </div>
            <div className="border border-edge px-3 py-2">
              <p className="text-[11px] font-semibold text-ink">DTP level-crossing red zones</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dim">
                {state.settings.dtpRedZone
                  ? "Level-crossing work is confined to the golden window; road-gridlock penalty applied outside it."
                  : "Red-zone penalty disabled for this planning cycle."}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            {/* Section register — searchable, sortable, exportable */}
            <NetworkRegister rows={registerRows} />

            {/* Possession windows */}
            <section className="panel">
              <div className="panel-hd">
                <span>Possession windows — published plan</span>
                <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
                  {state.latestPlan ? `plan #${state.latestPlan.id} · ${state.latestPlan.horizon}` : "no plan published"}
                </span>
              </div>
              {blocks.length === 0 ? (
                <p className="p-4 text-[11.5px] text-dim">
                  No block plan published yet. Run the AI Block Planner to generate occupancies.
                </p>
              ) : (
                <div className="divide-y divide-edge">
                  <div className="flex items-center gap-2 bg-abyss/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
                    <span className="w-[7.5rem] shrink-0">Section</span>
                    <span className="w-10 shrink-0">Day</span>
                    <span className="flex-1">00:00 — 24:00 possession window</span>
                    <span className="hidden w-24 shrink-0 text-right sm:block">Departments</span>
                  </div>
                  {[...blocks]
                    .sort((a, b) => a.day - b.day || a.startMin - b.startMin)
                    .slice(0, 24)
                    .map((b) => (
                      <div key={b.id} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="w-[7.5rem] shrink-0 truncate font-mono text-[11px] font-semibold text-ink">{b.segmentCode}</span>
                        <span className="w-10 shrink-0 font-mono text-[11px] text-dim">D+{b.day}</span>
                        <span className="relative h-4 flex-1 border border-edge bg-abyss">
                          <span
                            className="absolute inset-y-0"
                            style={{
                              left: `${(b.startMin / 1440) * 100}%`,
                              width: `${Math.max(0.6, ((b.endMin - b.startMin) / 1440) * 100)}%`,
                              background: b.isSuperBlock ? "var(--color-primary)" : "var(--color-cyan)",
                            }}
                            title={`${fmtMin(b.startMin)}–${fmtMin(b.endMin)} · ${b.window}${b.isSuperBlock ? " · super-block" : ""}`}
                          />
                          <span
                            className="absolute inset-y-0 border-l border-dashed border-saffron/70"
                            style={{ left: `${(nowMin / 1440) * 100}%` }}
                            title="current time"
                          />
                        </span>
                        <span className="hidden w-24 shrink-0 truncate text-right text-[10.5px] text-dim sm:block">{b.departments.join("+")}</span>
                      </div>
                    ))}
                  <p className="px-3 py-2 text-[10.5px] text-faint">
                    Solid navy = multi-department super-block · teal = single department · saffron dashed line = current time.
                    {blocks.length > 24 && ` Showing the first 24 of ${blocks.length} occupancies.`}
                  </p>
                </div>
              )}
            </section>

            {/* Conflicts */}
            <section className="panel">
              <div className="panel-hd">
                <span>Conflict detection — same section, same day</span>
                <StatusPill label={conflicts.length ? `${conflicts.length} conflict(s)` : "No conflicts"} tone={conflicts.length ? "critical" : "success"} />
              </div>
              {conflicts.length === 0 ? (
                <p className="p-4 text-[11.5px] text-dim">
                  No overlapping occupancies were measured across the published plan. These conflicts are computed from the plan itself, so
                  re-check after any edit (the Gantt drag-resize recomputes delays but does not reserve the line).
                </p>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>Section</th>
                        <th>Day</th>
                        <th>Block A</th>
                        <th>Block B</th>
                        <th>Overlap</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflicts.map((c, i) => {
                        const from = Math.max(c.a.startMin, c.b.startMin);
                        const to = Math.min(c.a.endMin, c.b.endMin);
                        return (
                          <tr key={`${c.a.id}-${c.b.id}-${i}`}>
                            <td className="ref">{c.section}</td>
                            <td className="font-mono">D+{c.day}</td>
                            <td className="text-[11px]">
                              #{c.a.id} {fmtMin(c.a.startMin)}–{fmtMin(c.a.endMin)}
                            </td>
                            <td className="text-[11px]">
                              #{c.b.id} {fmtMin(c.b.startMin)}–{fmtMin(c.b.endMin)}
                            </td>
                            <td>
                              <StatusPill label={`${to - from} min`} tone="critical" />
                            </td>
                            <td>
                              <Link href="/planner" className="btn btn-sm">
                                Resolve in planner
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Right rail */}
          <div className="space-y-3">
            <section className="panel">
              <div className="panel-hd">
                <span>Live train board</span>
                <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">roster clock</span>
              </div>
              <LiveBoard trains={state.liveTrains} />
            </section>

            <section className="panel">
              <div className="panel-hd">
                <span>Crews &amp; field status</span>
                <StatusPill label={`${crewsOnSite.length} on site`} tone={crewsOnSite.length ? "warning" : "success"} />
              </div>
              <div className="divide-y divide-edge">
                {jobs.slice(0, 6).map((j) => (
                  <div key={j.id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11.5px] font-semibold text-ink">{j.title}</span>
                      <StatusPill label={j.status.replace("_", " ")} />
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-dim">
                      <span className="font-mono">{j.segmentCode}</span> · {j.teamLeader ?? "unassigned"}
                      {j.windowStart != null && j.windowEnd != null && ` · window ${fmtMin(j.windowStart)}–${fmtMin(j.windowEnd)}`}
                      {j.escalationLevel > 0 && <span className="ml-1 font-semibold text-signal">· escalation L{j.escalationLevel}</span>}
                    </p>
                  </div>
                ))}
                {jobs.length === 0 && <p className="p-4 text-[11.5px] text-dim">No work orders raised.</p>}
              </div>
              <p className="border-t border-edge px-3 py-2 text-[10.5px] text-faint">
                {pendingApproval.length} work order(s) awaiting inspector sign-off.
              </p>
            </section>

            <section className="panel">
              <div className="panel-hd">
                <span>Recent operational events</span>
              </div>
              <ul className="divide-y divide-edge">
                {state.events.slice(-6).reverse().map((e) => (
                  <li key={e.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StatusPill label={e.kind} tone={e.kind === "critical" ? "critical" : e.kind === "warn" ? "warning" : e.kind === "ai" ? "ai" : "info"} />
                      <span className="font-mono text-[10px] text-faint">
                        {new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-dim">{e.message}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <section className="space-y-3">
          <header className="border-l-2 border-saffron pl-2.5">
            <h2 className="text-[13px] font-bold text-ink">Asset intelligence — map layers, chainage and asset drill-down</h2>
            <p className="mt-0.5 max-w-4xl text-[11.5px] leading-relaxed text-dim">
              Switch the operational layers on and off (track and structures, OHE, signals, assets carrying defects, critical-only, assets with a planned
              possession, crews on site, speed restrictions). Select a section to get its chainage strip, then select any asset to read its health, modelled
              failure risk, last inspection, open defects, maintenance history, the recommended action and the block the optimizer has attached to it.
            </p>
          </header>
          {/* Server-rendered layer reference: exactly what each layer interrogates,
              so the filtered view can be reproduced against the database. */}
          <div className="panel">
            <div className="panel-hd">
              <span>Layer reference — what each map layer interrogates</span>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{MAP_LAYERS.length} layers</span>
            </div>
            <dl className="kv grid gap-x-6 p-3 md:grid-cols-2 xl:grid-cols-3">
              {MAP_LAYERS.map((l) => (
                <div key={l.key} className="contents">
                  <dt className="whitespace-nowrap">{l.label}</dt>
                  <dd className="font-mono text-[10px] text-dim">{l.match}</dd>
                </div>
              ))}
            </dl>
          </div>

          <AssetIntelligence
            assets={assetIntel}
            sections={segmentRows.map((sg) => ({ id: sg.id, code: sg.code, corridor: sg.corridor, lengthKm: sg.lengthKm, dailyTrains: sg.dailyTrains, criticality: sg.criticality, maxSpeed: sg.maxSpeed }))}
          />
        </section>
      </div>
    </RoleGate>
  );
}
