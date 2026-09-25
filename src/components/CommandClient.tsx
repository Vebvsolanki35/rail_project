"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, CloudFog, Eye, Radio, ShieldAlert, Thermometer, Timer, TrafficCone, TrainFront, Webhook, Wind, X } from "lucide-react";
import Link from "next/link";
import RailMap from "@/components/RailMap";
import KpiStrip from "@/components/KpiStrip";
import UrgencySummary from "@/components/UrgencySummary";
import UrgencyQueue from "@/components/UrgencyQueue";
import LiveFeed from "@/components/LiveFeed";
import LiveBoard from "@/components/LiveBoard";
import ConsensusMeter from "@/components/ConsensusMeter";
import SectionInspector from "@/components/SectionInspector";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import DrmRow from "@/components/DrmRow";
import { CORRIDOR_COLORS, DEPT_COLORS, fmtMin } from "@/lib/engine/network";
import { useRole } from "@/lib/role";
import type { DashboardState, SettingsDTO } from "@/lib/engine/types";

function Toggle({
  label,
  sub,
  on,
  color,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  sub: string;
  on: boolean;
  color: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={`${label} — currently ${on ? "on" : "off"}`}
      className={`flex w-full items-center gap-3 rounded-[4px] border p-3 text-left transition disabled:opacity-50 ${
        on ? "border-edge/90 bg-panel" : "border-edge/50 bg-panel/30 hover:border-edge hover:bg-panel/50"
      }`}
    >
      <span style={{ color: on ? color : "var(--color-faint)" }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-tight text-ink">{label}</span>
          <span
            className="rounded-[2px] px-1.5 py-0.2 text-[10px] font-mono font-semibold"
            style={{
              backgroundColor: on ? `${color}20` : "rgba(100, 116, 139, 0.15)",
              color: on ? color : "var(--color-dim)",
            }}
          >
            {on ? "ACTIVE" : "OFF"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-dim">{sub}</p>
      </div>
      <span
        className="relative shrink-0 rounded-full transition-colors duration-200"
        style={{ height: 20, width: 38, backgroundColor: on ? color : "var(--color-edge)" }}
      >
        <span
          className="absolute top-[2px] h-4 w-4 rounded-full transition-all duration-200"
          style={{ left: on ? 20 : 2, backgroundColor: on ? "var(--color-on-accent)" : "var(--color-faint)" }}
        />
      </span>
    </button>
  );
}

export default function CommandClient({ initial }: { initial: DashboardState }) {
  const role = useRole();
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>("NZM-ANVT");
  const [extendBusy, setExtendBusy] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);

  const sigOf = (d: DashboardState) =>
    `${d.settings.fogMode}${d.settings.vipAlert}${d.settings.dtpRedZone}${d.settings.planStatus}|${d.counts.openDefects}|${d.events.length}|${d.liveTrains.length}|${d.activeBlockSegments.join(",")}|${d.latestPlan?.id ?? 0}|${d.overrun?.jobId ?? 0}|${d.overrun?.remainingMin ?? 0}`;
  const lastSig = useRef("__init__");

  const refresh = useCallback(async (force = false) => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as DashboardState;
      const s = sigOf(d);
      if (force || s !== lastSig.current) {
        lastSig.current = s;
        setState(d);
      }
    } catch {
      /* keep last state */
    }
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 12000);
    return () => clearInterval(t);
  }, [refresh]);

  async function toggle(key: keyof SettingsDTO) {
    setPending(key);
    try {
      await fetch("/api/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: !state.settings[key] }),
      });
      await refresh(true);
    } finally {
      setPending(null);
    }
  }

  const s = state.settings;
  const planBlocks = state.latestPlan?.blocks ?? [];
  const blockedIds = [
    ...new Set([
      ...planBlocks.filter((b) => b.day <= 1 && b.mode === "physical").map((b) => b.segmentId),
      ...state.activeBlockSegments,
    ]),
  ];
  const selectedSegment = useMemo(
    () => state.segments.find((sg) => sg.code === selectedCode) ?? null,
    [state.segments, selectedCode]
  );
  const runningCount = state.liveTrains.filter((t) => t.status === "RUNNING").length;
  const overrun = state.overrun;
  const firstBlock = state.latestPlan?.blocks[0] ?? null;

  async function preemptExtend() {
    if (!overrun) return;
    setExtendBusy(true);
    try {
      await fetch("/api/jobs/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: overrun.jobId, addMin: 30 }),
      });
      await refresh(true);
    } finally {
      setExtendBusy(false);
    }
  }

  return (
    <div className="anim-rise space-y-3">
      <PageHeader
        module="OPS-CC"
        title="Command Centre"
        titleKey="page.command"
        subtitleKey="page.command.sub"
        subtitle="Divisional control-room view of the running grid: live train positions, block occupancy, the defect urgency queue, plan quality and the two-way decision loop between the AI planner and the divisional officer."
        crumbs={[{ label: "Operations" }, { label: "Command Centre" }]}
        state={
          s.planStatus === "APPROVED"
            ? "Plan approved and in force"
            : s.planStatus === "VETOED"
              ? "Plan vetoed by DRM — re-plan pending"
              : "Awaiting divisional approval"
        }
        stateTone={s.planStatus === "APPROVED" ? "success" : s.planStatus === "VETOED" ? "critical" : "warning"}
        reference={
          state.latestPlan
            ? `Plan #${state.latestPlan.id} · ${state.latestPlan.blocks.length} occupancy(ies) · ${state.activeBlockSegments.length} live`
            : "No plan published"
        }
        actions={
          <>
            <Link href="/network" className="btn">
              Network status
            </Link>
            <Link href="/planner" className="btn btn-primary">
              Open AI Block Planner
            </Link>
          </>
        }
      />

      {/* Overrun Early Warning Alert */}
      {overrun && (
        <div className="anim-rise flex flex-wrap items-center justify-between gap-3 border border-saffron/45 bg-saffron/[0.08] px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[3px] bg-saffron/20 text-saffron">
              <Timer size={16} className="animate-pulse" />
            </span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-saffron"><StatusPill label="Warning" tone="warning" /> High block overrun risk</p>
              <p className="text-xs text-ink">
                Job #{overrun.jobId} on section <strong className="font-mono text-saffron">{overrun.segCode}</strong> has {overrun.remainingMin} min left ({overrun.donePct}% done) — Overrun probability: <span className="font-bold text-signal font-mono">{overrun.probability.toFixed(0)}%</span>
              </p>
            </div>
          </div>
          <button
            onClick={preemptExtend}
            disabled={extendBusy}
            className="rounded-[3px] bg-saffron px-3.5 py-1.5 text-xs font-bold on-accent shadow transition hover:bg-saffron disabled:opacity-50"
          >
            {extendBusy ? "Extending…" : "Pre-emptively Extend +30m"}
          </button>
        </div>
      )}

      {role?.role === "DRM" && <DrmRow state={state} />}

      <KpiStrip state={state} />

      {/* Urgency engine + lifecycle roll-up (PS #26027) */}
      <div className="grid gap-3 xl:grid-cols-[360px_1fr]">
        <UrgencySummary summary={state.urgency} />
        <UrgencyQueue items={state.urgencyQueue} limit={8} />
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* Rail Map Section */}
        <section className="panel relative overflow-hidden xl:col-span-2">
          <div className="panel-hd">
            <span className="flex items-center gap-2">
              <Radio size={14} className="text-mint" />
              Delhi NCR Live Grid (19 Sections · {runningCount} Active Trains)
            </span>
            <div className="flex items-center gap-3 text-xs text-dim">
              <span className="flex items-center gap-1 text-saffron"><Thermometer size={12} />{state.weather.tempC}°C</span>
              <span className="flex items-center gap-1 text-cyan"><Wind size={12} />{state.weather.humidityPct}% RH</span>
              <span className={`flex items-center gap-1 font-mono ${s.fogMode ? "text-signal" : "text-mint"}`}>
                <Eye size={12} />Vis: {state.weather.visibilityM >= 1000 ? `${(state.weather.visibilityM / 1000).toFixed(1)}km` : `${state.weather.visibilityM}m`}
              </span>
            </div>
          </div>

          <div className="map-canvas gridlines relative p-2">
            <RailMap
              stations={state.stations}
              segments={state.segments}
              fog={s.fogMode}
              vip={s.vipAlert}
              blockedSegmentIds={blockedIds}
              liveTrains={state.liveTrains}
              selectedSegment={selectedCode}
              onSelectSegment={(code) => setSelectedCode(code === selectedCode ? null : code)}
            />

            {s.fogMode && (
              <div className="anim-rise absolute left-4 top-4 rounded-[4px] border border-signal/40 bg-hull/90 p-3 shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)] ">
                <p className="flex items-center gap-2 text-xs font-bold text-signal">
                  <CloudFog size={15} /> Winter Fog Protocol Active
                </p>
                <p className="mt-1 max-w-xs text-[11px] text-dim leading-relaxed">
                  Physical track blocks suspended · DAS acoustic sensing & remote diagnostics engaged ({state.counts.virtualInspections} in queue).
                </p>
              </div>
            )}

            {s.vipAlert && (
              <div className="anim-rise absolute right-4 top-4 rounded-[4px] border border-saffron/40 bg-hull/90 p-3 shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)] ">
                <p className="flex items-center gap-2 text-xs font-bold text-saffron">
                  <ShieldAlert size={15} /> VVIP Security Corridor
                </p>
                <p className="mt-1 max-w-xs text-[11px] text-dim leading-relaxed">
                  5 km NDLS security buffer active via RPF/IB feed · Sub-critical maintenance blocks withheld.
                </p>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-mono text-faint">
              {Object.entries(CORRIDOR_COLORS).map(([c, col]) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: col }} />
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Right Operational Controls */}
        <section className="flex flex-col gap-3">
          <div className="panel">
            <div className="panel-hd">
              <span>Operating Mode Triggers</span>
              <span className="text-[10.5px] font-mono text-dim">{pending ? "Updating…" : "Instant"}</span>
            </div>
            <div className="space-y-2.5 p-4">
              <Toggle
                label="Dense Fog Mode"
                sub="Suspend physical blocks & trigger DAS sensing"
                on={s.fogMode}
                color="var(--color-signal)"
                icon={<CloudFog size={18} />}
                onClick={() => toggle("fogMode")}
                disabled={pending !== null}
              />
              <Toggle
                label="VVIP Security Corridor"
                sub="Enforce 5 km NDLS buffer with RPF feeds"
                on={s.vipAlert}
                color="var(--color-saffron)"
                icon={<ShieldAlert size={18} />}
                onClick={() => toggle("vipAlert")}
                disabled={pending !== null}
              />
              <Toggle
                label="Delhi Traffic Police Sync"
                sub="Avoid level crossing gates during rush hours"
                on={s.dtpRedZone}
                color="var(--color-cyan)"
                icon={<TrafficCone size={18} />}
                onClick={() => toggle("dtpRedZone")}
                disabled={pending !== null}
              />
            </div>
          </div>

          <div className="panel flex-1 flex flex-col">
            <div className="panel-hd">
              <span className="flex items-center gap-2">
                <TrainFront size={14} className="text-saffron" /> Live NTES Train Departures
              </span>
              <span className="text-[10.5px] text-faint">COA Synced</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <LiveBoard trains={state.liveTrains} />
            </div>
          </div>
        </section>
      </div>

      {/* Row 3: Section Inspector, Consensus, Load, and Audit Stream */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <section className="panel min-h-[280px]">
          <div className="panel-hd"><span>Section Inspector</span></div>
          <SectionInspector segment={selectedSegment} />
        </section>

        <section className="panel min-h-[280px]">
          <div className="panel-hd">
            <span>Inter-Department Consensus</span>
            <span className="text-[10px] text-faint">3-way vote</span>
          </div>
          <ConsensusMeter segments={state.segments} />
        </section>

        <section className="panel">
          <div className="panel-hd">
            <span>Departmental Workload</span>
            <Activity size={13} className="text-dim" />
          </div>
          <div className="space-y-3.5 p-4">
            {state.deptLoad.map((d) => (
              <div key={d.dept}>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span style={{ color: DEPT_COLORS[d.dept] }}>
                    {d.dept === "ENG" ? "Track Division (TMS)" : d.dept === "TRD" ? "Traction / OHE (TDMS)" : "Signals & Telecom (SMMS)"}
                  </span>
                  <span className="font-mono text-dim">{d.open} open · {d.critical} crit</span>
                </div>
                <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-edge">
                  <div
                    className="h-full rounded-l-full transition-all duration-700"
                    style={{ width: `${Math.min(100, d.open * 7)}%`, backgroundColor: DEPT_COLORS[d.dept], opacity: 0.6 }}
                  />
                  <div
                    className="h-full rounded-r-full transition-all duration-700"
                    style={{ width: `${Math.min(40, d.critical * 8)}%`, backgroundColor: "var(--color-signal)" }}
                  />
                </div>
                <p className="mt-1 text-[10.5px] text-faint font-mono">
                  P(fail 72h): {(d.avgFailureProb * 100).toFixed(0)}% inferred risk
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel min-h-[280px]">
          <div className="panel-hd">
            <span className="flex items-center gap-2">
              Event Spine <span className="anim-blink h-1.5 w-1.5 rounded-full bg-mint" />
            </span>
            <button
              onClick={() => setWebhookOpen(true)}
              className="flex items-center gap-1 rounded-[3px] border border-cyan/30 bg-cyan/10 px-2 py-1 text-[10.5px] font-semibold text-cyan hover:bg-cyan/20 transition"
            >
              <Webhook size={11} /> Outbound Stream
            </button>
          </div>
          <div className="p-1">
            <LiveFeed events={state.events} />
          </div>
        </section>
      </div>

      {/* Outbound Webhook Modal */}
      {webhookOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/80 p-4 " onClick={() => setWebhookOpen(false)}>
          <div className="anim-rise w-full max-w-lg overflow-hidden rounded-[4px] border border-cyan/30 bg-hull shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-cyan/20 bg-cyan/[0.06] px-5 py-3.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-cyan">
                <Webhook size={15} /> Outbound Payload — NTES & SIMRAN Stream
              </p>
              <button onClick={() => setWebhookOpen(false)} className="rounded-[3px] p-1 text-dim hover:text-ink">
                <X size={15} />
              </button>
            </div>
            <pre className="code-panel overflow-x-auto p-4 font-mono text-[11.5px] leading-relaxed">
{`POST https://ntes.indianrailways.gov.in/api/v2/tsr HTTP/1.1
Authorization: Bearer ••••••••
X-Rakshak-Signature: sha256:9f2c7a…e1

{
  "TSR_Notice": "Speed restriction 30 km/h at Km 4.2 ${firstBlock?.segmentCode ?? "NZM-ANVT"}",
  "Block_ID": "#${firstBlock?.id ?? 5}",
  "Corridor": "${firstBlock?.corridor ?? "DEL-HWH"}",
  "Window": "${firstBlock ? `${fmtMin(firstBlock.startMin)}–${fmtMin(firstBlock.endMin)}` : "00:30–03:10"} IST (Day +${firstBlock?.day ?? 0})",
  "Departments": ${JSON.stringify(firstBlock?.departments ?? ["ENG", "TRD", "SNT"])},
  "Occupancy": "${firstBlock?.isSuperBlock ? "SUPER_BLOCK_SINGLE_LINE" : "SINGLE_DEPARTMENT"}",
  "SIMRAN_Loco_Push": "queued",
  "NTES_Recompute": "queued",
  "Issued_By": "RAKSHAK-CORE v2.1",
  "Audit_Trail": "RR/BLK/2026/000${firstBlock?.id ?? 5}"
}`}
            </pre>
            <div className="border-t border-edge px-5 py-3 text-xs text-dim">
              Payload automatically pushed to NTES, SIMRAN locomotive tablets, and SMS gateways upon block sign-off.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
