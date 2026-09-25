"use client";

/**
 * ASSET INTELLIGENCE (Phase 11) — filterable asset picture over the corridor.
 *
 * The filters are operational layers, not decoration: each one narrows a real
 * projection of the live register (assets, open defects, planned/active blocks,
 * speed restrictions, crews on site). Selecting an asset opens its health, risk,
 * last inspection, open defects, maintenance history, the recommended action and
 * the block the optimizer has given it.
 *
 * The horizontal diagram is a chainage strip: distance from the section's origin
 * runs left to right, so an officer can see WHERE on the section the work sits.
 */
import { useMemo, useState } from "react";
import { Activity, CircleDot, Gauge, HardHat, Radar, Route, Wrench, Zap } from "lucide-react";
import StatusPill from "./StatusPill";
import { MAP_LAYERS, type MapLayerKey } from "@/lib/engine/assetintel";

export interface AssetIntelRow {
  id: number;
  segmentId: number;
  segmentCode: string;
  corridor: string;
  department: string;
  assetType: string;
  label: string;
  health: number;
  sourceSystem: string;
  /** 0..1 position along the section — register order; surveyed chainage is not
   *  recorded for every asset, and the caption says so. */
  position: number;
  chainageNote: string;
  openDefects: { id: number; code: string; title: string; severity: number; priority: string; riskPct: number; dueInDays: number; status: string; detectedAt: string }[];
  maintenanceHistory: { label: string; at: string; detail: string }[];
  lastInspection: { at: string; mode: string; note: string } | null;
  recommendedAction: string;
  recommendedBlock: { blockId: number; day: number; startMin: number; endMin: number; window: string; departments: string[]; mode: string } | null;
  speedRestriction: { posted: number; kmph: number; basis: string } | null;
  crewOnSite: boolean;
}

const DEPT_ICON: Record<string, typeof Wrench> = { ENG: Wrench, TRD: Zap, SNT: Radar };

function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default function AssetIntelligence({
  assets,
  sections,
}: {
  assets: AssetIntelRow[];
  sections: { id: number; code: string; corridor: string; lengthKm: number; dailyTrains: number; criticality: number; maxSpeed: number }[];
}) {
  /* The layer definitions come from the shared engine vocabulary, so the desk and
     the verification suite always describe the same filters. */
  const [layers, setLayers] = useState<Record<MapLayerKey, boolean>>(
    Object.fromEntries(MAP_LAYERS.map((l) => [l.key, l.defaultOn])) as Record<MapLayerKey, boolean>
  );
  const [sectionId, setSectionId] = useState<number | "ALL">("ALL");
  const [selected, setSelected] = useState<number | null>(null);
  const [dept, setDept] = useState<"ALL" | "ENG" | "TRD" | "SNT">("ALL");

  const visible = useMemo(() => {
    return assets.filter((a) => {
      if (sectionId !== "ALL" && a.segmentId !== sectionId) return false;
      if (dept !== "ALL" && a.department !== dept) return false;
      const type = a.assetType.toLowerCase();
      if (type.includes("track") || type.includes("rail") || type.includes("bridge") || type.includes("points") ? !layers.track : false) return false;
      if ((type.includes("ohe") || type.includes("power") || a.department === "TRD") && !layers.ohe && a.assetType.toLowerCase().includes("ohe")) return false;
      if ((type.includes("signal") || a.department === "SNT") && !layers.signal && (type.includes("signal") || type.includes("telecom"))) return false;
      if (layers.defects && a.openDefects.length === 0) return false;
      if (layers.critical && !a.openDefects.some((d) => d.priority === "CRITICAL")) return false;
      if (layers.activeBlocks && !a.crewOnSite) return false;
      if (layers.critical && a.openDefects.length === 0) return false;
      if (layers.speedRestrictions && !a.speedRestriction) return false;
      if (layers.plannedBlocks && !a.recommendedBlock) return false;
      return true;
    });
  }, [assets, sectionId, dept, layers]);

  const active = selected != null ? assets.find((a) => a.id === selected) ?? null : null;
  const section = active ? sections.find((s) => s.id === active.segmentId) ?? null : null;
  const stripSection = sectionId === "ALL" ? null : sections.find((s) => s.id === sectionId) ?? null;
  const stripAssets = stripSection ? visible.filter((a) => a.segmentId === stripSection.id) : [];

  const ICONS: Record<MapLayerKey, typeof Route> = {
    track: Route,
    ohe: Zap,
    signal: Radar,
    defects: Activity,
    critical: CircleDot,
    plannedBlocks: Wrench,
    activeBlocks: HardHat,
    speedRestrictions: Gauge,
    crews: HardHat,
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <section className="panel">
        <div className="panel-hd">
          <span>Map layers &amp; filters</span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
            {visible.length} of {assets.length} asset(s) shown
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Section</span>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))} className="mt-1 border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink">
              <option value="ALL">Division (all sections)</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.corridor}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Department</span>
            <select value={dept} onChange={(e) => setDept(e.target.value as typeof dept)} className="mt-1 border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink">
              {(["ALL", "ENG", "TRD", "SNT"] as const).map((d) => (
                <option key={d} value={d}>
                  {d === "ALL" ? "All departments" : d}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MAP_LAYERS.map((l) => {
              const Icon = ICONS[l.key];
              return (
                <button
                  key={l.key}
                  onClick={() => setLayers((s) => ({ ...s, [l.key]: !s[l.key] }))}
                  title={l.match}
                  className={`btn btn-xs ${layers[l.key] ? "btn-primary" : ""}`}
                  aria-pressed={layers[l.key]}
                >
                  <Icon size={10} aria-hidden /> {l.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Chainage strip for the selected section */}
      {stripSection && (
        <section className="panel">
          <div className="panel-hd">
            <span>
              Chainage diagram — {stripSection.code} ({stripSection.lengthKm} km, {stripSection.dailyTrains} trains/day, max speed {stripSection.maxSpeed} km/h)
            </span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
              every asset on the section is drawn at its position; markers are clickable
            </span>
          </div>
          <div className="p-3">
            <div className="relative h-24 border border-edge bg-abyss">
              {/* track line */}
              <span className="absolute left-3 right-3 top-1/2 block h-[3px] -translate-y-1/2 bg-primary/40" aria-hidden />
              {/* km ticks */}
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <span key={f} className="absolute bottom-1 -translate-x-1/2 font-mono text-[9px] text-faint" style={{ left: `${3 + f * 94}%` }}>
                  {Math.round(f * stripSection.lengthKm * 10) / 10} km
                </span>
              ))}
              {stripAssets.map((a) => {
                const Icon = DEPT_ICON[a.department] ?? Wrench;
                const crit = a.openDefects.some((d) => d.priority === "CRITICAL");
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a.id)}
                    title={`${a.label} · ${a.department} · health ${a.health.toFixed(0)}%`}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 border px-1 py-0.5 text-[9px] font-bold ${crit ? "border-signal bg-signal text-on-accent" : a.openDefects.length ? "border-saffron bg-saffron text-on-accent" : "border-mint bg-mint text-on-accent"}`}
                    style={{ left: `${3 + a.position * 94}%` }}
                  >
                    <Icon size={9} aria-hidden />
                    <span className="ml-0.5">{a.department}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
              Assets are drawn in register order along the section: the prototype register does not carry a surveyed chainage for every asset record, so the
              strip is a schematic of ORDER, not of surveyed distance — where a work order records chainage it is printed in the asset panel. Green marker =
              healthy, saffron = open defect, red = critical-priority defect. Click any marker for the full asset intelligence panel.
            </p>
          </div>
        </section>
      )}

      <section className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        {/* Asset register */}
        <section className="panel">
          <div className="panel-hd">
            <span>Asset register — filtered</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">health, risk and the work attached to it</span>
          </div>
          <div className="gov-table-wrap max-h-[34rem]">
            <table className="gov-table">
              <thead>
                <tr>
                  <th className="sr">Sr</th>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Section</th>
                  <th className="num">Health</th>
                  <th className="num">Open</th>
                  <th className="num">Worst risk</th>
                  <th>Last inspection</th>
                  <th>Block</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a, i) => {
                  const worst = a.openDefects.reduce((m, d) => Math.max(m, d.riskPct), 0);
                  return (
                    <tr key={a.id} className={selected === a.id ? "bg-primary/[0.06]" : undefined}>
                      <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                      <td>
                        <button onClick={() => setSelected(a.id)} className="text-left text-[11px] font-semibold text-primary underline-offset-2 hover:underline">
                          {a.label}
                        </button>
                        <span className="mt-0.5 block font-mono text-[9.5px] text-faint">
                          {a.department} · {a.sourceSystem} · {a.chainageNote}
                        </span>
                      </td>
                      <td className="text-[10.5px] text-dim">{a.assetType}</td>
                      <td className="font-mono text-[10.5px]">{a.segmentCode}</td>
                      <td className="num">
                        <span className="flex items-center justify-end gap-1.5">
                          <span className="block h-1.5 w-12 border border-edge bg-abyss" aria-hidden>
                            <span className={`block h-full ${a.health >= 85 ? "bg-mint" : a.health >= 65 ? "bg-saffron" : "bg-signal"}`} style={{ width: `${Math.min(100, a.health)}%` }} />
                          </span>
                          <span className="font-mono">{a.health.toFixed(0)}%</span>
                        </span>
                      </td>
                      <td className="num font-mono">{a.openDefects.length}</td>
                      <td className={`num font-mono ${worst >= 60 ? "text-signal" : worst >= 40 ? "text-saffron" : "text-faint"}`}>{worst ? `${worst}%` : "—"}</td>
                      <td className="whitespace-nowrap font-mono text-[10px] text-dim">
                        {a.lastInspection ? new Date(a.lastInspection.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                      </td>
                      <td className="font-mono text-[10px]">
                        {a.recommendedBlock ? `#${a.recommendedBlock.blockId} D${a.recommendedBlock.day + 1} ${fmt(a.recommendedBlock.startMin)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-[11.5px] text-faint">
                      No asset matches the selected layers. Switch a layer on or clear the section filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Asset detail */}
        <section className="panel">
          <div className="panel-hd">
            <span>{active ? `Asset intelligence — ${active.label}` : "Asset intelligence"}</span>
            {active && (
              <button onClick={() => setSelected(null)} className="btn btn-xs">
                Close
              </button>
            )}
          </div>
          {!active ? (
            <p className="p-6 text-center text-[11.5px] text-faint">
              Select an asset on the chainage diagram or in the register to see its health, risk, inspection history, open defects, recommended action and the
              block the optimizer has attached to it.
            </p>
          ) : (
            <div className="space-y-3 p-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Health", value: `${active.health.toFixed(0)}%`, sub: `source ${active.sourceSystem}` },
                  { label: "Open defects", value: String(active.openDefects.length), sub: active.openDefects.filter((d) => d.priority === "CRITICAL").length + " critical" },
                  { label: "Worst failure risk", value: `${active.openDefects.reduce((m, d) => Math.max(m, d.riskPct), 0)}%`, sub: "72-hour model probability" },
                  { label: "Section", value: active.segmentCode, sub: active.corridor },
                ].map((k) => (
                  <div key={k.label} className="border border-edge px-2.5 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-faint">{k.label}</p>
                    <p className="mt-1 font-mono text-[15px] font-bold leading-none text-ink">{k.value}</p>
                    <p className="mt-0.5 text-[10px] text-dim">{k.sub}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Last inspection</p>
                <p className="mt-1 text-[11.5px] text-ink">
                  {active.lastInspection ? (
                    <>
                      <span className="font-mono">{new Date(active.lastInspection.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</span> ·{" "}
                      {active.lastInspection.mode} · {active.lastInspection.note}
                    </>
                  ) : (
                    "No inspection on record for this asset in the current register."
                  )}
                </p>
              </div>

              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Open defects</p>
                <table className="gov-table mt-1">
                  <thead>
                    <tr>
                      <th>Defect</th>
                      <th>Priority</th>
                      <th className="num">Sev</th>
                      <th className="num">Risk</th>
                      <th className="num">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.openDefects.map((d) => (
                      <tr key={d.id}>
                        <td className="text-[10.5px]">
                          <a href={`/defects/${d.id}`} className="text-primary hover:underline">
                            {d.code}
                          </a>
                          <span className="mt-0.5 block text-[10px] text-faint">{d.title}</span>
                        </td>
                        <td>
                          <StatusPill label={d.priority} tone={d.priority === "CRITICAL" ? "critical" : d.priority === "HIGH" ? "warning" : "info"} />
                        </td>
                        <td className="num font-mono">{d.severity}</td>
                        <td className="num font-mono">{d.riskPct}%</td>
                        <td className={`num font-mono ${d.dueInDays < 0 ? "text-signal" : "text-dim"}`}>{d.dueInDays} d</td>
                      </tr>
                    ))}
                    {active.openDefects.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-[11px] text-mint">
                          No open defect on this asset.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Maintenance history</p>
                <ul className="mt-1 space-y-0.5">
                  {active.maintenanceHistory.slice(0, 6).map((h) => (
                    <li key={`${h.label}-${h.at}`} className="flex items-start gap-2 text-[10.5px]">
                      <span className="font-mono text-faint">{new Date(h.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                      <span className="text-ink">{h.label}</span>
                      <span className="text-dim">{h.detail}</span>
                    </li>
                  ))}
                  {active.maintenanceHistory.length === 0 && <li className="text-[11px] text-faint">No maintenance recorded against this asset yet.</li>}
                </ul>
              </div>

              <div className="border border-ai/40 bg-ai/[0.06] px-2.5 py-2">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-ai">Recommended action · AI RECOMMENDATION / HUMAN REVIEW REQUIRED</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink">{active.recommendedAction}</p>
                {active.recommendedBlock && (
                  <p className="mt-1 font-mono text-[10.5px] text-dim">
                    Planned block #{active.recommendedBlock.blockId} · day {active.recommendedBlock.day + 1}{" "}
                    {fmt(active.recommendedBlock.startMin)}–{fmt(active.recommendedBlock.endMin)} ({active.recommendedBlock.window}) ·{" "}
                    {active.recommendedBlock.departments.join("+")} · {active.recommendedBlock.mode}
                  </p>
                )}
              </div>

              {active.speedRestriction && (
                <p className="border border-saffron/40 bg-saffron/[0.06] px-2.5 py-2 text-[11px] text-ink">
                  <span className="font-bold">Speed restriction:</span> {active.speedRestriction.kmph} km/h against a posted {active.speedRestriction.posted} km/h — {active.speedRestriction.basis}
                </p>
              )}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
