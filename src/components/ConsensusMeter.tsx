"use client";

import { useState } from "react";
import { Fingerprint, Loader2, Lock } from "lucide-react";
import { DEPT_COLORS } from "@/lib/engine/network";
import type { ConsensusResult, SegmentDTO } from "@/lib/engine/types";

export default function ConsensusMeter({ segments }: { segments: SegmentDTO[] }) {
  const [segmentId, setSegmentId] = useState<number>(segments.find((s) => s.code === "NZM-ANVT")?.id ?? segments[0]?.id ?? 1);
  const [data, setData] = useState<ConsensusResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(id: number) {
    setLoading(true);
    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId: id }),
      });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const pct = data?.agreementPct ?? 0;
  const R = 50;
  const C = 2 * Math.PI * R;
  const color = !data ? "var(--color-faint)" : data.decision === "APPROVED" ? "var(--color-mint)" : "var(--color-saffron)";

  return (
    <div className="flex h-full flex-col justify-between p-3.5 space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={segmentId}
          onChange={(e) => {
            setSegmentId(Number(e.target.value));
            run(Number(e.target.value));
          }}
          className="w-full rounded-[4px] border border-edge bg-hull px-3 py-1.5 text-xs font-medium text-ink outline-none"
        >
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.corridor}
            </option>
          ))}
        </select>
        <button
          onClick={() => run(segmentId)}
          disabled={loading}
          className="flex shrink-0 items-center gap-1 rounded-[4px] bg-mint/15 border border-mint/30 px-3 py-1.5 text-xs font-semibold text-mint hover:bg-mint/25 transition disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Fingerprint size={12} />}
          Vote
        </button>
      </div>

      <div className="flex flex-1 items-center gap-3 py-1">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-edge)" strokeWidth="8" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C - (C * pct) / 100}
              style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1), stroke 0.3s" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-2xl font-bold" style={{ color }}>
              {data ? `${pct}%` : "—"}
            </span>
            <span className="text-[10px] font-semibold uppercase text-faint tracking-wider">Consensus</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {(data?.votes ?? [
            { system: "TMS (Track)", dept: "ENG" as const, vote: 0, rationale: "" },
            { system: "TDMS (Traction)", dept: "TRD" as const, vote: 0, rationale: "" },
            { system: "SMMS (Signals)", dept: "SNT" as const, vote: 0, rationale: "" },
          ]).map((v) => (
            <div key={v.system}>
              <div className="flex items-center justify-between text-[11px] text-dim">
                <span className="flex items-center gap-1 font-medium">
                  <Lock size={9} className="text-faint" />
                  {v.system}
                </span>
                <span className="font-mono font-bold" style={{ color: DEPT_COLORS[v.dept] }}>
                  {v.vote || "—"}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-edge">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${v.vote}%`, backgroundColor: DEPT_COLORS[v.dept] }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {data && (
        <div className="rounded-[4px] border border-edge bg-hull/60 p-3 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-dim">LLM Root-Cause Analysis:</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                backgroundColor: data.decision === "APPROVED" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                color: data.decision === "APPROVED" ? "var(--color-mint)" : "var(--color-saffron)",
              }}
            >
              {data.decision}
            </span>
          </div>
          <p className="text-xs text-dim leading-relaxed">{data.rootCause}</p>
        </div>
      )}
    </div>
  );
}
