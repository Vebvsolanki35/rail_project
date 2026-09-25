"use client";

/**
 * BlockExplain — "why is this block here?" Every block carries the optimizer's
 * rationale, its window, its cost and its status (including frozen/superseded
 * after a re-plan). No block is scheduled without a stated reason.
 */
import { Info, Lock, Snowflake, XCircle } from "lucide-react";
import type { BlockItemDTO } from "@/lib/engine/types";

function hhmm(min: number) {
  return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min) % 60).padStart(2, "0")}`;
}

export default function BlockExplain({ block, compact }: { block: BlockItemDTO; compact?: boolean }) {
  const status = block.status ?? "proposed";
  const frozen = status === "frozen";
  const superseded = status === "superseded";
  const tone = superseded
    ? "border-edge/70 bg-hull/30"
    : frozen
      ? "border-signal/40 bg-signal/5"
      : block.isSuperBlock
        ? "border-saffron/40 bg-saffron/5"
        : "border-edge/70 bg-panel/40";

  return (
    <div className={`rounded-[4px] border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-ink">{block.segmentCode}</span>
        <span className="text-[10px] text-faint">
          Day {block.day + 1} · {hhmm(block.startMin)}–{hhmm(block.endMin)} ({block.endMin - block.startMin} min)
        </span>
        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${block.window === "GOLDEN" ? "border-saffron/40 bg-saffron/10 text-saffron" : block.window === "SHOULDER" ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-violet/40 bg-violet/10 text-violet"}`}>
          {block.window}
        </span>
        {block.isSuperBlock && (
          <span className="rounded-full border border-mint/40 bg-mint/10 px-1.5 py-0.5 text-[10px] font-semibold text-mint">
            SUPER BLOCK
          </span>
        )}
        {frozen && (
          <span className="inline-flex items-center gap-1 rounded-full border border-signal/40 bg-signal/10 px-1.5 py-0.5 text-[10px] font-semibold text-signal">
            <Lock size={9} /> FROZEN — crew on site
          </span>
        )}
        {superseded && (
          <span className="inline-flex items-center gap-1 rounded-full border border-edge px-1.5 py-0.5 text-[10px] font-semibold text-faint">
            <XCircle size={9} /> SUPERSEDED
          </span>
        )}
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-dim">
        <span>{block.departments.join(" + ")}</span>
        <span>· {block.defectCount} task(s)</span>
        <span>· {block.mode}</span>
        <span>· projected delay cost {block.delayCostMin} min</span>
      </p>

      {!compact && (
        <p className="mt-2 flex items-start gap-1.5 rounded-[3px] border border-edge/60 bg-hull/40 p-2 text-[10px] leading-relaxed text-dim">
          <Info size={11} className="mt-0.5 shrink-0 text-saffron" />
          {block.rationale || "No rationale recorded for this block (generated before rationale tracking)."}
        </p>
      )}

      {frozen && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-signal">
          <Snowflake size={10} /> Dynamic re-planning never moves this block — the crew is already on site.
        </p>
      )}
    </div>
  );
}
