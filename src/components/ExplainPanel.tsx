/**
 * AI EXPLAINABILITY (Phase 5) + WEATHER-AWARE PLANNING (Phase 12) — planner panel.
 *
 * Each recommendation is broken into the factors that produced it, with the raw
 * number behind every bar, and the engine's own authority statement is shown on
 * every card: the model recommends, an officer decides.
 */
import { CloudFog, Droplets, ShieldCheck, Thermometer, Wind } from "lucide-react";
import StatusPill from "./StatusPill";
import { AI_AUTHORITY, type DefectExplanation, type WeatherSnapshot } from "@/lib/engine/explain";

type Weather = WeatherSnapshot & {
  fogSeason: boolean;
  source: string;
  restrictions: string[];
  schedulingBias: { preferGolden: boolean; suspendPhysical: boolean; extraEarthingCheck: boolean; note: string };
  observedAt: string;
};

export default function ExplainPanel({ explanations, weather }: { explanations: DefectExplanation[]; weather: Weather }) {
  const w = weather;

  return (
    <div className="space-y-3">
      {/* Weather desk — visible and operational */}
      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <CloudFog size={13} aria-hidden /> Weather desk — {w.fogMode ? "FOG MODE ACTIVE" : w.fogSeason ? "fog season" : "clear season"}
          </span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{w.source}</span>
        </div>
        <div className="grid gap-3 p-3 lg:grid-cols-[1fr_1fr_1.2fr]">
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Wind, label: "Visibility", value: `${w.visibilityM} m`, sub: w.visibilityM < 200 ? "below working limit" : w.visibilityM < 500 ? "fog advisory" : "normal" },
              { icon: CloudFog, label: "Fog probability", value: `${(w.fogProb * 100).toFixed(0)}%`, sub: w.fogProb > 0.6 ? "likely" : w.fogProb > 0.3 ? "possible" : "unlikely" },
              { icon: Thermometer, label: "Temperature", value: `${w.tempC} °C`, sub: `humidity ${w.humidity}%` },
              { icon: Droplets, label: "Rain", value: `${w.rainMm} mm/h`, sub: w.rainMm > 0 ? "wet-weather bias active" : "dry" },
            ].map((k) => (
              <div key={k.label} className="border border-edge px-2.5 py-2">
                <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-faint">
                  <k.icon size={11} aria-hidden /> {k.label}
                </p>
                <p className="mt-1 font-mono text-[15px] font-bold leading-none text-ink">{k.value}</p>
                <p className="mt-0.5 text-[10px] text-dim">{k.sub}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Operational restrictions in force</p>
            <ul className="mt-1 space-y-1">
              {w.restrictions.length === 0 ? (
                <li className="text-[11.5px] text-mint">No weather restriction on maintenance work.</li>
              ) : (
                w.restrictions.map((r) => (
                  <li key={r} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink">
                    <span className="mt-1.5 block h-1 w-1 shrink-0 bg-signal" aria-hidden />
                    {r}
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">How it changes scheduling</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink">{w.schedulingBias.note}</p>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[10.5px] text-dim">
              <li>prefer GOLDEN window: {w.schedulingBias.preferGolden ? "YES" : "no"}</li>
              <li>suspend physical-only work: {w.schedulingBias.suspendPhysical ? "YES" : "no"}</li>
              <li>extra OHE earthing check: {w.schedulingBias.extraEarthingCheck ? "YES" : "no"}</li>
              <li>observed at: {new Date(w.observedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</li>
            </ul>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
              The same values are read by the optimizer: physical-only tasks are withheld when Fog Mode is on, the GOLDEN window is preferred in restricted
              visibility, and OHE work in rain carries the additional earthing requirement into the block authorization.
            </p>
          </div>
        </div>
      </section>

      {/* Per-recommendation explanation */}
      <div className="grid gap-3 xl:grid-cols-2">
        {explanations.map((e) => (
          <article key={e.defectId} className="panel">
            <div className="panel-hd">
              <span>
                {e.defectCode} — {e.segmentCode}
              </span>
              <StatusPill label={`priority ${e.priority.score.toFixed(1)}`} tone={e.priority.score >= 70 ? "critical" : e.priority.score >= 50 ? "warning" : "info"} />
            </div>
            <div className="p-3">
              <p className="text-[12px] font-bold text-ink">{e.title}</p>
              <p className="mt-0.5 font-mono text-[10.5px] text-faint">
                {e.department} · {e.section} · urgency {e.priority.class.replace(/_/g, " ")} (boost ×{e.priority.boost.toFixed(2)})
              </p>

              <table className="gov-table mt-2">
                <caption className="sr-only">Explanation factors for {e.defectCode}</caption>
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th className="num">Value</th>
                    <th>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {e.factors.map((f) => (
                    <tr key={f.key}>
                      <td className="text-[11px] text-ink" title={f.note}>
                        {f.label}
                      </td>
                      <td className="num font-mono text-[11px]">{f.value}</td>
                      <td>
                        <span className="flex items-center gap-1.5">
                          <span className="block h-1.5 w-24 border border-edge bg-abyss" aria-hidden>
                            <span
                              className={`block h-full ${f.pct >= 70 ? "bg-signal" : f.pct >= 40 ? "bg-saffron" : "bg-primary"}`}
                              style={{ width: `${Math.max(2, Math.min(100, f.pct))}%` }}
                            />
                          </span>
                          <span className="font-mono text-[10px] text-faint">{f.pct}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-2 border-t border-edge pt-2">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Recommended because…</p>
                <ul className="mt-1 space-y-1">
                  {e.reasons.map((r) => (
                    <li key={r} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink">
                      <span className="mt-1.5 block h-1 w-1 shrink-0 bg-primary" aria-hidden />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <dl className="kv mt-2">
                <div className="contents">
                  <dt>Recommendation</dt>
                  <dd>{e.recommendation}</dd>
                </div>
                <div className="contents">
                  <dt>Window</dt>
                  <dd className="font-mono">
                    {e.recommendedWindow} · {e.recommendedBlockMin} min
                  </dd>
                </div>
                <div className="contents">
                  <dt>Traffic impact</dt>
                  <dd className="font-mono">
                    {e.expectedTrainImpact.affectedTrains} train(s) · {e.expectedTrainImpact.delayMin} delay-min
                  </dd>
                </div>
                <div className="contents">
                  <dt>Conflict risk</dt>
                  <dd>
                    <StatusPill label={e.conflictRisk.level} tone={e.conflictRisk.level === "HIGH" ? "critical" : e.conflictRisk.level === "MODERATE" ? "warning" : "success"} />{" "}
                    <span className="text-[10.5px] text-dim">{e.conflictRisk.basis}</span>
                  </dd>
                </div>
                <div className="contents">
                  <dt>Opportunity</dt>
                  <dd className="text-[10.5px]">{e.maintenanceOpportunity}</dd>
                </div>
              </dl>

              <p className="mt-2 flex items-center gap-1.5 border border-ai/40 bg-ai/[0.06] px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ai">
                <ShieldCheck size={11} aria-hidden /> {AI_AUTHORITY.recommendationLabel} · {AI_AUTHORITY.reviewLabel}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-faint">{AI_AUTHORITY.note}</p>
            </div>
          </article>
        ))}
        {explanations.length === 0 && (
          <p className="panel p-6 text-center text-[11.5px] text-faint">
            No open defect to explain — the register is clear.
          </p>
        )}
      </div>
    </div>
  );
}
