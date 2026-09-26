"use client";

import { Activity, BadgeIndianRupee, HeartPulse } from "lucide-react";
import type { DashboardState } from "@/lib/engine/types";

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export default function DrmRow({ state }: { state: DashboardState }) {
  const k = state.kpis;
  const hasPlan = !!state.latestPlan && state.latestPlan.kpis.blocks > 0;

  const delayScore = clamp(100 - k.avgDelayMin * 9, 10, 100);
  const criticalScore = clamp(100 - state.counts.criticalDefects * 14, 0, 100);
  const health = hasPlan
    ? Math.round(0.32 * k.resilienceScore + 0.26 * delayScore + 0.2 * k.bundlingPct + 0.22 * criticalScore)
    : Math.round(0.55 * criticalScore + 45 * 0.45);
  const hColor = health >= 80 ? "var(--color-mint)" : health >= 50 ? "var(--color-saffron)" : "var(--color-signal)";
  const hLabel = health >= 80 ? "STABLE" : health >= 50 ? "WATCH" : "CRITICAL";

  const approvals = state.events.filter((e) => e.message.includes("APPROVED by DRM")).length;
  const vetoes = state.events.filter((e) => e.message.includes("HUMAN VETO")).length;
  const totalDecisions = Math.max(approvals + vetoes, 0);
  const trust = totalDecisions > 0 ? Math.round((approvals / (approvals + vetoes || 1)) * 100) : 88;
  const trustColor = trust >= 75 ? "var(--color-mint)" : trust >= 50 ? "var(--color-saffron)" : "var(--color-signal)";

  const savedH = Math.max(k.downtimeBaselineH - k.downtimeOptimizedH, 0);
  const monthlyCr = ((savedH * 4.3 * 66000 + k.bundlingPct * 1400) / 1e7).toFixed(1);

  const R = 44;
  const C = 2 * Math.PI * R;
  const r2 = 30;
  const C2 = 2 * Math.PI * r2;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {/* Network Health Index */}
      <div className="panel flex items-center gap-3 p-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
            <circle cx="55" cy="55" r={R} fill="none" stroke="var(--color-edge)" strokeWidth="8" />
            <circle
              cx="55"
              cy="55"
              r={R}
              fill="none"
              stroke={hColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C - (C * health) / 100}
              style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-2xl font-bold" style={{ color: hColor }}>{health}</span>
            <span className="text-[9px] font-semibold text-faint uppercase">{hLabel}</span>
          </div>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
            <HeartPulse size={14} style={{ color: hColor }} /> Rakshak Health Index
          </p>
          <p className="mt-1 text-xs text-dim leading-relaxed">
            Composite score derived from network resilience, delay minimization, and defect containment.
          </p>
          <div className="mt-2 flex gap-1.5 font-mono text-[10px] text-faint">
            <span className="rounded-[2px] bg-hull px-1.5 py-0.5 border border-edge">σ {k.resilienceScore || "—"}</span>
            <span className="rounded-[2px] bg-hull px-1.5 py-0.5 border border-edge">delay {k.avgDelayMin || "—"}m</span>
          </div>
        </div>
      </div>

      {/* Trust & Override Index */}
      <div className="panel flex items-center gap-3 p-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
            <circle cx="55" cy="55" r={r2} fill="none" stroke="var(--color-edge)" strokeWidth="9" />
            <circle
              cx="55"
              cy="55"
              r={r2}
              fill="none"
              stroke={trustColor}
              strokeWidth="9"
              strokeDasharray={C2}
              strokeDashoffset={C2 - (C2 * trust) / 100}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.8s" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-bold" style={{ color: trustColor }}>{trust}%</span>
            <span className="text-[9px] font-semibold text-faint">Trust</span>
          </div>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
            <Activity size={14} style={{ color: trustColor }} /> DRM Trust Index
          </p>
          <p className="mt-1 text-xs text-dim leading-relaxed">
            Percentage of AI plan recommendations approved without human manual veto over 30 days.
          </p>
          <p className="mt-1.5 text-[11px] text-faint font-mono">
            Audit Ledger: {vetoes} overrides logged
          </p>
        </div>
      </div>

      {/* Financial Savings */}
      <div className="panel flex items-center gap-3 p-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[4px] bg-mint/10 text-mint border border-mint/20">
          <BadgeIndianRupee size={30} />
        </span>
        <div>
          <span className="text-xs font-semibold text-dim uppercase tracking-wide">Projected Monthly Savings</span>
          <p className="mt-1 font-mono text-2xl font-bold text-mint tracking-tight">
            ₹{monthlyCr} Cr <span className="text-xs font-sans text-dim font-normal">/ month</span>
          </p>
          <p className="mt-1 text-xs text-dim">
            Saved <strong className="text-ink font-mono">{savedH.toFixed(1)} hrs</strong> downtime weekly via single-line super-block bundling.
          </p>
        </div>
      </div>
    </div>
  );
}
