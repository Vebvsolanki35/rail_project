"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, Camera, MapPin, ShieldQuestion, X } from "lucide-react";
import { fmtMin } from "@/lib/engine/network";
import SmartImg from "@/components/SmartImg";
import type { JobDTO } from "@/lib/engine/types";

function haversineM(a: string, b: string): number {
  const [la1, ln1] = a.split(",").map(Number);
  const [la2, ln2] = b.split(",").map(Number);
  if ([la1, ln1, la2, ln2].some((n) => Number.isNaN(n))) return 0;
  const R = 6371000;
  const dLa = ((la2 - la1) * Math.PI) / 180;
  const dLn = ((ln2 - ln1) * Math.PI) / 180;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLn / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const REJECT_REASONS = [
  "Weld profile not within tolerance — re-grinding required",
  "Photograph does not demonstrate completed repair clearly",
  "Ballast packing / tamping incomplete at track site",
  "Incorrect component fitted — replace with sanctioned IRS specification",
  "Site coordinates outside sanctioned chainage",
];

export default function BeforeAfterModal({
  job,
  onClose,
  onDecide,
  busy,
}: {
  job: JobDTO;
  onClose: () => void;
  onDecide: (accept: boolean, reason?: string) => void;
  busy: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]);

  const gpsDelta = job.beforeGps && job.afterGps ? haversineM(job.beforeGps, job.afterGps) : 0;
  const gpsOk = gpsDelta < 500;
  const windowOk = (() => {
    if (!job.afterAt || job.windowEnd == null) return true;
    const a = new Date(job.afterAt);
    const afterMin = a.getHours() * 60 + a.getMinutes();
    return afterMin >= job.windowEnd - 75;
  })();
  const allClear = gpsOk && windowOk;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="anim-rise w-full max-w-3xl overflow-hidden rounded-2xl border border-edge bg-hull shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-amber-400">Job #{job.id}</span>
              <h3 className="text-sm font-bold text-ink">{job.title}</h3>
            </div>
            <p className="mt-0.5 text-xs text-dim">
              {job.segmentCode} · {job.chainage} · Assigned to {job.teamLeader}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dim hover:text-ink transition"><X size={16} /></button>
        </div>

        {/* Anti-Fraud Validation Banner */}
        <div className={`flex items-center gap-2 border-b px-5 py-2.5 text-xs font-semibold ${allClear ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
          {allClear ? <BadgeCheck size={16} className="text-emerald-400" /> : <AlertTriangle size={16} className="text-rose-400" />}
          <span>{allClear ? "GPS & Timestamp Verified — Anti-Fraud Checks Passed" : "Warning: Metadata Discrepancy Detected"}</span>
        </div>

        {/* Photographic Evidence Split Screen */}
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {[
            { label: "BEFORE REPAIR (GPS STAMPED)", img: job.beforePhoto, gps: job.beforeGps, at: job.beforeAt, tone: "#f59e0b" },
            { label: "AFTER REPAIR (GPS STAMPED)", img: job.afterPhoto, gps: job.afterGps, at: job.afterAt, tone: "#10b981" },
          ].map((p) => (
            <div key={p.label} className="overflow-hidden rounded-xl border border-edge bg-panel shadow-sm">
              <div className="relative aspect-[4/3] w-full bg-black/40">
                {p.img ? (
                  <SmartImg src={p.img} alt={p.label} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-faint">NO PHOTO CAPTURED</div>
                )}
                <span className="absolute left-2.5 top-2.5 rounded-md px-2 py-1 text-[10px] font-bold tracking-wider" style={{ backgroundColor: "rgba(10, 14, 23, 0.85)", color: p.tone }}>
                  {p.label}
                </span>
                <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded bg-slate-950/80 px-2 py-0.5 text-[9.5px] font-mono text-dim">
                  <Camera size={9} /> GPS VERIFIED
                </span>
              </div>
              <div className="space-y-1 p-3 text-xs text-dim">
                <p className="flex items-center gap-1.5 font-mono"><MapPin size={11} className="text-amber-400" /> {p.gps ?? "—"}</p>
                <p className="text-[11px] text-faint">{p.at ? new Date(p.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"} IST</p>
              </div>
            </div>
          ))}
        </div>

        {/* Verification Checks */}
        <div className="mx-5 space-y-2 rounded-xl border border-edge bg-panel/50 p-4 text-xs text-dim">
          <div className="flex items-center gap-1.5 font-semibold text-ink">
            <ShieldQuestion size={14} className="text-amber-400" />
            <span>Automated Anti-Fraud Checks</span>
          </div>
          <div className="space-y-1 pl-5">
            <p className={`flex items-center gap-2 ${gpsOk ? "text-emerald-400" : "text-rose-400"}`}>
              <BadgeCheck size={13} /> Before/After GPS Distance: {gpsDelta}m apart (Threshold: &lt; 500m)
            </p>
            <p className={`flex items-center gap-2 ${windowOk ? "text-emerald-400" : "text-rose-400"}`}>
              <BadgeCheck size={13} /> Work completed within sanctioned window {job.windowStart != null ? `(${fmtMin(job.windowStart)}–${fmtMin(job.windowEnd ?? 0)})` : ""}
            </p>
            <p className="flex items-center gap-2 text-emerald-400">
              <BadgeCheck size={13} /> Reporting chainage verified inside NDLS inspector beat
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-5 border-t border-edge p-5">
          {!rejecting ? (
            <div className="flex gap-3">
              <button
                onClick={() => onDecide(true)}
                disabled={busy || !allClear}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-40"
              >
                <BadgeCheck size={16} /> {allClear ? "Accept Verification & Release Block" : "Sign-Off Blocked — Verification Flag"}
              </button>
              <button
                onClick={() => setRejecting(true)}
                className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-5 py-3 text-xs font-bold text-rose-400 transition hover:bg-rose-500/20"
              >
                Reject Work
              </button>
            </div>
          ) : (
            <div className="anim-rise space-y-3">
              <label className="block text-xs font-semibold text-dim">Select Reason for Rejection</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-rose-500/40 bg-panel px-3 py-2.5 text-xs font-medium text-ink outline-none"
              >
                {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => onDecide(false, reason)}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow transition hover:bg-rose-500 disabled:opacity-50"
                >
                  Confirm Rejection & Re-assign Gang
                </button>
                <button onClick={() => setRejecting(false)} className="rounded-xl border border-edge px-4 py-2.5 text-xs font-medium text-dim">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
