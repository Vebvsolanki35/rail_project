"use client";

/**
 * ASSET AVAILABILITY ANALYTICS + BASELINE COMPARISON — client (Phases 16, 6).
 *
 * The trend window switch re-reads the API rather than re-scaling a client-side
 * array, so a point only appears when a snapshot actually exists for that day.
 */
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import StatusPill from "./StatusPill";
import type { AvailabilityAnalytics } from "@/lib/engine/analytics";
import type { BaselineComparison } from "@/lib/engine/baseline";

const WINDOWS = [7, 30, 90] as const;

export default function AnalyticsClient({
  analytics,
  comparison,
  sections,
  summary,
}: {
  analytics: AvailabilityAnalytics;
  comparison: BaselineComparison;
  sections: { code: string; corridor: string; availabilityPct: number; downtimeMin: number; critical: number; openDefects: number; assets: number; dailyTrains: number }[];
  summary: { possessionHoursSaved: number; possessionHoursSavedPct: number; availabilityGainPts: number; duplicateOccupationsAvoided: number; possessionsAvoided: number; combinedBlocks: number; duplicateBlocksAvoided: number };
}) {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(30);
  const [trendData, setTrendData] = useState(analytics.trends);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const trend = trendData[String(window)] ?? analytics.trends[String(window)];
  /* Verdict is derived from the metric rows themselves — never asserted. */
  const improved = comparison.metrics.filter((m) => (m.betterWhen === "lower" ? m.optimized < m.baseline : m.optimized > m.baseline)).length;
  const worse = comparison.metrics.filter((m) => (m.betterWhen === "lower" ? m.optimized > m.baseline : m.optimized < m.baseline)).length;
  const headline =
    improved === comparison.metrics.length
      ? "Rail Rakshak better on every measured metric"
      : improved > worse
        ? `Rail Rakshak better on ${improved} of ${comparison.metrics.length} metrics`
        : worse > improved
          ? `Baseline better on ${worse} of ${comparison.metrics.length} metrics`
          : `Even on ${comparison.metrics.length} metrics`;
  const maxAvail = 100;
  const minAvail = Math.min(...(trend?.points ?? []).map((p) => p.availabilityPct ?? 100), 100);

  async function loadWindow(w: (typeof WINDOWS)[number]) {
    setWindow(w);
    setBusy(true);
    try {
      const res = await fetch(`/api/analytics?window=${w}`, { cache: "no-store" });
      const json = (await res.json()) as { analytics?: AvailabilityAnalytics };
      if (json.analytics) setTrendData(json.analytics.trends);
      startTransition(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Headline KPI — the SIH objective */}
      <section className="panel">
        <div className="panel-hd">
          <span>Headline KPI — asset availability for train operations</span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
            plan #{analytics.headline.planId ?? "—"} · {analytics.headline.planName}
          </span>
        </div>
        <div className="grid gap-3 p-3 lg:grid-cols-[1fr_1.4fr]">
          <div className="border border-edge p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Availability — Rail Rakshak</p>
            <p className="mt-1 font-mono text-[34px] font-bold leading-none text-mint">{analytics.headline.availabilityPct.toFixed(1)}%</p>
            <p className="mt-1 text-[11px] text-dim">
              against a simulated manual baseline of <span className="font-mono">{analytics.headline.baselinePct.toFixed(1)}%</span> — a gain of{" "}
              <span className="font-mono font-bold text-mint">{analytics.headline.gainPts >= 0 ? "+" : ""}{analytics.headline.gainPts.toFixed(1)} points</span> across{" "}
              {analytics.headline.monitoredAssets} monitored asset(s) over {analytics.headline.horizonDays} day(s).
            </p>
            <div className="mt-2 space-y-1">
              <div>
                <span className="flex items-center justify-between text-[10.5px] text-faint">
                  <span>Rail Rakshak</span>
                  <span className="font-mono">{analytics.headline.availabilityPct.toFixed(1)}%</span>
                </span>
                <span className="block h-2 border border-edge bg-abyss" aria-hidden>
                  <span className="block h-full bg-mint" style={{ width: `${analytics.headline.availabilityPct}%` }} />
                </span>
              </div>
              <div>
                <span className="flex items-center justify-between text-[10.5px] text-faint">
                  <span>Manual baseline (simulated)</span>
                  <span className="font-mono">{analytics.headline.baselinePct.toFixed(1)}%</span>
                </span>
                <span className="block h-2 border border-edge bg-abyss" aria-hidden>
                  <span className="block h-full bg-saffron" style={{ width: `${analytics.headline.baselinePct}%` }} />
                </span>
              </div>
            </div>
          </div>

          <div className="gov-table-wrap">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Measure</th>
                  <th className="num">Value</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {analytics.measures.map((m) => (
                  <tr key={m.key}>
                    <td className="text-[11px] font-semibold text-ink">
                      {m.label}
                      <span className="mt-0.5 block text-[9.5px] font-normal text-faint">{m.betterWhen === "lower" ? "lower is better" : "higher is better"}</span>
                    </td>
                    <td className="num">
                      <span className={`font-mono font-bold ${m.tone === "success" ? "text-mint" : m.tone === "critical" ? "text-signal" : m.tone === "warning" ? "text-saffron" : "text-ink"}`}>
                        {m.value}
                        <span className="ml-0.5 text-[10px] font-normal text-faint">{m.unit}</span>
                      </span>
                    </td>
                    <td className="max-w-[28rem] text-[10.5px] leading-relaxed text-dim">{m.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Trends */}
      <section className="panel">
        <div className="panel-hd">
          <span>Availability trend — {window}-day window</span>
          <span className="flex items-center gap-1.5">
            {WINDOWS.map((w) => (
              <button key={w} onClick={() => loadWindow(w)} className={`btn btn-xs ${window === w ? "btn-primary" : ""}`} aria-pressed={window === w}>
                {busy && window === w ? <Loader2 size={10} className="animate-spin" aria-hidden /> : null} {w} d
              </button>
            ))}
          </span>
        </div>
        <div className="p-3">
          <p className="text-[10.5px] text-faint">
            {trend?.coverage} · source {trend?.source}
            {trend?.availabilityDelta != null ? ` · change over the window ${trend.availabilityDelta >= 0 ? "+" : ""}${trend.availabilityDelta} pts` : ""}
          </p>
          {(trend?.points.length ?? 0) === 0 ? (
            <p className="mt-2 border border-edge bg-abyss px-3 py-6 text-center text-[11.5px] text-faint">
              No availability snapshot in this window yet. Every optimizer run writes one, so the series builds as the division plans.
            </p>
          ) : (
            <>
              <div className="mt-2 flex h-40 items-end gap-1 border border-edge bg-abyss p-2">
                {trend.points.map((p) => {
                  const h = p.availabilityPct != null ? Math.max(4, ((p.availabilityPct - (minAvail - 1)) / Math.max(1, maxAvail - (minAvail - 1))) * 100) : 4;
                  return (
                    <span key={p.date + (p.planId ?? "")} className="group relative flex-1" title={`${p.label}: ${p.availabilityPct ?? "—"}% (plan ${p.planId ?? "—"}, ${p.source})`}>
                      <span className={`block w-full ${p.source === "SNAPSHOT" ? "bg-primary" : "bg-faint"}`} style={{ height: `${h}%` }} />
                    </span>
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
                <span>{trend.points[0]?.label}</span>
                <span>{trend.points[trend.points.length - 1]?.label}</span>
              </div>
              <p className="mt-1.5 text-[10.5px] text-faint">
                Bars are snapshots written by the optimizer (solid navy). Where a day has no snapshot the series has no point — nothing is interpolated, and an
                estimate is drawn differently if the engine ever has to fall back to one.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Baseline comparison — calculated, never asserted */}
      <section className="panel">
        <div className="panel-hd">
          <span>
            Baseline comparison — manual practice vs. Rail Rakshak ({comparison.horizon}, {comparison.days} days)
          </span>
          <StatusPill label={headline} tone={improved >= worse ? "success" : "warning"} />
        </div>
        <div className="gov-table-wrap">
          <table className="gov-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="num">Manual baseline</th>
                <th className="num">Rail Rakshak</th>
                <th className="num">Δ</th>
                <th className="num">Δ %</th>
                <th>Verdict</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {comparison.metrics.map((m) => {
                const better = m.betterWhen === "lower" ? m.delta > 0 : m.delta > 0;
                const worse = m.betterWhen === "lower" ? m.delta < 0 : m.delta < 0;
                return (
                  <tr key={m.key}>
                    <td className="text-[11px] font-semibold text-ink">
                      {m.label}
                      <span className="mt-0.5 block text-[9.5px] font-normal text-faint">{m.unit} · {m.betterWhen} is better</span>
                    </td>
                    <td className="num font-mono">{m.baseline.toLocaleString("en-IN")}</td>
                    <td className="num font-mono font-bold">{m.optimized.toLocaleString("en-IN")}</td>
                    <td className={`num font-mono ${better ? "text-mint" : worse ? "text-signal" : "text-dim"}`}>
                      {m.delta > 0 ? "+" : ""}
                      {m.delta.toLocaleString("en-IN")}
                    </td>
                    <td className={`num font-mono ${better ? "text-mint" : worse ? "text-signal" : "text-dim"}`}>
                      {m.deltaPct > 0 ? "+" : ""}
                      {m.deltaPct}%
                    </td>
                    <td>
                      {better ? <StatusPill label="BETTER" tone="success" /> : worse ? <StatusPill label="WORSE" tone="critical" /> : <StatusPill label="EQUAL" tone="neutral" />}
                    </td>
                    <td className="max-w-[24rem] text-[10.5px] leading-relaxed text-dim">{m.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-edge px-3 py-2">
          <p className="text-[11px] text-ink">
            {improved} of {comparison.metrics.length} metric(s) favour Rail Rakshak on this register and {worse} favour the manual baseline. Possession hours saved{" "}
            <span className="font-mono font-bold text-mint">{summary.possessionHoursSaved.toFixed(1)} h</span> ({summary.possessionHoursSavedPct}%), availability gain{" "}
            <span className="font-mono font-bold text-mint">{summary.availabilityGainPts >= 0 ? "+" : ""}{summary.availabilityGainPts.toFixed(1)} pts</span>, duplicate
            possessions avoided <span className="font-mono font-bold">{summary.duplicateOccupationsAvoided}</span>.
          </p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-faint">{comparison.honesty}</p>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-hd">
            <span>Duplicate possessions &amp; department overlap</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">same sections, same days</span>
          </div>
          <div className="p-3">
            <div className="flex items-end gap-3">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Manual</p>
                <p className="font-mono text-[22px] font-bold text-saffron">{comparison.duplicateBlocks.baseline}</p>
                <p className="text-[10.5px] text-dim">separate possessions taken</p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Rail Rakshak</p>
                <p className="font-mono text-[22px] font-bold text-mint">{comparison.duplicateBlocks.optimized}</p>
                <p className="text-[10.5px] text-dim">possessions after bundling</p>
              </div>
              <p className="ml-auto max-w-[16rem] text-[10.5px] leading-relaxed text-faint">
                A duplicate possession is the same section handed over more than once in the horizon for work that could have been done together. Fewer hand-overs
                means fewer path clearances and fewer chances of an engineering overrun meeting a train.
              </p>
            </div>
            <table className="gov-table mt-3">
              <thead>
                <tr>
                  <th>Section group</th>
                  <th>Departments overlapped</th>
                  <th className="num">Baseline</th>
                  <th className="num">Rail Rakshak</th>
                </tr>
              </thead>
              <tbody>
                {comparison.departmentOverlap.slice(0, 10).map((o) => (
                  <tr key={o.departments.join("-")}>
                    <td className="font-mono text-[10.5px]">{o.departments.join(" + ")}</td>
                    <td className="num font-mono">{o.departments.length}</td>
                    <td className="num font-mono">{o.baseline}</td>
                    <td className="num font-mono text-mint">{o.optimized}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-hd">
            <span>Train delay by hour band</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">modelled delay-minutes</span>
          </div>
          <div className="gov-table-wrap max-h-[26rem]">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Hour band</th>
                  <th className="num">Manual baseline</th>
                  <th className="num">Rail Rakshak</th>
                  <th className="num">Avoided</th>
                  <th>Profile</th>
                </tr>
              </thead>
              <tbody>
                {comparison.hourlyDelay.map((h) => (
                  <tr key={h.hourLabel}>
                    <td className="font-mono text-[10.5px]">{h.hourLabel}</td>
                    <td className="num font-mono">{h.baselineMin}</td>
                    <td className="num font-mono">{h.optimizedMin}</td>
                    <td className={`num font-mono ${h.baselineMin - h.optimizedMin > 0 ? "text-mint" : "text-faint"}`}>{h.baselineMin - h.optimizedMin}</td>
                    <td>
                      <span className="flex items-center gap-1">
                        <span className="block h-1.5 w-24 border border-edge bg-abyss" aria-hidden>
                          <span className="block h-full bg-primary" style={{ width: `${Math.min(100, (h.optimizedMin / Math.max(1, ...comparison.hourlyDelay.map((x) => x.baselineMin))) * 100)}%` }} />
                        </span>
                        <span className="block h-1.5 w-24 border border-edge bg-abyss" aria-hidden>
                          <span className="block h-full bg-saffron" style={{ width: `${Math.min(100, (h.baselineMin / Math.max(1, ...comparison.hourlyDelay.map((x) => x.baselineMin))) * 100)}%` }} />
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
            Navy bar = Rail Rakshak, saffron bar = manual baseline. The character of the result matters more than the total: the optimizer is expected to keep
            possessions out of the peak hour bands, so the improvement should be concentrated where traffic is densest.
          </div>
        </section>
      </section>

      {/* Section availability */}
      <section className="panel">
        <div className="panel-hd">
          <span>Availability &amp; exposure by section</span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{sections.length} section(s) in the division register</span>
        </div>
        <div className="gov-table-wrap max-h-[30rem]">
          <table className="gov-table">
            <thead>
              <tr>
                <th className="sr">Sr</th>
                <th>Section</th>
                <th className="num">Trains/day</th>
                <th className="num">Availability</th>
                <th className="num">Open defects</th>
                <th className="num">Downtime (h)</th>
                <th className="num">Critical</th>
                <th>Assessment</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s, i) => (
                <tr key={s.code}>
                  <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                  <td className="ref">
                    {s.code}
                    <span className="mt-0.5 block text-[10px] text-faint">
                      {s.corridor} · {s.assets} asset(s) monitored
                    </span>
                  </td>
                  <td className="num font-mono">{s.dailyTrains}</td>
                  <td className="num">
                    <span className="flex items-center justify-end gap-1.5">
                      <span className="block h-1.5 w-16 border border-edge bg-abyss" aria-hidden>
                        <span className={`block h-full ${s.availabilityPct >= 97 ? "bg-mint" : s.availabilityPct >= 94 ? "bg-saffron" : "bg-signal"}`} style={{ width: `${Math.min(100, s.availabilityPct)}%` }} />
                      </span>
                      <span className="font-mono">{s.availabilityPct}%</span>
                    </span>
                  </td>
                  <td className="num font-mono">{s.openDefects}</td>
                  <td className="num font-mono">{(s.downtimeMin / 60).toFixed(1)}</td>
                  <td className={`num font-mono ${s.critical > 0 ? "text-signal" : "text-faint"}`}>{s.critical}</td>
                  <td>
                    {s.availabilityPct >= 97 ? (
                      <StatusPill label="HEALTHY" tone="success" />
                    ) : s.critical > 0 ? (
                      <StatusPill label="ATTENTION" tone="critical" />
                    ) : (
                      <StatusPill label="WATCH" tone="warning" />
                    )}
                  </td>
                </tr>
              ))}
              {sections.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[11.5px] text-faint">
                    No section carries planned work yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">{analytics.honesty}</div>
      </section>
      {pending && <p className="text-[10.5px] text-faint">Refreshing window…</p>}
    </div>
  );
}
