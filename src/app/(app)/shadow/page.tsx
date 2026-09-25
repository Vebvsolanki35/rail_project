import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import ShadowClient from "@/components/ShadowClient";
import { analyseShadow, shadowHistory, shadowInput, workedExample } from "@/lib/engine/shadowblock";

export const dynamic = "force-dynamic";

/**
 * SHADOW BLOCK INTELLIGENCE (Phase 4) — the combined possession that is possible.
 *
 * Every number on this screen is computed by the same wave packer the optimizer
 * uses; nothing here is a stored claim. The worked example below lets a controller
 * re-derive the arithmetic by hand before accepting it.
 */
export default async function ShadowPage() {
  const [sections, history] = await Promise.all([shadowInput(), shadowHistory(12)]);
  const analyses = analyseShadow(sections);
  const candidates = analyses.filter((a) => a.savedMin > 0 && a.compatible);
  const example = candidates[0] ?? analyses[0];
  const worked = workedExample(example);
  const combinableSections = analyses.filter((a) => a.departments.length > 1);

  return (
    <RoleGate title="Shadow Block Intelligence">
      <div className="space-y-3">
        <PageHeader
          module="AIP-SHD"
          title="Shadow Block Intelligence"
          titleKey="page.shadow"
          subtitleKey="page.shadow.sub"
          subtitle="For every section the engine takes all open work, decides what is physically compatible, packs the compatible tasks into parallel waves and compares that against one possession per task. The difference is the time a shadow block would save — and the trains it would not delay."
          crumbs={[{ label: "AI Planning" }, { label: "Shadow Block Intelligence" }]}
          state={candidates.length > 0 ? `${candidates.length} section(s) where a combined block pays` : "no combination saves time in this register"}
          stateTone={candidates.length > 0 ? "success" : "info"}
          reference={`${combinableSections.length} multi-department section(s) · potential saving ${candidates.reduce((s, a) => s + a.savedMin, 0)} min · ${candidates.reduce((s, a) => s + a.duplicatePossessionsAvoided, 0)} duplicate possession(s) avoidable`}
          actions={
            <>
              <Link href="/blocks" className="btn btn-xs">
                Raise a request
              </Link>
              <Link href="/planner" className="btn btn-xs">
                See it in the plan
              </Link>
            </>
          }
        />

        {/* Worked example — the arithmetic the officer can re-derive */}
        {example && (
          <section className="panel">
            <div className="panel-hd">
              <span>Worked arithmetic — {example.segmentCode}</span>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
                {worked ? `${worked.lines.join("  +  ")}  =  ${worked.independentMin} independent  →  ${worked.combinedMin} combined  →  ${worked.savedMin} saved (min)` : "one possession per department vs. one combined possession"}
              </span>
            </div>
            <div className="grid gap-3 p-3 lg:grid-cols-3">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">1. Work actually due</p>
                <table className="gov-table mt-1.5">
                  <thead>
                    <tr>
                      <th>Dept</th>
                      <th className="num">Tasks</th>
                      <th className="num">Work duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {example.breakdown.map((b) => (
                      <tr key={b.department}>
                        <td className="font-semibold">{b.department}</td>
                        <td className="num font-mono">{b.tasks}</td>
                        <td className="num font-mono">{b.durationMin} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">2. Independent possessions</p>
                <p className="mt-1.5 font-mono text-[13px] font-bold text-ink">
                  {example.breakdown.reduce((s, b) => s + b.durationMin, 0)} min of work + {example.tasks.length} × setup = {example.independentMin} min
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-dim">
                  Each department asks for its own window: {example.tasks.length} separate blocks on {example.segmentCode}, each one costing full setup and a fresh
                  traffic block. Train delay under this choice: <span className="font-mono text-signal">{example.trainDelayIndependentMin} min</span>.
                </p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">3. Combined (shadow) possession</p>
                <p className="mt-1.5 font-mono text-[13px] font-bold text-mint">
                  {example.waves.length} wave(s) → {example.combinedMin} min
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-dim">
                  Compatible departments work in parallel inside each wave; waves run back-to-back with spacing for machine movement and block handover. Saved{" "}
                  <span className="font-mono font-bold text-mint">{example.savedMin} min ({example.savedPct}%)</span>, avoiding{" "}
                  <span className="font-mono">{example.duplicatePossessionsAvoided}</span> duplicate possession(s) of this section.
                </p>
                <p className="mt-1 text-[11.5px] text-dim">
                  Train delay falls to <span className="font-mono text-mint">{example.trainDelayCombinedMin} min</span> — a{" "}
                  <span className="font-mono">{example.trainDelaySavedMin} min</span> reduction because the section is handed back once, not {example.tasks.length} times.
                </p>
              </div>
            </div>
            <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              Formula used by the engine: combined = max(task duration per wave) + {example.waves.length > 0 ? "15 min first-wave setup" : "setup"} + 8 min × (waves − 1). {example.note}
            </div>
          </section>
        )}

        {analyses.length > 0 && <ShadowClient initial={analyses} />}

        <section className="panel">
          <div className="panel-hd">
            <span>Shadow block history</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{history.length} stored analysis(es) · ref RR-SHD</span>
          </div>
          <div className="gov-table-wrap">
            <table className="gov-table">
              <thead>
                <tr>
                  <th className="sr">Sr</th>
                  <th>Reference</th>
                  <th>Section</th>
                  <th>Departments</th>
                  <th className="num">Independent</th>
                  <th className="num">Combined</th>
                  <th className="num">Saved</th>
                  <th className="num">Dup. poss.</th><th className="num">Tasks</th>
                  <th>Analysed (IST)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id}>
                    <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                    <td className="ref">{h.ref}</td>
                    <td className="font-mono text-[11px]">{sections.find((x) => x.segmentId === h.segmentId)?.segmentCode ?? `#${h.segmentId}`}</td>
                    <td className="text-[10.5px]">{h.departments.join(" + ")}</td>
                    <td className="num font-mono">{h.independentMin} m</td>
                    <td className="num font-mono">{h.combinedMin} m</td>
                    <td className="num font-mono text-mint">{h.savedMin} m</td>
                    <td className="num font-mono">{h.duplicatePossessionsAvoided}</td>
                    <td className="num font-mono">{h.tasks}</td>
                    <td className="whitespace-nowrap font-mono text-[10px]">
                      {new Date(h.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-[11.5px] text-faint">
                      No analysis stored yet — run one from the register above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </RoleGate>
  );
}
