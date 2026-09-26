/**
 * MULTI-HORIZON PLAN BRIEFING (Phase 8) — weekly and monthly side by side.
 *
 * The four horizons already exist in the planner (rolling / weekly / monthly /
 * crisis); this panel states what each longer horizon is working with. Every
 * figure is read from the engine briefing (`horizonBriefing`), which itself reads
 * the defect register, the newest plan, the resource establishment, the risk
 * model, the conflict engine and the FOIS forecast.
 */
import Link from "next/link";
import { CalendarDays, CloudFog, Gauge, ShieldCheck, TrainFront, TrendingUp, Users } from "lucide-react";
import StatusPill from "./StatusPill";
import type { HorizonBriefing as Briefing } from "@/lib/engine/horizons";

const READY_TONE = { READY: "success", CAUTION: "warning", BLOCKED: "critical" } as const;

export default function HorizonBriefing({ briefings, weather }: { briefings: Briefing[]; weather: { fogMode: boolean; visibilityM: number; rainMm: number; fogSeason: boolean } }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border border-edge bg-abyss px-3 py-2">
        <CloudFog size={13} className={weather.fogMode ? "text-signal" : "text-primary"} aria-hidden />
        <span className="text-[11.5px] text-ink">
          Weather affecting both horizons: {weather.fogMode ? "FOG MODE active" : weather.fogSeason ? "fog season" : "clear season"} · visibility{" "}
          <span className="font-mono">{weather.visibilityM} m</span> · rain <span className="font-mono">{weather.rainMm} mm/h</span>
        </span>
        <Link href="/replan" className="btn btn-xs ml-auto">
          Rolling / crisis re-planning
        </Link>
      </div>

      {briefings.map((b) => (
        <section key={b.horizon} className="panel">
          <div className="panel-hd">
            <span className="flex items-center gap-2">
              <CalendarDays size={13} aria-hidden /> {b.horizon} plan — {b.days}-day horizon
            </span>
            <span className="flex items-center gap-1.5">
              <StatusPill label={`PLAN ${b.planned.planStatus}`} tone={b.planned.planStatus === "APPROVED" || b.planned.planStatus === "PUBLISHED" ? "success" : "warning"} />
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
                plan #{b.planned.planId ?? "—"} · {b.planned.blocks} block(s) · {b.planned.tasks} task(s)
              </span>
            </span>
          </div>

          {/* Headline strip */}
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { icon: Gauge, label: "Asset availability", value: `${b.availability.pct.toFixed(1)}%`, sub: `${b.availability.gainPts >= 0 ? "+" : ""}${b.availability.gainPts.toFixed(1)} pts vs baseline · ${b.availability.downtimeH} h downtime (baseline ${b.availability.baselineDowntimeH} h)` },
              { icon: TrendingUp, label: "Maintenance backlog", value: String(b.backlog.open), sub: `${b.backlog.critical} critical · ${b.backlog.overdue} overdue · ${b.backlog.chronic} chronic · oldest ${b.backlog.oldestDays} d` },
              { icon: CalendarDays, label: "Planned coverage", value: `${b.planned.coveragePct}%`, sub: `${b.planned.tasks} placed · ${b.planned.superBlocks} combined · ${b.planned.downtimeH} h possession` },
              { icon: Users, label: "Crew utilisation", value: b.crew.byDepartment.length ? `${Math.round(b.crew.byDepartment.reduce((s, d) => s + d.utilisationPct, 0) / b.crew.byDepartment.length)}%` : "—", sub: `${b.windows.freeCrewSlots} free crew-slot-day(s) · ${b.windows.refusedPlacements} refused placement(s) on record` },
              { icon: TrainFront, label: "Forecast traffic", value: `${b.traffic.rakes} rakes`, sub: `${b.traffic.tonnage.toLocaleString("en-IN")} T · ${b.traffic.surges} SURGE · peak ${b.traffic.peakOccupancyPct}% occupancy` },
              { icon: ShieldCheck, label: "Residual risk", value: String(b.risk.aboveThreshold), sub: `above ${(b.risk.threshold * 100).toFixed(0)}% threshold · ${b.risk.emergency} emergency-class` },
            ].map((k) => (
              <div key={k.label} className="border border-edge px-2.5 py-2">
                <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-faint">
                  <k.icon size={11} aria-hidden /> {k.label}
                </p>
                <p className="mt-1 font-mono text-[16px] font-bold leading-none text-ink">{k.value}</p>
                <p className="mt-1 text-[10px] leading-snug text-dim">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Readiness board */}
          <div className="grid gap-2 border-t border-edge p-3 lg:grid-cols-3">
            {b.readiness.map((r) => (
              <div key={r.label} className="border border-edge px-2.5 py-2">
                <p className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-bold text-ink">{r.label}</span>
                  <StatusPill label={r.state} tone={READY_TONE[r.state]} />
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-dim">{r.detail}</p>
              </div>
            ))}
          </div>

          {/* Working detail */}
          <div className="grid gap-3 border-t border-edge p-3 lg:grid-cols-3">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Backlog by department</p>
              <table className="gov-table mt-1">
                <thead>
                  <tr>
                    <th>Dept</th>
                    <th className="num">Open</th>
                    <th className="num">Critical</th>
                  </tr>
                </thead>
                <tbody>
                  {b.backlog.byDepartment.map((d) => (
                    <tr key={d.department}>
                      <td className="font-semibold">{d.department}</td>
                      <td className="num font-mono">{d.open}</td>
                      <td className={`num font-mono ${d.critical > 0 ? "text-signal" : "text-faint"}`}>{d.critical}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Available working windows</p>
              <dl className="kv mt-1">
                <div className="contents">
                  <dt>Candidate 15-min slots</dt>
                  <dd className="font-mono">{b.windows.candidateSlots.toLocaleString("en-IN")}</dd>
                </div>
                <div className="contents">
                  <dt>Registered windows</dt>
                  <dd className="font-mono">{b.windows.registeredWindows}</dd>
                </div>
                <div className="contents">
                  <dt>Blocks placed inside horizon</dt>
                  <dd className="font-mono">{b.windows.placedBlocks}</dd>
                </div>
                <div className="contents">
                  <dt>Placements refused</dt>
                  <dd className="font-mono">{b.windows.refusedPlacements}</dd>
                </div>
              </dl>
              <p className="mt-1 text-[10px] leading-relaxed text-faint">{b.windows.note}</p>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Conflicts carried by this horizon</p>
              <p className="mt-1 font-mono text-[13px] font-bold text-ink">
                {b.conflicts.total} total · {b.conflicts.critical} critical · {b.conflicts.delayMin} delay-min
              </p>
              <p className="mt-0.5 text-[10.5px] text-dim">
                {b.conflicts.sections.length ? b.conflicts.sections.slice(0, 8).join(", ") : "no section conflicts"}
              </p>
              <p className="mt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-faint">Heaviest freight sections</p>
              <ul className="mt-1 space-y-0.5">
                {b.traffic.heavySections.map((h) => (
                  <li key={h.segmentCode} className="flex items-center gap-2 font-mono text-[10.5px] text-dim">
                    <span className="text-ink">{h.segmentCode}</span>
                    <span>{h.rakes} rake(s)</span>
                    <span className="ml-auto">{h.occupancyPct}% occupancy</span>
                  </li>
                ))}
                {b.traffic.heavySections.length === 0 && <li className="text-[10.5px] text-faint">No forecast inside this horizon.</li>}
              </ul>
            </div>
          </div>
          <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">{b.availability.note} {b.traffic.note}</div>
        </section>
      ))}
    </div>
  );
}
