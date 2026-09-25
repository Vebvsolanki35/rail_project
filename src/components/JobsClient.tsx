"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "@/lib/useNow";
import { BadgeCheck, Boxes, Camera, ChevronDown, Clock3, FileCheck2, Loader2, MapPin, Pause, Play, Printer, Satellite, ShieldCheck, Timer, WifiOff, Wrench, X, AlertCircle } from "lucide-react";
import RailMap from "@/components/RailMap";
import SmartImg from "@/components/SmartImg";
import { DEPT_COLORS, KARMI_TEAMS, fmtMin } from "@/lib/engine/network";
import type { DashboardState, JobDTO } from "@/lib/engine/types";
import { getRole, DEPT_LABEL } from "@/lib/role";

const STEPS = ["Allotted", "On Site", "Photo Stamped", "Signed Off"];
function stageOf(status: string): number {
  return status === "ALLOTTED" ? 0 : status === "IN_PROGRESS" ? 1 : status === "AWAITING_REVIEW" ? 2 : 3;
}

function jobPermitText(job: JobDTO): string[] {
  return [
    `PERMIT TO WORK — Ref RR/PTW/${String(job.id).padStart(4, "0")} · issued by SSE/${job.department}/${job.segmentCode.split("-")[1]} under GR&SR 15.06.`,
    `LOCATION: ${job.chainage}, section ${job.segmentCode}. Sanctioned window ${job.windowStart != null ? `${fmtMin(job.windowStart)}–${fmtMin(job.windowEnd ?? 0)} IST` : "as allotted"} under traffic block. Lookout man mandatory.`,
    `SCOPE: ${job.title}. ${job.note}`,
    `PROTECTION: TSR 30 km/h on approach; detonators at 1200 m both ends; OHE ${job.department === "TRD" ? "earthed at both ends — power block taken" : "live — maintain 2 m clearance"}; walk on cess, never between running rails.`,
    `PROOF PROTOCOL: BEFORE photo at start + AFTER photo at completion, both GPS-stamped. Block releases only after Inspector digital sign-off.`,
    `EMERGENCY: contact Section Controller NDLS on railway phone; evacuate on two long whistle blasts. Auto-revocation on VVIP alert or visibility < 50 m.`,
  ];
}

function crewFor(job: JobDTO) {
  const id = job.teamLeader?.split(" — ")[0] ?? "";
  const team = KARMI_TEAMS[job.department]?.find((t) => id.startsWith(t.id));
  return team ? `${team.leader} + ${team.crew - 1} members` : (job.teamLeader ?? "");
}

const QUEUE_KEY = "rr.offlineQueue";
type QueuedShot = { url: string; body: Record<string, unknown>; jobId: number; at: number };

export default function JobsClient({ initialState, initialJobs }: { initialState: DashboardState; initialJobs: JobDTO[] }) {
  const [dash, setDash] = useState(initialState);
  const [jobs, setJobs] = useState(initialJobs);
  const [dept, setDept] = useState<"ENG" | "TRD" | "SNT">("ENG");
  const [busy, setBusy] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [permitJob, setPermitJob] = useState<JobDTO | null>(null);
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<QueuedShot[]>([]);
  const clock = useNow(15000);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingAction = useRef<{ jobId: number; kind: "start" | "complete" } | null>(null);

  useEffect(() => {
    // Device-local reads (roster dept, offline queue) land one tick after mount
    // so no state is written synchronously inside the effect body.
    const timer = setTimeout(() => {
      const r = getRole();
      if (r?.role === "KARMI" && r.dept) setDept(r.dept);
      try {
        setQueue(JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]"));
      } catch {
        /* empty queue */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const lastSig = useRef("");
  const refresh = useCallback(async (force = false) => {
    const [j, s] = await Promise.all([fetch("/api/jobs").then((r) => r.json()), fetch("/api/state", { cache: "no-store" }).then((r) => r.json())]);
    const sig = (j.jobs ?? []).map((x: JobDTO) => `${x.id}${x.status}`).join("|") + s.settings.fogMode + s.liveTrains.length;
    if (!force && sig === lastSig.current) return;
    lastSig.current = sig;
    setJobs(j.jobs ?? []);
    setDash(s);
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  async function post(url: string, body: Record<string, unknown>, jobId: number, at: number) {
    if (offline) {
      const q = [...queue, { url, body, jobId, at }];
      setQueue(q);
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
      return;
    }
    setBusy(jobId);
    try {
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await refresh(true);
    } finally {
      setBusy(null);
    }
  }

  const deptJobs = jobs.filter((j) => j.department === dept);

  return (
    <div className="anim-rise space-y-4">
      {/* Header & Dept Selector */}
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Wrench size={20} />
          </span>
          <div>
            <h2 className="text-base font-bold text-ink">Field Maintenance Portal</h2>
            <p className="text-xs text-dim">Work orders · Site safety compliance · GPS before/after photographic proof</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Department Tabs */}
          <div className="flex rounded-xl border border-edge bg-hull p-1">
            {(["ENG", "TRD", "SNT"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDept(d)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  dept === d ? "bg-purple-600 text-white shadow-sm" : "text-dim hover:text-ink"
                }`}
              >
                {d} Division
              </button>
            ))}
          </div>

          <button
            onClick={() => setOffline(!offline)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              offline
                ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                : "border-edge bg-panel text-dim hover:text-ink"
            }`}
          >
            <WifiOff size={13} />
            {offline ? "Simulate Offline (Tunnel)" : "Online Sync"}
          </button>
        </div>
      </section>

      {/* Jobs List */}
      <div className="space-y-3">
        {deptJobs.length === 0 && (
          <div className="panel p-12 text-center text-xs text-dim">
            No work orders assigned to {dept} department currently.
          </div>
        )}

        {deptJobs.map((j) => {
          const stepIdx = stageOf(j.status);
          return (
            <div key={j.id} className="panel p-5 transition hover:border-edge">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-amber-400">#{j.id}</span>
                    <h3 className="text-sm font-bold text-ink">{j.title}</h3>
                    <span className="rounded-full px-2.5 py-0.2 text-[10.5px] font-semibold border" style={{ borderColor: `${DEPT_COLORS[j.department]}40`, backgroundColor: `${DEPT_COLORS[j.department]}15`, color: DEPT_COLORS[j.department] }}>
                      {j.department}
                    </span>
                    {j.isSuperBlock && (
                      <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2 py-0.2 text-[10px] font-bold text-purple-300">
                        Super-Block
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-dim">
                    Section <strong className="font-mono text-ink">{j.segmentCode}</strong> · {j.chainage} · Gang: <span className="text-ink">{crewFor(j)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPermitJob(j)}
                    className="flex items-center gap-1.5 rounded-xl border border-edge bg-hull px-3 py-1.5 text-xs font-medium text-dim hover:text-ink transition"
                  >
                    <FileCheck2 size={13} className="text-amber-400" /> Permit to Work
                  </button>

                  {j.status === "ALLOTTED" && (
                    <button
                      onClick={() => {
                        post("/api/jobs/start", { jobId: j.id, gps: "28.64290°N, 77.21970°E" }, j.id, Date.now());
                      }}
                      disabled={busy === j.id}
                      className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow transition hover:bg-amber-400 disabled:opacity-50"
                    >
                      {busy === j.id ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      Arrive & Capture Before-Photo
                    </button>
                  )}

                  {j.status === "IN_PROGRESS" && (
                    <button
                      onClick={() => {
                        post("/api/jobs/complete", { jobId: j.id, gps: "28.64290°N, 77.21970°E" }, j.id, Date.now());
                      }}
                      disabled={busy === j.id}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {busy === j.id ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      Complete & Capture After-Photo
                    </button>
                  )}

                  {j.status === "AWAITING_REVIEW" && (
                    <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                      Photos Submitted (Awaiting Inspector Sign-off)
                    </span>
                  )}

                  {j.status === "COMPLETED" && (
                    <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                      <BadgeCheck size={13} className="inline mr-1" /> Signed Off & Released
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Steps */}
              <div className="mt-5 grid grid-cols-4 gap-2 border-t border-edge/60 pt-4">
                {STEPS.map((step, sIdx) => {
                  const done = sIdx <= stepIdx;
                  return (
                    <div key={step} className="flex items-center gap-2 text-xs">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          done ? "bg-emerald-500 text-slate-950" : "bg-panel border border-edge text-faint"
                        }`}
                      >
                        {done ? "✓" : sIdx + 1}
                      </span>
                      <span className={`font-medium ${done ? "text-ink" : "text-faint"}`}>{step}</span>
                    </div>
                  );
                })}
              </div>

              {/* Photos Preview if available */}
              {(j.beforePhoto || j.afterPhoto) && (
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-edge/60 pt-4">
                  {j.beforePhoto && (
                    <div className="rounded-xl border border-edge bg-hull/50 p-2 text-xs">
                      <p className="font-semibold text-amber-400 mb-1">Before Repair Photo (GPS Stamped)</p>
                      <div className="aspect-[16/9] overflow-hidden rounded-lg bg-black/40">
                                                <SmartImg src={j.beforePhoto} alt="Before repair" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  )}
                  {j.afterPhoto && (
                    <div className="rounded-xl border border-edge bg-hull/50 p-2 text-xs">
                      <p className="font-semibold text-emerald-400 mb-1">After Repair Photo (GPS Stamped)</p>
                      <div className="aspect-[16/9] overflow-hidden rounded-lg bg-black/40">
                                                <SmartImg src={j.afterPhoto} alt="After repair" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Permit to Work Sheet Modal */}
      {permitJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setPermitJob(null)}>
          <div className="anim-rise w-full max-w-xl overflow-hidden rounded-2xl border border-edge bg-hull shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FileCheck2 size={16} className="text-amber-400" />
                <h3 className="text-xs font-bold text-ink">Sanctioned Permit to Work (GR&SR 15.06)</h3>
              </div>
              <button onClick={() => setPermitJob(null)} className="rounded-lg p-1 text-dim hover:text-ink"><X size={15} /></button>
            </div>
            <div className="p-5 space-y-3 font-mono text-xs text-dim bg-[#070b13]">
              {jobPermitText(permitJob).map((p, idx) => (
                <p key={idx} className="leading-relaxed text-ink/90">{p}</p>
              ))}
            </div>
            <div className="border-t border-edge px-5 py-3 flex justify-end">
              <button onClick={() => setPermitJob(null)} className="rounded-xl bg-panel border border-edge px-4 py-2 text-xs font-medium text-ink">
                Close Permit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
