"use client";

import { useEffect, useState } from "react";
import { LandPlot, MapPin, Milestone, RadioTower, TrafficCone } from "lucide-react";
import { CORRIDOR_COLORS, DEPT_COLORS, sectionMeta } from "@/lib/engine/network";
import type { DefectDTO, SegmentDTO } from "@/lib/engine/types";

export default function SectionInspector({ segment }: { segment: SegmentDTO | null }) {
  const [defects, setDefects] = useState<DefectDTO[]>([]);

  useEffect(() => {
    fetch("/api/defects")
      .then((r) => r.json())
      .then((d) => setDefects(d.defects ?? []));
  }, []);

  if (!segment) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center p-6 text-center">
        <Milestone size={24} className="text-faint" />
        <p className="mt-2.5 max-w-[220px] text-xs leading-relaxed text-dim">
          Click any track section on the map to inspect its chainage, jurisdiction, OHE depot, and open defects.
        </p>
      </div>
    );
  }

  const meta = sectionMeta(segment.code);
  const color = CORRIDOR_COLORS[segment.corridor] ?? "var(--color-faint)";
  const segDefects = defects.filter((d) => d.segmentId === segment.id && d.status !== "closed");

  return (
    <div className="anim-rise space-y-3 p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-[3px] px-2.5 py-0.5 font-mono text-xs font-bold" style={{ backgroundColor: `${color}20`, color }}>
            {segment.code}
          </span>
          <span className="text-xs font-semibold text-dim">{segment.corridor} Corridor</span>
          {segment.isBridge && (
            <span className="rounded-full bg-saffron/15 border border-saffron/30 px-2 py-0.2 text-[10px] font-bold text-saffron">
              Yamuna Bridge
            </span>
          )}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-dim">
          <Milestone size={12} className="text-faint" /> {meta?.chainage}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {[
          { icon: <LandPlot size={12} />, text: meta?.geom },
          { icon: <RadioTower size={12} />, text: meta?.signalling },
          { icon: <MapPin size={12} />, text: meta?.rail },
          { icon: <Milestone size={12} />, text: meta?.sleeper },
          { icon: <TrafficCone size={12} />, text: meta?.lcGates },
          { icon: <RadioTower size={12} />, text: meta?.ohe },
        ].map((row, i) => (
          <div key={i} className="flex items-start gap-1.5 text-dim">
            <span className="mt-0.5 shrink-0 text-faint">{row.icon}</span>
            <span className="leading-snug text-[11.5px]">{row.text}</span>
          </div>
        ))}
      </div>

      <div className="rounded-[4px] border border-edge bg-hull/60 p-3 text-xs">
        <p className="font-medium text-dim">Jurisdiction: <span className="text-ink">{meta?.jurisdiction}</span></p>
        <p className="mt-0.5 text-faint">Speed Restriction: {meta?.tsr}</p>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-dim mb-1.5">
          <span>Open Defects on Section</span>
          <span className="font-mono text-saffron">{segDefects.length}</span>
        </div>
        <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
          {segDefects.length === 0 && (
            <p className="py-2 text-xs text-mint">Section clear — no active open defects reported.</p>
          )}
          {segDefects.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-[3px] bg-hull/80 border border-edge/60 px-2.5 py-1.5 text-xs">
              <span
                className="font-mono font-bold text-[10px] rounded-[2px] px-1"
                style={{
                  backgroundColor: d.aiScore > 70 ? "color-mix(in srgb, var(--color-signal) 15%, transparent)" : "color-mix(in srgb, var(--color-saffron) 15%, transparent)",
                  color: d.aiScore > 70 ? "var(--color-signal)" : "var(--color-saffron)",
                }}
              >
                {d.aiScore.toFixed(0)}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{d.title}</span>
              <span className="shrink-0 font-semibold" style={{ color: DEPT_COLORS[d.department] }}>
                {d.department}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
