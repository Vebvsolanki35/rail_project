"use client";

/**
 * SYSTEM CONFIGURATION CONSOLE
 *
 * Two real controls, both on existing backend paths:
 *   1. Operating-policy switches — POST /api/mode (fogMode · vipAlert ·
 *      dtpRedZone). These genuinely change optimiser eligibility and scoring.
 *   2. Data-exchange contract probe — GET /api/ingest?system=X, which executes
 *      one contract-shaped ingestion cycle from the documented adapter layer.
 *
 * Nothing here fabricates a connection: the contract probe reports exactly what
 * `simulateIngest()` returns, and the panel states that no departmental
 * endpoint is contacted in this build.
 */
import { useState } from "react";
import { AlertTriangle, CloudFog, Loader2, PlugZap, RefreshCw, ShieldHalf, TrafficCone } from "lucide-react";
import StatusPill from "./StatusPill";

type IngestResult = {
  system: string;
  endpoint: string;
  contractVersion: string;
  records: number;
  latencyMs: number;
  checksum: string;
  lastRun: string;
  schema: Record<string, string>;
};

const SWITCHES = [
  { key: "fogMode", label: "Fog mode", icon: CloudFog, detail: "Suspends physical-only maintenance and routes inspection to DAS / RDPMS telemetry." },
  { key: "vipAlert", label: "VVIP corridor watch", icon: ShieldHalf, detail: "Withholds sub-critical work within 5 km of NDLS / DLI / NZM; severity ≥ 8 continues under escort." },
  { key: "dtpRedZone", label: "DTP level-crossing red zones", icon: TrafficCone, detail: "Confines level-crossing work to the golden window with a road-gridlock penalty outside it." },
] as const;

export default function ConfigConsole({
  initial,
  systems,
}: {
  initial: { fogMode: boolean; vipAlert: boolean; dtpRedZone: boolean };
  systems: { system: string; domain: string; endpoint: string; method: string; contractVersion: string; frequencySec: number }[];
}) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [probe, setProbe] = useState<IngestResult | null>(null);
  const [probeErr, setProbeErr] = useState<string | null>(null);

  async function toggle(key: (typeof SWITCHES)[number]["key"]) {
    setBusy(key);
    try {
      const next = !settings[key];
      const res = await fetch("/api/mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value: next }),
      });
      if (res.ok) {
        setSettings((s) => ({ ...s, [key]: next }));
        window.dispatchEvent(new Event("rr-mode"));
      }
    } finally {
      setBusy(null);
    }
  }

  async function runProbe(system: string) {
    setBusy(`probe:${system}`);
    setProbeErr(null);
    try {
      const res = await fetch(`/api/ingest?system=${encodeURIComponent(system)}`, { cache: "no-store" });
      const json = (await res.json()) as IngestResult & { error?: string };
      if (!res.ok || json.error) {
        setProbeErr(json.error ?? "Probe failed");
        setProbe(null);
      } else {
        setProbe(json);
      }
    } catch (e) {
      setProbeErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* Operating policy */}
      <section className="panel">
        <div className="panel-hd">
          <span>Operating policy</span>
          <StatusPill
            label={settings.fogMode || settings.vipAlert ? "Restrictions active" : "Nominal"}
            tone={settings.fogMode || settings.vipAlert ? "warning" : "success"}
          />
        </div>
        <div className="divide-y divide-edge">
          {SWITCHES.map((s) => {
            const on = settings[s.key];
            return (
              <div key={s.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                    <s.icon size={14} className={on ? "text-saffron" : "text-faint"} aria-hidden />
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-dim">{s.detail}</p>
                </div>
                <button
                  onClick={() => toggle(s.key)}
                  disabled={busy === s.key}
                  aria-pressed={on}
                  aria-label={`${s.label} — currently ${on ? "on" : "off"}`}
                  className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border ${
                    on ? "border-saffron bg-saffron/25" : "border-edge bg-abyss"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] h-3.5 w-3.5 rounded-full transition-all ${
                      on ? "left-[18px] bg-saffron" : "left-[2px] bg-faint"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
        <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
          These switches feed the optimiser, the scoring model and the field workflow. Toggle one, then re-run the AI planner to see eligibility and
          cost change.
        </p>
      </section>

      {/* Data-exchange contracts */}
      <section className="panel">
        <div className="panel-hd">
          <span>Data-exchange contracts</span>
          <StatusPill label="Simulated transport" tone="ai" />
        </div>

        <div className="gov-table-wrap">
          <table className="gov-table">
            <thead>
              <tr>
                <th className="sr">Sr</th>
                <th>System</th>
                <th>Domain</th>
                <th>Method</th>
                <th>Contract</th>
                <th className="num">Poll</th>
                <th>Probe</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s, i) => (
                <tr key={s.system}>
                  <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                  <td className="font-mono text-[11px] font-bold text-ink">{s.system}</td>
                  <td className="text-[11px] text-dim">{s.domain}</td>
                  <td className="text-[10.5px] text-dim">{s.method}</td>
                  <td className="font-mono text-[10.5px] text-dim">{s.contractVersion}</td>
                  <td className="num text-[10.5px]">{s.frequencySec}s</td>
                  <td>
                    <button onClick={() => runProbe(s.system)} disabled={busy === `probe:${s.system}`} className="btn btn-sm">
                      {busy === `probe:${s.system}` ? (
                        <Loader2 size={11} className="animate-spin" aria-hidden />
                      ) : (
                        <PlugZap size={11} aria-hidden />
                      )}
                      Run cycle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {probeErr && (
          <p className="flex items-center gap-2 border-t border-signal/30 bg-signal/[0.06] px-3 py-2 text-[11px] text-signal">
            <AlertTriangle size={12} aria-hidden /> {probeErr}
          </p>
        )}

        {probe && (
          <div className="border-t border-edge p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={`${probe.system} cycle complete`} tone="success" />
              <span className="font-mono text-[10.5px] text-dim">
                {probe.records} records · {probe.latencyMs} ms · {probe.contractVersion}
              </span>
              <span className="font-mono text-[10.5px] text-faint">{probe.checksum}</span>
            </div>
            <p className="mt-1.5 break-all font-mono text-[10.5px] text-faint">{probe.endpoint}</p>
            <dl className="mt-2 grid gap-x-4 gap-y-1 border border-edge bg-abyss/40 p-2 sm:grid-cols-2">
              {Object.entries(probe.schema).map(([field, type]) => (
                <div key={field} className="flex items-baseline justify-between gap-2">
                  <dt className="font-mono text-[10.5px] text-primary">{field}</dt>
                  <dd className="truncate font-mono text-[10px] text-dim" title={type}>
                    {type}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-faint">
              <RefreshCw size={11} aria-hidden /> Record counts and latency are returned by the adapter layer
              (`src/lib/integrations/contracts.ts`). No departmental endpoint is contacted in this build.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
