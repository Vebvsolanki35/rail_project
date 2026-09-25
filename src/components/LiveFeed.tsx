"use client";

import { useState } from "react";
import { Expand, X, Info, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";
import type { EventDTO } from "@/lib/engine/types";

const PILL: Record<EventDTO["kind"], { label: string; color: string; bg: string }> = {
  info: { label: "INFO", color: "var(--color-cyan)", bg: "rgba(56, 189, 248, 0.12)" },
  warn: { label: "WARN", color: "var(--color-saffron)", bg: "rgba(245, 158, 11, 0.12)" },
  critical: { label: "CRITICAL", color: "var(--color-signal)", bg: "rgba(244, 63, 94, 0.15)" },
  ai: { label: "ORCHESTRATOR", color: "var(--color-violet)", bg: "rgba(168, 85, 247, 0.15)" },
};

function Row({ e }: { e: EventDTO }) {
  const p = PILL[e.kind] ?? PILL.info;
  return (
    <div className="grid grid-cols-[60px_auto_1fr] items-center gap-2.5 border-b border-edge/40 px-3 py-2 last:border-0 hover:bg-primary/[0.03]">
      <span className="font-mono text-[10.5px] text-faint">
        {new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </span>
      <span
        className="inline-block rounded-[2px] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
        style={{ color: p.color, backgroundColor: p.bg }}
      >
        {p.label}
      </span>
      <span className="break-words text-xs text-ink/90 leading-snug">{e.message}</span>
    </div>
  );
}

export default function LiveFeed({ events, expandable = true }: { events: EventDTO[]; expandable?: boolean }) {
  const [open, setOpen] = useState(false);
  const rows = [...events].reverse();

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="h-64 overflow-y-auto">
        {rows.map((e) => (
          <Row key={e.id} e={e} />
        ))}
        {rows.length === 0 && (
          <p className="p-6 text-center text-xs text-dim">No operational events recorded yet</p>
        )}
      </div>

      {expandable && (
        <div className="border-t border-edge/80 p-2 text-right">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-[3px] border border-edge bg-panel px-2.5 py-1 text-xs font-medium text-dim hover:text-ink transition"
          >
            <Expand size={11} /> View Full Audit Log
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/80 p-4 " onClick={() => setOpen(false)}>
          <div className="anim-rise flex h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-[4px] border border-edge bg-hull shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
              <p className="text-xs font-bold text-ink">Immutable Audit Trail ({events.length} entries)</p>
              <button onClick={() => setOpen(false)} className="rounded-[3px] p-1 text-dim hover:text-ink">
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-edge/40">
              {rows.map((e) => (
                <Row key={e.id} e={e} />
              ))}
            </div>
            <div className="border-t border-edge px-5 py-3 text-xs text-faint">
              Cryptographically verified event stream for divisional safety compliance and model reinforcement learning.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
