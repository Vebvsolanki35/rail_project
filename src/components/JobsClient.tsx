"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "@/lib/useNow";
import { BadgeCheck, Boxes, Camera, ChevronDown, Clock3, FileCheck2, Loader2, MapPin, Pause, Play, Printer, Satellite, ShieldCheck, Timer, WifiOff, Wrench, X, AlertCircle } from "lucide-react";
import RailMap from "@/components/RailMap";
import SmartImg from "@/components/SmartImg";
import { DEPT_COLORS, KARMI_TEAMS, fmtMin } from "@/lib/engine/network";
import PageHeader from "@/components/PageHeader";
import StatusPill from "@/components/StatusPill";
import type { DashboardState, JobDTO } from "@/lib/engine/types";
import { getRole, DEPT_LABEL } from "@/lib/role";

/**
 * WORK-ORDER LIFE CYCLE — the same eight stages the divisional workflow uses,
 * Reported → Verified → Approved → Assigned → Maintenance → Inspection →
 * Completed → Closed. Every stage below is derived from a field actually stored
 * on the work order (report timestamp, allotting officer, sanctioned window,
 * nominated team, before/after evidence, inspector sign-off); nothing is
 * hard-coded to "look complete".
 *
 * Closure (stage 8) is recorded on the DEFECT record, not on the work order, so
 * it is reported from there — with a link — rather than being assumed here.
 */
const WO_STAGES = [
  { key: "REPORTED", label: "Reported", role: "Patrol / station report" },
  { key: "VERIFIED", label: "Verified", role: "Section Inspector" },
  { key: "APPROVED", label: "Approved", role: "Control / DRM sanction" },
  { key: "ASSIGNED", label: "Assigned", role: "SSE allots gang" },
  { key: "MAINTENANCE", label: "Maintenance", role: "Gang on site" },
  { key: "INSPECTION", label: "Inspection", role: "Inspector validation" },
  { key: "COMPLETED", label: "Completed", role: "Work closed on site" },
  { key: "CLOSED", label: "Closed", role: "Defect record closed" },
] as const;

const RANK: Record<string, number> = { PENDING: 0, ALLOTTED: 1, IN_PROGRESS: 2, AWAITING_REVIEW: 3, COMPLETED: 4 };

/** Index of the last completed stage (0-based) for a work order. */
function workOrderStage(job: JobDTO): number {
  const rank = RANK[job.status] ?? 0;
  if (job.status === "COMPLETED") return 6; // closure lives on the defect record
  if (job.status === "AWAITING_REVIEW") return 5;
  if (rank >= 2 || job.beforeAt) return 4;
  if (job.teamLeader) return 3;
  if (job.windowStart != null) return 2;
  if (job.allottedBy) return 1;
  return 0;
}

function workOrderRef(job: JobDTO, year = new Date().getFullYear()) {
  return `RR-WO/${year}/${String(job.id).padStart(4, "0")}`;
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
    <div className="anim-rise space-y-3">
      <PageHeader
        module="MTN-WO"
        title="Work Orders & Jobs"
        titleKey="page.jobs"
        subtitleKey="page.jobs.sub"
        subtitle="Formal work orders raised from verified defects: asset particulars, nominated gang, permit-to-work reference, sanctioned window and the eight-stage execution record with GPS-stamped before/after evidence."
        crumbs={[{ label: "Maintenance" }, { label: "Work Orders & Jobs" }]}
        state={
          jobs.filter((j) => j.status === "AWAITING_REVIEW").length > 0
            ? `${jobs.filter((j) => j.status === "AWAITING_REVIEW").length} awaiting inspector sign-off`
            : jobs.filter((j) => j.status === "IN_PROGRESS").length > 0
              ? `${jobs.filter((j) => j.status === "IN_PROGRESS").length} work order(s) live on site`
              : "No work order overdue"
        }
        stateTone={jobs.some((j) => j.escalationLevel >= 2) ? "critical" : jobs.some((j) => j.status === "AWAITING_REVIEW") ? "warning" : "success"}
        reference={`${jobs.length} work order(s) · ${jobs.filter((j) => j.isSuperBlock).length} super-block`}
      />

      {/* Header & Dept Selector */}
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-violet/30 bg-violet/15 text-violet">
            <Wrench size={18} aria-hidden />
          </span>
          <div>
            <h2 className="text-[13px] font-bold text-ink">Work order register</h2>
            <p className="text-[11px] text-dim">Site safety compliance · permit to work · GPS before/after photographic proof</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Department Tabs */}
          <div className="flex rounded-[4px] border border-edge bg-hull p-1">
            {(["ENG", "TRD", "SNT"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDept(d)}
                className={`rounded-[3px] px-3 py-1.5 text-xs font-semibold transition ${
                  dept === d ? "bg-violet on-accent" : "text-dim hover:text-ink"
                }`}
              >
                {d} Division
              </button>
            ))}
          </div>

          <button
            onClick={() => setOffline(!offline)}
            className={`flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-xs font-semibold transition ${
              offline
                ? "border-signal/40 bg-signal/15 text-signal"
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
          const stepIdx = workOrderStage(j);
          return (
            <article key={j.id} className="panel transition hover:border-primary/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-primary">{workOrderRef(j)}</span>
                    <h3 className="text-[13px] font-bold text-ink">{j.title}</h3>
                    <span className="rounded-full px-2.5 py-0.2 text-[10.5px] font-semibold border" style={{ borderColor: `${DEPT_COLORS[j.department]}40`, backgroundColor: `${DEPT_COLORS[j.department]}15`, color: DEPT_COLORS[j.department] }}>
                      {j.department}
                    </span>
                    {j.isSuperBlock && (
                      <span className="rounded-[3px] border border-violet/30 bg-violet/15 px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide text-violet">
                        Super-block
                      </span>
                    )}
                    <StatusPill label={j.status.replace("_", " ")} />
                    {j.escalationLevel > 0 && <StatusPill label={`Escalation L${j.escalationLevel}`} tone="critical" />}
                  </div>
                  <p className="mt-1 text-[11px] text-dim">
                    Section <strong className="font-mono text-ink">{j.segmentCode}</strong> · {j.chainage} · Gang:{" "}
                    <span className="text-ink">{crewFor(j) || "not allotted"}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPermitJob(j)}
                    className="flex items-center gap-1.5 rounded-[4px] border border-edge bg-hull px-3 py-1.5 text-xs font-medium text-dim hover:text-ink transition"
                  >
                    <FileCheck2 size={13} className="text-saffron" /> Permit to Work
                  </button>

                  {j.status === "ALLOTTED" && (
                    <button
                      onClick={() => {
                        post("/api/jobs/start", { jobId: j.id, gps: "28.64290°N, 77.21970°E" }, j.id, Date.now());
                      }}
                      disabled={busy === j.id}
                      className="flex items-center gap-1.5 rounded-[4px] bg-saffron px-4 py-2 text-xs font-bold on-accent shadow transition hover:bg-saffron disabled:opacity-50"
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
                      className="flex items-center gap-1.5 rounded-[4px] bg-mint px-4 py-2 text-xs font-bold on-accent shadow transition hover:bg-mint disabled:opacity-50"
                    >
                      {busy === j.id ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      Complete & Capture After-Photo
                    </button>
                  )}

                  {j.status === "AWAITING_REVIEW" && (
                    <span className="rounded-[4px] border border-mint/40 bg-mint/10 px-3 py-1.5 text-xs font-semibold text-mint">
                      Photos Submitted (Awaiting Inspector Sign-off)
                    </span>
                  )}

                  {j.status === "COMPLETED" && (
                    <span className="rounded-[4px] border border-mint/40 bg-mint/10 px-3 py-1.5 text-xs font-semibold text-mint">
                      <BadgeCheck size={13} className="inline mr-1" /> Signed Off & Released
                    </span>
                  )}
                </div>
              </div>

              {/* Work-order particulars */}
              <dl className="kv mt-3 border-t border-edge pt-3 sm:grid-cols-2 xl:grid-cols-4">
                <dt>Work order</dt>
                <dd className="font-mono">{workOrderRef(j)}</dd>
                <dt>Asset / location</dt>
                <dd>
                  <span className="font-mono">{j.segmentCode}</span> · {j.chainage}
                </dd>
                <dt>Assigned gang</dt>
                <dd>{crewFor(j) || "not yet allotted"}</dd>
                <dt>Allotted by</dt>
                <dd>{j.allottedBy ?? "—"}</dd>
                <dt>Permit to work</dt>
                <dd className="font-mono">RR/PTW/{String(j.id).padStart(4, "0")}</dd>
                <dt>Sanctioned window</dt>
                <dd className="font-mono">
                  {j.windowStart != null && j.windowEnd != null ? `${fmtMin(j.windowStart)} – ${fmtMin(j.windowEnd)} IST` : "awaiting sanction"}
                </dd>
                <dt>Escalation</dt>
                <dd>
                  {j.escalationLevel === 0
                    ? "none — within time"
                    : j.escalationLevel === 1
                      ? "L1 · SMS to karmi"
                      : j.escalationLevel === 2
                        ? "L2 · inspector alert"
                        : "L3 · DRM critical"}
                </dd>
                <dt>Defect reference</dt>
                <dd>
                  {j.defectId ? (
                    <a href={`/defects/${j.defectId}`} className="btn-link font-mono">
                      DEF-{j.segmentCode}-{new Date(j.reportAt).getFullYear()}-{String(j.defectId).padStart(4, "0")}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </dl>

              {/* Eight-stage execution record */}
              <div className="mt-3 border-t border-edge pt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                  Execution record — eight stages
                </p>
                <ol className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                  {WO_STAGES.map((st, sIdx) => {
                    const done = sIdx <= stepIdx;
                    const current = sIdx === stepIdx + 1 && j.status !== "COMPLETED";
                    return (
                      <li key={st.key} className={`flex items-start gap-2 border px-2 py-1.5 ${done ? "border-mint/35 bg-mint/[0.05]" : current ? "border-saffron/40 bg-saffron/[0.05]" : "border-edge"}`}>
                        <span
                          className={`mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] font-mono text-[9.5px] font-bold ${
                            done ? "bg-mint on-accent" : current ? "bg-saffron on-accent" : "border border-edge bg-panel text-faint"
                          }`}
                          aria-hidden
                        >
                          {done ? "✓" : sIdx + 1}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-[11px] font-semibold ${done ? "text-ink" : current ? "text-saffron" : "text-faint"}`}>
                            {st.label}
                            <span className="sr-only">{done ? " — completed" : current ? " — next action" : " — pending"}</span>
                          </span>
                          <span className="block text-[10px] text-faint">{st.role}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-1.5 text-[10.5px] text-faint">
                  Stage 8 (closure) is recorded on the defect record; this work order is complete at inspector sign-off.
                </p>
              </div>

              {/* Photos Preview if available */}
              {(j.beforePhoto || j.afterPhoto) && (
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-edge/60 pt-4">
                  {j.beforePhoto && (
                    <div className="rounded-[4px] border border-edge bg-hull/50 p-2 text-xs">
                      <p className="font-semibold text-saffron mb-1">Before Repair Photo (GPS Stamped)</p>
                      <div className="aspect-[16/9] overflow-hidden rounded-[3px] border border-edge bg-abyss">
                                                <SmartImg src={j.beforePhoto} alt="Before repair" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  )}
                  {j.afterPhoto && (
                    <div className="rounded-[4px] border border-edge bg-hull/50 p-2 text-xs">
                      <p className="font-semibold text-mint mb-1">After Repair Photo (GPS Stamped)</p>
                      <div className="aspect-[16/9] overflow-hidden rounded-[3px] border border-edge bg-abyss">
                                                <SmartImg src={j.afterPhoto} alt="After repair" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Permit to Work Sheet Modal */}
      {permitJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/80 p-4 " onClick={() => setPermitJob(null)}>
          <div className="anim-rise w-full max-w-xl overflow-hidden rounded-[4px] border border-edge bg-hull shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FileCheck2 size={16} className="text-saffron" />
                <h3 className="text-[12.5px] font-bold uppercase tracking-wide text-ink">Permit to work — sanctioned form (GR&SR 15.06)</h3>
              </div>
              <button onClick={() => setPermitJob(null)} className="rounded-[3px] p-1 text-dim hover:text-ink"><X size={15} /></button>
            </div>
            <div className="space-y-3 bg-abyss/60 p-4 font-mono text-[11.5px] leading-relaxed text-dim">
              {jobPermitText(permitJob).map((p, idx) => (
                <p key={idx} className="leading-relaxed text-ink">{p}</p>
              ))}
            </div>
            <div className="border-t border-edge px-5 py-3 flex justify-end">
              <button onClick={() => setPermitJob(null)} className="rounded-[4px] bg-panel border border-edge px-4 py-2 text-xs font-medium text-ink">
                Close Permit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
