"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  CloudFog,
  Eye,
  Gauge,
  GitBranch,
  Layers,
  Radio,
  ShieldAlert,
  Siren,
  Thermometer,
  Timer,
  TrafficCone,
  TrainFront,
  Webhook,
  Wind,
  X,
} from "lucide-react";
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
import { RailAlert, RailChain, RailEntityLink, RailFilterBar, RailPanel, RailTimeline, type RailTimelineRow, type RailTone } from "@/components/rail/RailKit";
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
  /* Operational map layers — each toggle shows or hides a layer backed by real
     state (block occupancy, defect register, running board, protocol flags).
     The protocol layers default to the divisional settings and are overridden
     only when the officer touches the toggle, so no effect is needed to seed
     them once state arrives. */
  const [layerOverride, setLayerOverride] = useState<{ fog?: boolean; vip?: boolean }>({});
  const [layers, setLayersState] = useState({ blocks: true, defects: true, trains: true });

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

  const fogLayer = layerOverride.fog ?? state.settings.fogMode;
  const vipLayer = layerOverride.vip ?? state.settings.vipAlert;
  const setLayers = setLayersState;

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

  const preemptExtend = useCallback(async () => {
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
  }, [overrun, refresh]);

  /* ── Situation alerts ──────────────────────────────────────────────────────
     Built ONLY from what the engines returned: the priority queue, the overrun
     monitor, the re-planning trigger, the super-block analysis, the availability
     roll-up and the event feed. Nothing here is composed by hand. */
  const heat = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const q of state.urgencyQueue) acc[q.segmentCode] = (acc[q.segmentCode] ?? 0) + 1;
    return acc;
  }, [state.urgencyQueue]);

  const shift = (() => {
    const h = new Date().getHours();
    if (h >= 6 && h < 14) return { name: "A", window: "06:00–14:00" };
    if (h >= 14 && h < 22) return { name: "B", window: "14:00–22:00" };
    return { name: "C", window: "22:00–06:00" };
  })();

  const situation = useMemo(() => {
    type Row = { key: string; severity: RailTone; title: string; detail: string; meta: string; action?: ReactNode };
    const rows: Row[] = [];

    if (overrun) {
      rows.push({
        key: "overrun",
        severity: "warning",
        title: `Block overrun risk — Job #${overrun.jobId} (${overrun.segCode})`,
        detail: `${overrun.donePct}% complete with ${overrun.remainingMin} min of occupancy left. Modelled probability of overrun ${overrun.probability.toFixed(0)}%.`,
        meta: "Working block · now",
        action: (
          <>
            <button onClick={preemptExtend} disabled={extendBusy} className="btn btn-sm">
              <Timer size={11} aria-hidden /> {extendBusy ? "Extending…" : "Extend +30 min"}
            </button>
            <RailChain>
              <RailEntityLink kind="job" label={`JOB-${overrun.jobId}`} href="/jobs" />
              <RailEntityLink kind="block" label={overrun.segCode} href="/network" />
            </RailChain>
          </>
        ),
      });
    }

    for (const q of state.urgencyQueue.filter((x) => x.urgencyClass === "EMERGENCY" || x.severity >= 8).slice(0, 3)) {
      rows.push({
        key: `urg-${q.id}`,
        severity: q.urgencyClass === "EMERGENCY" ? "critical" : "warning",
        title: `${q.defectCode} · ${q.title}`,
        detail: `Severity ${q.severity}/10 · ${q.segmentCode} · ${q.dueInDays < 0 ? `${Math.abs(q.dueInDays)} day(s) past deadline` : `due in ${q.dueInDays} day(s)`} · urgency index ${q.urgencyScore.toFixed(0)}.`,
        meta: `${q.department} · ${q.urgencyClass}`,
        action: (
          <RailChain>
            <RailEntityLink kind="defect" label={q.defectCode} href={`/defects/${q.id}`} />
            <RailEntityLink kind="asset" label={q.segmentCode} href="/network" />
          </RailChain>
        ),
      });
    }

    if (state.urgency.overdue > 0) {
      rows.push({
        key: "overdue",
        severity: "warning",
        title: `${state.urgency.overdue} defect(s) past their permitted deadline`,
        detail: `${state.counts.openDefects} open in the register · ${state.lifecycle.chronic} classified chronic (recurring on the same asset).`,
        meta: "Defect register",
        action: (
          <Link href="/defects" className="btn btn-sm">
            Open register
          </Link>
        ),
      });
    }

    if (state.counts.assetsBelowHealth > 0) {
      rows.push({
        key: "degraded",
        severity: "info",
        title: `${state.counts.assetsBelowHealth} asset(s) below the health threshold`,
        detail: state.availability
          ? `${state.availability.monitoredAssets} assets monitored · availability ${state.availability.optimizedPct.toFixed(1)}% against ${state.availability.baselinePct.toFixed(1)}% under the manual baseline.`
          : "Asset health is read from the seeded condition register.",
        meta: "Asset condition",
        action: (
          <Link href="/analytics" className="btn btn-sm">
            Availability analytics
          </Link>
        ),
      });
    }

    if (state.replanning.latestTrigger) {
      rows.push({
        key: "replan",
        severity: "advisory",
        title: `Network change detected — ${state.replanning.latestTrigger.split("·")[0].trim()}`,
        detail: `${state.replanning.replans} re-plan(s) recorded across ${state.replanning.versions} plan version(s). The re-planner waits for an officer to apply the change.`,
        meta: "Re-planning engine",
        action: (
          <Link href="/replan" className="btn btn-sm">
            Review impact
          </Link>
        ),
      });
    }

    if (state.superBlocks && state.superBlocks.opportunities > 0) {
      rows.push({
        key: "superblock",
        severity: "advisory",
        title: `${state.superBlocks.opportunities} bundling opportunity(ies) detected${
          state.superBlocks.topSegmentCode ? ` — ${state.superBlocks.topSegmentCode}` : ""
        }`,
        detail: `${state.superBlocks.recommended} recommended for coordination${
          state.superBlocks.topSavingMin ? ` · largest single saving ${(state.superBlocks.topSavingMin / 60).toFixed(1)} h` : ""
        } · ${state.superBlocks.potentialSavingH.toFixed(1)} h of possession time recoverable in total.`,
        meta: "Super-block analysis",
        action: (
          <Link href="/superblocks" className="btn btn-sm">
            Review opportunities
          </Link>
        ),
      });
    }

    for (const e of [...state.events].reverse().filter((x) => x.kind === "critical" || x.kind === "warn").slice(0, 3)) {
      rows.push({
        key: `ev-${e.id}`,
        severity: e.kind === "critical" ? "critical" : "warning",
        title: e.message,
        detail: "",
        meta: `${new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })} IST · event feed`,
        action: (
          <Link href="/alerts" className="btn btn-sm">
            Alert centre
          </Link>
        ),
      });
    }

    return rows;
  }, [overrun, preemptExtend, state.urgencyQueue, state.urgency.overdue, state.counts, state.lifecycle.chronic, state.availability, state.replanning, state.superBlocks, state.events, extendBusy]);

  /* ── Operational timeline — the event spine, newest first ── */
  const timelineRows: RailTimelineRow[] = useMemo(
    () =>
      [...state.events]
        .reverse()
        .slice(0, 30)
        .map((e) => ({
          id: e.id,
          at: new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
          title: e.message,
          tone: (e.kind === "critical" ? "critical" : e.kind === "warn" ? "warning" : e.kind === "ai" ? "advisory" : "info") as RailTone,
          meta: (
            <>
              <span className="font-semibold uppercase tracking-[0.08em]">{e.kind === "ai" ? "advisory" : e.kind}</span>
              <span aria-hidden>·</span>
              <span>divisional event spine</span>
            </>
          ),
        })),
    [state.events]
  );

  return (
    <div className="anim-rise space-y-2.5">
      <PageHeader
        module="OPS-CC"
        title="Command Centre"
        titleKey="page.command"
        subtitleKey="page.command.sub"
        subtitle="Divisional control view of the running grid: sections under occupation, the defect urgency queue, current exceptions and the decision loop between the planning engine and the divisional officer. Counts are read from the seeded prototype dataset."
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
              Situation overview
            </Link>
            <Link href="/planner" className="btn">
              Simulation
            </Link>
            <Link href="/planner" className="btn btn-primary">
              Open planner
            </Link>
          </>
        }
      >
        <span className="flex items-center gap-1.5">
          <span className="uppercase tracking-wide text-faint">Shift</span>
          <span className="font-semibold text-ink">
            {shift.name} <span className="font-mono text-[10.5px] text-dim">({shift.window})</span>
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="uppercase tracking-wide text-faint">Division</span>
          <span className="font-semibold text-ink">Delhi</span>
        </span>
      </PageHeader>

      {/* ── Operational alert band: the one warning an officer must act on now ── */}
      {overrun && (
        <div className="anim-rise flex flex-wrap items-center justify-between gap-3 border border-amber/45 border-l-[3px] bg-amber/[0.06] px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-amber/15 text-amber">
              <Timer size={15} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-amber">
                <StatusPill label="Overrun warning" tone="warning" />
                <span>Immediate action</span>
              </p>
              <p className="mt-0.5 text-[12px] text-ink">
                Job <span className="font-mono font-semibold">#{overrun.jobId}</span> on section{" "}
                <span className="font-mono font-semibold">{overrun.segCode}</span> has {overrun.remainingMin} min of block time left ({overrun.donePct}% complete) —
                modelled overrun probability <span className="font-mono font-bold text-signal">{overrun.probability.toFixed(0)}%</span>.
              </p>
              <div className="mt-1">
                <RailChain>
                  <RailEntityLink kind="job" label={`JOB-${overrun.jobId}`} href="/jobs" />
                  <RailEntityLink kind="block" label={`BLOCK · ${overrun.segCode}`} href="/network" />
                  <RailEntityLink kind="decision" label="Awaiting control decision" />
                </RailChain>
              </div>
            </div>
          </div>
          <button onClick={preemptExtend} disabled={extendBusy} className="btn btn-accent">
            {extendBusy ? "Extending…" : "Pre-emptively extend +30 min"}
          </button>
        </div>
      )}

      {role?.role === "DRM" && <DrmRow state={state} />}

      {/* ── Operational KPI row — every counter drills through to its desk ── */}
      <KpiStrip state={state} />

      {/* ── Situation board: map on the left, alerts on the right ── */}
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RailPanel
          title="Delhi NCR operational grid"
          subtitle={`${state.segments.length} sections · ${runningCount} train(s) on the running board`}
          icon={<Radio size={13} />}
          marker
          dense
          bodyClassName="flex flex-col"
          actions={
            <span className="flex items-center gap-3 text-[10.5px] font-normal normal-case tracking-normal text-dim">
              <span className="flex items-center gap-1">
                <Thermometer size={11} className="text-amber" aria-hidden />
                {state.weather.tempC}°C
              </span>
              <span className="flex items-center gap-1">
                <Wind size={11} className="text-cyan" aria-hidden />
                {state.weather.humidityPct}% RH
              </span>
              <span className={`flex items-center gap-1 font-mono ${s.fogMode ? "text-signal" : "text-mint"}`}>
                <Eye size={11} aria-hidden />
                {state.weather.visibilityM >= 1000 ? `${(state.weather.visibilityM / 1000).toFixed(1)} km` : `${state.weather.visibilityM} m`}
              </span>
            </span>
          }
        >
          {/* Layer control — each layer is real state, not decoration */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge bg-parch px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <Layers size={11} className="text-faint" aria-hidden />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-faint">Map layers</span>
            </div>
            <RailFilterBar
              items={[
                { id: "blocks", label: "Block occupation", on: layers.blocks, onToggle: () => setLayers((l) => ({ ...l, blocks: !l.blocks })), dot: "var(--color-maroon)", count: blockedIds.length },
                { id: "defects", label: "Defect register", on: layers.defects, onToggle: () => setLayers((l) => ({ ...l, defects: !l.defects })), dot: "var(--color-signal)", count: Object.keys(heat).length },
                { id: "trains", label: "Running board", on: layers.trains, onToggle: () => setLayers((l) => ({ ...l, trains: !l.trains })), dot: "var(--color-cyan)", count: state.liveTrains.length },
                { id: "fog", label: "Fog protocol", on: fogLayer, onToggle: () => setLayerOverride((o) => ({ ...o, fog: !fogLayer })), dot: "var(--color-faint)" },
                { id: "vip", label: "VVIP corridor", on: vipLayer, onToggle: () => setLayerOverride((o) => ({ ...o, vip: !vipLayer })), dot: "var(--color-amber)" },
              ]}
            />
          </div>

          <div className="map-canvas gridlines relative p-2">
            <RailMap
              stations={state.stations}
              segments={state.segments}
              heat={layers.defects ? heat : {}}
              fog={fogLayer}
              vip={vipLayer}
              blockedSegmentIds={layers.blocks ? blockedIds : []}
              liveTrains={layers.trains ? state.liveTrains : []}
              selectedSegment={selectedCode}
              onSelectSegment={(code) => setSelectedCode(code === selectedCode ? null : code)}
            />

            {s.fogMode && (
              <div className="anim-rise absolute left-3 top-3 max-w-xs border border-signal/45 border-l-[3px] bg-hull/95 p-2.5">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-signal">
                  <CloudFog size={14} aria-hidden /> Winter fog protocol active
                </p>
                <p className="mt-1 text-[11px] leading-snug text-dim">
                  Physical track blocks suspended · acoustic sensing and remote diagnostics engaged ({state.counts.virtualInspections} in queue).
                </p>
              </div>
            )}

            {s.vipAlert && (
              <div className="anim-rise absolute right-3 top-3 max-w-xs border border-amber/45 border-l-[3px] bg-hull/95 p-2.5">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-amber">
                  <ShieldAlert size={14} aria-hidden /> VVIP security corridor
                </p>
                <p className="mt-1 text-[11px] leading-snug text-dim">
                  5 km NDLS security buffer active · sub-critical maintenance blocks withheld by the planner.
                </p>
              </div>
            )}

            <div className="pointer-events-none absolute bottom-2.5 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-faint">
              {Object.entries(CORRIDOR_COLORS).map(([c, col]) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: col }} />
                  {c}
                </span>
              ))}
              <span className="text-faint/80">· SIMULATION — seeded network, schematic not to scale</span>
            </div>
          </div>
        </RailPanel>

        {/* Situation alerts — severity, time, location, action */}
        <RailPanel
          title="Situation alerts"
          subtitle={`${situation.length} item(s)`}
          icon={<Bell size={13} />}
          marker
          dense
          bodyClassName="max-h-[560px] overflow-y-auto p-2"
          actions={<span className="text-[10px] font-medium normal-case tracking-normal text-faint">What needs a decision now</span>}
        >
          {situation.length === 0 ? (
            <p className="p-4 text-center text-[11.5px] text-dim">No exception conditions on the grid. All monitored sections are within tolerance.</p>
          ) : (
            <div className="space-y-1.5">
              {situation.map((a) => (
                <RailAlert key={a.key} severity={a.severity} title={a.title} detail={a.detail} meta={a.meta} action={a.action} />
              ))}
            </div>
          )}
        </RailPanel>
      </div>

      {/* ── Operational timeline + prioritisation summary ── */}
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RailPanel
          title="Operational timeline"
          subtitle="Divisional event spine — newest first"
          icon={<Activity size={13} />}
          marker
          dense
          bodyClassName="max-h-[320px] overflow-y-auto px-3 py-1"
          actions={
            <span className="flex items-center gap-1.5">
              <button
                onClick={() => setWebhookOpen(true)}
                className="btn btn-sm"
                title="Documented outbound event contract for NTES / SIMRAN — not transmitted from this build"
              >
                <Webhook size={11} aria-hidden /> Outbound contract
              </button>
              <Link href="/audit" className="btn btn-sm">
                Audit trail
              </Link>
            </span>
          }
        >
          <RailTimeline rows={timelineRows} />
        </RailPanel>

        <div className="flex min-w-0 flex-col gap-2.5">
          <UrgencySummary summary={state.urgency} />
          <RailPanel title="Prioritisation" subtitle="Urgency engine output" icon={<Gauge size={13} />} marker dense bodyClassName="p-2.5">
            <p className="text-[11.5px] leading-snug text-dim">
              Ranked by the deterministic urgency engine (criticality × deadline × recurrence band × availability impact). The queue below is the
              officer&apos;s work list — the planner schedules what is ranked here.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <span className="border border-edge bg-parch px-2 py-1.5">
                <span className="block text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint">Emergency</span>
                <span className="font-mono text-[15px] font-bold text-signal">{state.urgency.emergency}</span>
              </span>
              <span className="border border-edge bg-parch px-2 py-1.5">
                <span className="block text-[9.5px] font-bold uppercase tracking-[0.08em] text-faint">Overdue</span>
                <span className="font-mono text-[15px] font-bold text-amber">{state.urgency.overdue}</span>
              </span>
            </div>
            <Link href="/defects" className="btn btn-sm mt-2 w-full">
              Open defect register
            </Link>
          </RailPanel>
        </div>
      </div>

      {/* ── Prioritisation queue (full register view) ── */}
      <RailPanel title="Prioritisation queue" subtitle="Defects awaiting a planning window" icon={<Siren size={13} />} marker dense bodyClassName="p-0">
        <UrgencyQueue items={state.urgencyQueue} limit={8} />
      </RailPanel>

      {/* ── Running board and divisional operating-mode triggers ── */}
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RailPanel
          title="Running board"
          subtitle="Seeded timetable · simulated feed"
          icon={<TrainFront size={13} />}
          marker
          dense
          bodyClassName="max-h-[300px] overflow-y-auto"
          actions={
            <span className="flex items-center gap-1.5">
              <StatusPill label="Simulation" tone="ai" />
              <Link href="/trains" className="btn btn-sm">
                Train enquiry
              </Link>
            </span>
          }
        >
          <LiveBoard trains={state.liveTrains} />
        </RailPanel>

        <RailPanel
          title="Operating mode triggers"
          subtitle="Divisional protocol switches"
          icon={<TrafficCone size={13} />}
          marker
          dense
          bodyClassName="space-y-2 p-2.5"
          actions={<span className="text-[10px] font-normal normal-case tracking-normal text-dim">{pending ? "Applying…" : "Applied immediately"}</span>}
        >
          <Toggle
            label="Dense fog mode"
            sub="Suspend physical blocks, engage acoustic sensing"
            on={s.fogMode}
            color="var(--color-signal)"
            icon={<CloudFog size={17} />}
            onClick={() => toggle("fogMode")}
            disabled={pending !== null}
          />
          <Toggle
            label="VVIP security corridor"
            sub="5 km NDLS buffer; withhold sub-critical blocks"
            on={s.vipAlert}
            color="var(--color-amber)"
            icon={<ShieldAlert size={17} />}
            onClick={() => toggle("vipAlert")}
            disabled={pending !== null}
          />
          <Toggle
            label="Traffic police sync"
            sub="Avoid level-crossing gates in rush hours"
            on={s.dtpRedZone}
            color="var(--color-cyan)"
            icon={<TrafficCone size={17} />}
            onClick={() => toggle("dtpRedZone")}
            disabled={pending !== null}
          />
        </RailPanel>
      </div>

      {/* Row 3: Section Inspector, Consensus, Load, and Audit Stream */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 xl:grid-cols-4">
        <RailPanel title="Section inspector" subtitle="Selected section" icon={<Radio size={13} />} marker dense bodyClassName="min-h-[260px]">
          <SectionInspector segment={selectedSegment} />
        </RailPanel>

        <RailPanel title="Inter-department consensus" subtitle="Three-way vote" icon={<Activity size={13} />} marker dense bodyClassName="min-h-[260px]">
          <ConsensusMeter segments={state.segments} />
        </RailPanel>

        <RailPanel title="Departmental workload" subtitle="Open register by department" icon={<Gauge size={13} />} marker dense bodyClassName="space-y-3 p-3">
            {state.deptLoad.map((d) => (
              <div key={d.dept}>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span style={{ color: DEPT_COLORS[d.dept] }}>
                    {d.dept === "ENG" ? "Track Division (TMS)" : d.dept === "TRD" ? "Traction / OHE (TDMS)" : "Signals & Telecom (SMMS)"}
                  </span>
                  <span className="font-mono text-dim">{d.open} open · {d.critical} crit</span>
                </div>
                {/* Load bar: total open register, with the critical share marked on the same axis. */}
                <div className="mt-1 flex h-[7px] overflow-hidden bg-edge">
                  <div className="h-full" style={{ width: `${Math.max(3, Math.min(100, d.open * 7))}%`, backgroundColor: DEPT_COLORS[d.dept] }} />
                  <div className="h-full" style={{ width: `${Math.max(0, Math.min(30, d.critical * 6))}%`, backgroundColor: "var(--color-signal)" }} />
                </div>
                <p className="mt-1 font-mono text-[10px] text-faint">
                  {d.critical} critical of {d.open} open · modelled 72-hour failure risk {(d.avgFailureProb * 100).toFixed(0)}%
                </p>
              </div>
            ))}
        </RailPanel>

        <RailPanel
          title="Event spine — full feed"
          subtitle="Expandable wall-display view"
          icon={<Activity size={13} />}
          marker
          dense
          bodyClassName="p-1"
          actions={
            <button onClick={() => setWebhookOpen(true)} className="btn btn-sm" title="Documented outbound event contract — not transmitted from this build">
              <Webhook size={11} aria-hidden /> Outbound contract
            </button>
          }
        >
          <LiveFeed events={state.events} />
        </RailPanel>
      </div>

      {/* Outbound Webhook Modal */}
      {webhookOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/80 p-4 " onClick={() => setWebhookOpen(false)}>
          <div className="anim-rise w-full max-w-lg overflow-hidden rounded-[4px] border border-cyan/30 bg-hull shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-cyan/20 bg-cyan/[0.06] px-5 py-3.5">
              <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-cyan">
                <Webhook size={14} aria-hidden /> Outbound event contract
                <StatusPill label="Not transmitted" tone="warning" />
              </p>
              <button onClick={() => setWebhookOpen(false)} className="rounded-[3px] p-1 text-dim hover:text-ink">
                <X size={15} />
              </button>
            </div>
            <pre className="code-panel overflow-x-auto p-4 font-mono text-[11.5px] leading-relaxed">
{`POST {NTES_ENDPOINT}/api/v2/tsr            # endpoint withheld — Integration Contract Ready

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
            <div className="space-y-1.5 border-t border-edge px-4 py-3 text-[11.5px] leading-snug text-dim">
              <p>
                This is the <span className="font-semibold text-ink">documented contract</span> the platform is built to emit on block sign-off. It is generated from the
                standing plan for review — <span className="font-semibold text-ink">nothing is transmitted from this build</span>.
              </p>
              <p className="text-faint">
                SIMULATION · no NTES, SIMRAN, COA or departmental endpoint is contacted, and no credentials are configured. Contract shape, field names and the audit
                reference are stable, so a sanctioned integration can be switched on without a code change.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
