import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import { freightSummary, listForecasts } from "@/lib/engine/freight";
import { trafficFactor } from "@/lib/engine/network";

export const dynamic = "force-dynamic";

const PRIORITY_TONE: Record<string, "critical" | "warning" | "info"> = { CRITICAL: "critical", HIGH: "warning", MEDIUM: "info", LOW: "info" };

function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * GOODS TRAIN FORECAST (Phase 2) — Control Office freight demand.
 *
 * These are the rows the optimizer reads back through `freightPressure()`: the
 * penalty applied to a candidate possession window is shown here beside every
 * forecast, so the desk can see exactly why a block was pushed out of a peak.
 */
export default async function ForecastPage() {
  const [summary, rows] = await Promise.all([freightSummary(), listForecasts(200)]);
  const peak = rows.filter((r) => r.predictedOccupancyPct >= 80);
  const surge = rows.filter((r) => r.isSurge);

  return (
    <RoleGate title="Goods Train Forecast">
      <div className="space-y-3">
        <PageHeader
          module="OPS-FRT"
          title="Goods Train Forecast"
          titleKey="page.forecast"
          subtitleKey="page.forecast.sub"
          subtitle="The Control Office goods-train forecast is an internal model, not a caption: FOIS rake telemetry is consolidated per section and horizon day into expected rakes, tonnage, ETA, priority, predicted corridor occupancy and a confidence. The block optimizer reads these rows back and pays a freight penalty for any candidate window that sits in front of heavy traffic."
          crumbs={[{ label: "Operations" }, { label: "Goods Train Forecast" }]}
          state={surge.length > 0 ? `${surge.length} SURGE advisory across the division` : `${rows.length} section-window forecasts current`}
          stateTone={surge.length > 0 ? "warning" : "success"}
          reference={`${summary.tonnage24h.toLocaleString("en-IN")} T in 24 h · peak occupied corridor ${summary.peakOccupancyPct}% · avg confidence ${summary.avgConfidence}`}
          actions={
            <>
              <Link href="/data" className="btn btn-xs">
                Source: FOIS contract
              </Link>
              <Link href="/planner" className="btn btn-xs">
                Planner consumes this
              </Link>
            </>
          }
        />

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Rakes (24 h)", value: String(summary.rakes24h), sub: `${summary.tonnage24h.toLocaleString("en-IN")} T expected` },
            { label: "Rakes (day +1)", value: String(summary.rakes48h), sub: `${summary.tonnage48h.toLocaleString("en-IN")} T advised` },
            { label: "SURGE advisories", value: String(summary.surges), sub: surge.length ? surge.map((s) => s.segmentCode).slice(0, 4).join(", ") : "none in the window" },
            { label: "Peak corridor occupancy", value: `${summary.peakOccupancyPct}%`, sub: "highest predicted section loading" },
            { label: "Forecast rows", value: String(summary.rows), sub: `avg confidence ${summary.avgConfidence} · source FOIS` },
          ].map((k) => (
            <div key={k.label} className="panel px-3 py-2.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{k.label}</p>
              <p className="mt-1 font-mono text-[17px] font-bold leading-none text-ink">{k.value}</p>
              <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-hd">
            <span>Freight forecast register — section × horizon day</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">SIMULATED / DEMO DATA · consumed by the optimizer</span>
          </div>
          <div className="gov-table-wrap max-h-[34rem]">
            <table className="gov-table">
              <caption className="sr-only">Freight forecast by section with predicted corridor occupancy and confidence</caption>
              <thead>
                <tr>
                  <th className="sr">Sr</th>
                  <th>Section</th>
                  <th>Corridor</th>
                  <th>Day</th>
                  <th className="num">Rakes</th>
                  <th className="num">Tonnage (T)</th>
                  <th>First ETA</th>
                  <th>Priority</th>
                  <th className="num">Corridor occupancy</th>
                  <th className="num">Confidence</th>
                  <th>Advisory</th>
                  <th>Source rake(s)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                    <td className="ref">{r.segmentCode}</td>
                    <td className="text-[10.5px] text-dim">{r.corridor}</td>
                    <td className="font-mono text-[10.5px]">{r.day === 0 ? "24 h" : `+${r.day} d`}</td>
                    <td className="num font-mono">{r.expectedFreight}</td>
                    <td className="num font-mono">{r.expectedTonnage.toLocaleString("en-IN")}</td>
                    <td className="font-mono text-[10.5px]">{fmt(r.etaMin)}</td>
                    <td>
                      <StatusPill label={r.priority} tone={PRIORITY_TONE[r.priority] ?? "info"} />
                    </td>
                    <td className="num">
                      <span className="flex items-center justify-end gap-1.5">
                        <span className="h-1.5 w-14 border border-edge bg-abyss" aria-hidden>
                          <span
                            className={`block h-full ${r.predictedOccupancyPct >= 80 ? "bg-signal" : r.predictedOccupancyPct >= 60 ? "bg-saffron" : "bg-mint"}`}
                            style={{ width: `${Math.min(100, r.predictedOccupancyPct)}%` }}
                          />
                        </span>
                        <span className="font-mono">{r.predictedOccupancyPct}%</span>
                      </span>
                    </td>
                    <td className="num font-mono">{r.confidence.toFixed(2)}</td>
                    <td>
                      {r.isSurge ? <StatusPill label="SURGE" tone="critical" /> : <StatusPill label="normal" tone="success" />}
                    </td>
                    <td className="max-w-[20rem] text-[10.5px] text-dim">{r.rakeRef === "schedule-derived" ? r.note : `${r.rakeRef} — ${r.note}`}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-[11.5px] text-faint">
                      No forecast rows. Run a FOIS cycle from the integration hub.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-2 lg:grid-cols-3">
          {[
            { t: "How the optimizer uses it", d: "Each candidate possession window is scored with an expected-train-delay term multiplied by (1 + freight pressure). A surge advisory applies up to +45% on top, so the solver moves the possession rather than putting it in front of a 10,000-tonne rake." },
            { t: "Predicted occupancy", d: "0.34 × section loading + 0.26 × rake count pressure + 0.22 × tonnage pressure + 0.18 × time-of-day traffic shape, capped at 99.5%. Every input is stored on the row." },
            { t: "Why the peak hour matters", d: `Traffic-shape factor now is ${trafficFactor((new Date().getHours() * 60 + new Date().getMinutes()) % 1440).toFixed(2)} of peak (0.25 in the night GOLDEN window, 0.95 in the evening peak). Freight is assessed against the shape, not the clock alone.` },
          ].map((c) => (
            <article key={c.t} className="panel px-3 py-2.5">
              <p className="text-[12px] font-bold text-ink">{c.t}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-dim">{c.d}</p>
            </article>
          ))}
        </section>

        <p className="text-[10.5px] leading-relaxed text-faint">
          {peak.length} section-window(s) are forecast above 80% corridor occupancy
          {peak.length ? `: ${peak.slice(0, 6).map((p) => `${p.segmentCode} ${p.predictedOccupancyPct}%`).join(", ")}` : ""}. These windows remain feasible — the optimizer simply
          prefers a cheaper slot when one exists inside the same sanctioned window.
        </p>
      </div>
    </RoleGate>
  );
}
