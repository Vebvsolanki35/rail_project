"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardCheck, Clock3, HardHat, Inbox, Loader2, Send, Star, X, MapPin } from "lucide-react";
import RailMap from "@/components/RailMap";
import BeforeAfterModal from "@/components/BeforeAfterModal";
import SmartImg from "@/components/SmartImg";
import { DEPT_COLORS, INSPECTOR_ZONE, KARMI_TEAMS, fmtMin } from "@/lib/engine/network";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import type { DashboardState, JobDTO } from "@/lib/engine/types";

const WINDOWS = [
  { label: "Golden 00:30–03:30 (Night)", start: 30, end: 210 },
  { label: "Golden+ 00:30–04:30 (Extended)", start: 30, end: 270 },
  { label: "Shoulder 10:45–13:15 (Midday)", start: 645, end: 795 },
];

export default function FieldClient({ initialState, initialJobs }: { initialState: DashboardState; initialJobs: JobDTO[] }) {
  const [dash, setDash] = useState(initialState);
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState<number | null>(null);
  const [reviewJob, setReviewJob] = useState<JobDTO | null>(null);
  const [allotTarget, setAllotTarget] = useState<JobDTO | null>(null);
  const [teamSel, setTeamSel] = useState<Record<number, string>>({});
  const [winSel, setWinSel] = useState<Record<number, number>>({});
  const [superSel, setSuperSel] = useState<Record<number, boolean>>({});

  const lastSig = useRef("");
  const refresh = useCallback(async (force = false) => {
    const [j, s] = await Promise.all([fetch("/api/jobs").then((r) => r.json()), fetch("/api/state", { cache: "no-store" }).then((r) => r.json())]);
    const sig = (j.jobs ?? []).map((x: JobDTO) => `${x.id}${x.status}${x.windowEnd}`).join("|") + s.settings.fogMode + s.settings.vipAlert + s.liveTrains.length;
    if (!force && sig === lastSig.current) return;
    lastSig.current = sig;
    setJobs(j.jobs ?? []);
    setDash(s);
  }, []);

  async function confirmAllot() {
    if (!allotTarget) return;
    const job = allotTarget;
    const team = teamSel[job.id] ?? `${KARMI_TEAMS[job.department][0].id} — ${KARMI_TEAMS[job.department][0].leader}`;
    const w = WINDOWS[winSel[job.id] ?? 0];
    setBusy(job.id);
    try {
      await fetch("/api/jobs/allot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, teamLeader: team, windowStart: w.start, windowEnd: w.end, isSuperBlock: !!superSel[job.id] }),
      });
      setAllotTarget(null);
      await refresh(true);
    } finally {
      setBusy(null);
    }
  }

  async function decide(accept: boolean, reason?: string) {
    if (!reviewJob) return;
    const id = reviewJob.id;
    setBusy(id);
    try {
      await fetch("/api/jobs/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id, accept, reason }),
      });
      await refresh(true);
    } finally {
      setBusy(null);
    }
    setReviewJob(null);
  }

  useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const zoneIds = new Set(dash.segments.filter((s) => INSPECTOR_ZONE.sections.includes(s.code)).map((s) => s.id));
  const zoneJobs = jobs.filter((j) => zoneIds.has(j.segmentId) && j.status !== "COMPLETED");
  const pending = zoneJobs.filter((j) => j.status === "PENDING");
  const active = zoneJobs.filter((j) => j.status === "ALLOTTED" || j.status === "IN_PROGRESS");
  const awaiting = zoneJobs.filter((j) => j.status === "AWAITING_REVIEW");
  const blockedIds = zoneJobs.filter((j) => j.status === "IN_PROGRESS").map((j) => j.segmentId);

  return (
    <div className="anim-rise space-y-3">
      <PageHeader
        module="FLD-INS"
        title="Field Dashboard"
        titleKey="page.field"
        subtitleKey="page.field.sub"
        subtitle={`Inspector beat operations — allot verified defects to a gang with a sanctioned block window, follow work on site, and validate completed repairs against GPS-stamped evidence. Beat: ${INSPECTOR_ZONE.name}.`}
        crumbs={[{ label: "Maintenance" }, { label: "Field Dashboard" }]}
        state={
          awaiting.length > 0
            ? `${awaiting.length} repair(s) awaiting inspector sign-off`
            : active.length > 0
              ? `${active.length} gang(s) working on the beat`
              : pending.length > 0
                ? `${pending.length} defect(s) pending allotment`
                : "Beat clear"
        }
        stateTone={pending.length > 0 ? "critical" : awaiting.length > 0 ? "warning" : "success"}
        reference={INSPECTOR_ZONE.sections.join(" · ")}
      />

      {/* Zone Header */}
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-saffron/30 bg-saffron/15 text-saffron">
            <HardHat size={18} aria-hidden />
          </span>
          <div>
            <h2 className="text-[13px] font-bold text-ink">Field operations console</h2>
            <p className="text-[11px] text-dim">
              {INSPECTOR_ZONE.name} · Assigned sections: {INSPECTOR_ZONE.sections.join(" · ")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={`${pending.length} pending allotment`} tone={pending.length ? "critical" : "success"} />
          <StatusPill label={`${active.length} active on track`} tone={active.length ? "warning" : "neutral"} />
          <StatusPill label={`${awaiting.length} ready for sign-off`} tone={awaiting.length ? "info" : "neutral"} />
        </div>
      </section>

      {/* Grid: Map on Left, Active Worklists on Right */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* Track Jurisdiction Map */}
        <section className="panel xl:col-span-1 overflow-hidden flex flex-col">
          <div className="panel-hd">
            <span>Inspector Beat Focus</span>
            <span className="text-[10px] text-mint font-mono">NDLS Sector</span>
          </div>
          <div className="map-canvas gridlines relative flex-1 p-2">
            <RailMap
              stations={dash.stations}
              segments={dash.segments}
              blockedSegmentIds={blockedIds}
              fog={dash.settings.fogMode}
              vip={dash.settings.vipAlert}
              liveTrains={dash.liveTrains}
              dimExcept={INSPECTOR_ZONE.sections}
            />
          </div>
        </section>

        {/* Actionable Tickets */}
        <section className="xl:col-span-2 space-y-3">
          {/* Awaiting Review (Verification & Sign-off) */}
          {awaiting.length > 0 && (
            <div className="panel border-mint/40 bg-mint/[0.02]">
              <div className="panel-hd border-mint/20 text-mint">
                <span className="flex items-center gap-2">
                  <ClipboardCheck size={14} /> Completed Repairs Awaiting Sign-Off ({awaiting.length})
                </span>
                <span className="text-xs font-normal text-dim">Tamper-Proof Photo Verification</span>
              </div>
              <div className="divide-y divide-edge/60">
                {awaiting.map((j) => (
                  <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-primary/[0.03] transition">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-saffron">#{j.id}</span>
                        <h4 className="text-xs font-bold text-ink truncate">{j.title}</h4>
                        <span className="rounded-[2px] px-1.5 py-0.2 text-[10px] font-semibold" style={{ color: DEPT_COLORS[j.department] }}>
                          {j.department}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-dim">
                        Section <strong className="font-mono text-ink">{j.segmentCode}</strong> · {j.chainage} · Crew: {j.teamLeader}
                      </p>
                    </div>

                    <button
                      onClick={() => setReviewJob(j)}
                      className="flex items-center gap-1.5 rounded-[4px] bg-mint px-4 py-2 text-xs font-bold on-accent shadow transition hover:bg-mint"
                    >
                      <ClipboardCheck size={14} /> Review & Sign-Off Block
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Validation / Allotment */}
          <div className="panel">
            <div className="panel-hd">
              <span>Reported Defects Pending Gang Allotment ({pending.length})</span>
              <span className="text-xs text-dim font-normal">Step 1: Crew & Window Allotment</span>
            </div>
            <div className="divide-y divide-edge/60 max-h-80 overflow-y-auto">
              {pending.length === 0 && (
                <p className="p-8 text-center text-xs text-dim">All defects in your beat are currently allotted.</p>
              )}
              {pending.map((j) => (
                <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-primary/[0.03] transition">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-saffron">#{j.id}</span>
                      <h4 className="text-xs font-bold text-ink">{j.title}</h4>
                      <span className="rounded-[2px] px-1.5 py-0.2 text-[10px] font-semibold" style={{ color: DEPT_COLORS[j.department] }}>
                        {j.department}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-dim">
                      {j.segmentCode} · {j.chainage} · {j.note}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setAllotTarget(j);
                      setTeamSel((prev) => ({ ...prev, [j.id]: `${KARMI_TEAMS[j.department][0].id} — ${KARMI_TEAMS[j.department][0].leader}` }));
                    }}
                    className="flex items-center gap-1.5 rounded-[4px] border border-saffron/40 bg-saffron/10 px-3.5 py-1.5 text-xs font-semibold text-saffron hover:bg-saffron/20 transition"
                  >
                    <Send size={12} /> Allot Crew & Window
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Active on Track */}
          <div className="panel">
            <div className="panel-hd">
              <span>Crews Active on Track ({active.length})</span>
              <span className="text-xs text-dim font-normal">Real-Time Site Execution</span>
            </div>
            <div className="divide-y divide-edge/60 max-h-64 overflow-y-auto">
              {active.length === 0 && (
                <p className="p-6 text-center text-xs text-dim">No crews currently occupying the track.</p>
              )}
              {active.map((j) => (
                <div key={j.id} className="flex items-center justify-between p-3.5 hover:bg-primary/[0.03]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink">#{j.id}</span>
                      <span className="text-xs font-bold text-ink">{j.title}</span>
                      <span className={`rounded-[2px] px-1.5 py-0.2 text-[10px] font-bold ${j.status === "IN_PROGRESS" ? "bg-saffron/15 text-saffron" : "bg-cyan/15 text-cyan"}`}>
                        {j.status === "IN_PROGRESS" ? "On Site / Working" : "Allotted"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-dim">
                      {j.segmentCode} · Leader: <strong className="text-ink">{j.teamLeader}</strong> · Window: {j.windowStart != null ? `${fmtMin(j.windowStart)}–${fmtMin(j.windowEnd ?? 0)} IST` : "Pending"}
                    </p>
                  </div>
                  {j.beforePhoto && (
                    <span className="flex items-center gap-1 text-[11px] text-mint font-medium">
                      <CheckCircle2 size={12} /> Before-Photo Locked
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Allotment Popup Modal */}
      {allotTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/80 p-4 " onClick={() => setAllotTarget(null)}>
          <div className="anim-rise w-full max-w-md overflow-hidden rounded-[4px] border border-saffron/30 bg-hull shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
              <div>
                <p className="text-xs font-bold text-saffron">Allot Maintenance Block</p>
                <h3 className="text-sm font-bold text-ink mt-0.5">{allotTarget.title}</h3>
              </div>
              <button onClick={() => setAllotTarget(null)} className="rounded-[3px] p-1 text-dim hover:text-ink"><X size={15} /></button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-dim mb-1.5">Assign Gang Team Leader</label>
                <select
                  value={teamSel[allotTarget.id] ?? ""}
                  onChange={(e) => setTeamSel((prev) => ({ ...prev, [allotTarget.id]: e.target.value }))}
                  className="w-full rounded-[4px] border border-edge bg-panel px-3 py-2 text-xs font-medium text-ink outline-none"
                >
                  {KARMI_TEAMS[allotTarget.department]?.map((t) => (
                    <option key={t.id} value={`${t.id} — ${t.leader}`}>
                      {t.id} · {t.leader} ({t.crew} members · {t.exp})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-dim mb-1.5">Sanctioned Block Window</label>
                <div className="space-y-1.5">
                  {WINDOWS.map((w, idx) => (
                    <button
                      key={w.label}
                      type="button"
                      onClick={() => setWinSel((prev) => ({ ...prev, [allotTarget.id]: idx }))}
                      className={`flex w-full items-center justify-between rounded-[4px] border p-3 text-xs font-medium transition ${
                        (winSel[allotTarget.id] ?? 0) === idx
                          ? "border-saffron/60 bg-saffron/15 text-saffron"
                          : "border-edge bg-panel text-dim hover:text-ink"
                      }`}
                    >
                      <span>{w.label}</span>
                      <span className="font-mono text-faint">{fmtMin(w.start)}–{fmtMin(w.end)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={confirmAllot}
                disabled={busy !== null}
                className="w-full rounded-[4px] bg-saffron py-2.5 text-xs font-bold on-accent shadow transition hover:bg-saffron disabled:opacity-50"
              >
                {busy === allotTarget.id ? "Allotting…" : "Confirm Allotment & Transmit Permit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewJob && (
        <BeforeAfterModal
          job={reviewJob}
          onClose={() => setReviewJob(null)}
          onDecide={decide}
          busy={busy === reviewJob.id}
        />
      )}
    </div>
  );
}
