"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMin, CORRIDOR_COLORS } from "@/lib/engine/network";
import type { BlockItemDTO } from "@/lib/engine/types";

const DEPT_FILL: Record<string, string> = { ENG: "var(--color-saffron)", TRD: "var(--color-cyan)", SNT: "var(--color-violet)" };
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  blocks: BlockItemDTO[];
  week: number;
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  onResize?: (id: number, startMin: number, endMin: number) => void;
}

const W = 1040;
const LABEL = 96;
const TOP = 46;
const ROW_H = 36;
const PLOT_W = W - LABEL - 16;
const MIN_PER_PX = (1440 * 7) / PLOT_W;

export default function GanttChart({ blocks, week, selectedId, onSelect, onResize }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: number; edge: "l" | "r"; startX: number; oStart: number; oEnd: number } | null>(null);
  const [drag, setDrag] = useState<{ id: number; startMin: number; endMin: number } | null>(null);

  const daysOffset = week * 7;
  const visible = blocks.filter((b) => b.day >= daysOffset && b.day < daysOffset + 7);
  const rows = [...new Map(visible.map((b) => [b.segmentCode, b])).keys()];
  const x = useCallback(
    (day: number, min: number) => LABEL + (((day - daysOffset) * 1440 + min) / (1440 * 7)) * PLOT_W,
    [daysOffset]
  );

  function beginDrag(e: React.PointerEvent, b: BlockItemDTO, edge: "l" | "r") {
    if (!onResize) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { id: b.id, edge, startX: e.clientX, oStart: b.startMin, oEnd: b.endMin };
    setDrag({ id: b.id, startMin: b.startMin, endMin: b.endMin });
  }

  useEffect(() => {
    if (!drag) return;
    const scale = () => (svgRef.current ? W / svgRef.current.getBoundingClientRect().width : 1);
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dMin = Math.round(((e.clientX - d.startX) * scale() * MIN_PER_PX) / 5) * 5;
      if (d.edge === "l") {
        const ns = Math.max(0, Math.min(d.oEnd - 15, d.oStart + dMin));
        setDrag({ id: d.id, startMin: ns, endMin: d.oEnd });
      } else {
        const ne = Math.min(1440, Math.max(d.oStart + 15, d.oEnd + dMin));
        setDrag({ id: d.id, startMin: d.oStart, endMin: ne });
      }
    };
    const up = () => {
      const d = dragRef.current;
      const cur = drag;
      dragRef.current = null;
      setDrag(null);
      if (d && cur && (cur.startMin !== d.oStart || cur.endMin !== d.oEnd)) {
        onResize?.(d.id, cur.startMin, cur.endMin);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, onResize]);

  const H = TOP + rows.length * ROW_H + 26;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${Math.max(H, 120)}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label={`Gantt schedule with ${visible.length} maintenance blocks`}
    >
      <defs>
        <linearGradient id="supGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-saffron)" />
          <stop offset="50%" stopColor="var(--color-cyan)" />
          <stop offset="100%" stopColor="var(--color-violet)" />
        </linearGradient>
      </defs>

      {/* Grid Lines & Day Dividers */}
      {Array.from({ length: 8 }).map((_, i) => (
        <g key={i}>
          <line
            x1={LABEL + (i / 7) * PLOT_W}
            y1={TOP - 10}
            x2={LABEL + (i / 7) * PLOT_W}
            y2={Math.max(H, 120) - 18}
            stroke="var(--color-edge)"
            strokeWidth="1"
          />
          {i < 7 && (
            <text
              x={LABEL + ((i + 0.5) / 7) * PLOT_W}
              y={TOP - 16}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="var(--color-faint)"
              fontFamily="var(--font-display)"
            >
              {DAY_NAMES[i]} (Day {daysOffset + i + 1})
            </text>
          )}
        </g>
      ))}

      {/* Golden Window Background Band (00:30–04:30) */}
      {Array.from({ length: 7 }).map((_, d) => (
        <rect
          key={"g" + d}
          x={x(daysOffset + d, 30)}
          y={TOP - 8}
          width={((270 - 30) / (1440 * 7)) * PLOT_W}
          height={Math.max(H, 120) - TOP - 10}
          fill="color-mix(in srgb, var(--color-saffron) 6%, transparent)"
          rx="4"
        />
      ))}

      {rows.length === 0 && (
        <text x={W / 2} y={80} textAnchor="middle" fontSize="13" fill="var(--color-faint)" fontFamily="var(--font-display)">
          No scheduled blocks this week. Run the optimizer to generate a plan.
        </text>
      )}

      {rows.map((code, ri) => {
        const rowBlocks = visible.filter((b) => b.segmentCode === code);
        const corridor = rowBlocks[0]?.corridor ?? "";
        return (
          <g key={code}>
            <text
              x={LABEL - 12}
              y={TOP + ri * ROW_H + 20}
              textAnchor="end"
              fontSize="11"
              fontWeight="600"
              fill={CORRIDOR_COLORS[corridor] ?? "var(--color-faint)"}
              fontFamily="var(--font-mono)"
            >
              {code.replace("XR:", "")}
            </text>
            <line
              x1={LABEL}
              y1={TOP + ri * ROW_H + 14}
              x2={W - 16}
              y2={TOP + ri * ROW_H + 14}
              stroke="var(--color-edge)"
              strokeWidth="1"
            />
            {rowBlocks.map((b) => {
              const dragging = drag?.id === b.id;
              const sMin = dragging ? drag.startMin : b.startMin;
              const eMin = dragging ? drag.endMin : b.endMin;
              const bx = x(b.day, sMin);
              const bw = Math.max(8, x(b.day, eMin) - bx);
              const selected = selectedId === b.id;
              return (
                <g key={b.id} style={{ cursor: "pointer" }}>
                  {selected && !dragging && (
                    <rect
                      x={bx - 3}
                      y={TOP + ri * ROW_H + 2}
                      width={bw + 6}
                      height={ROW_H - 8}
                      rx="7"
                      fill="none"
                      stroke="var(--color-ink)"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  )}
                  <rect
                    x={bx}
                    y={TOP + ri * ROW_H + 5}
                    width={bw}
                    height={ROW_H - 14}
                    rx="6"
                    fill={b.isSuperBlock ? "url(#supGrad)" : (DEPT_FILL[b.departments[0]] ?? "var(--color-faint)")}
                    opacity={dragging ? 0.6 : b.mode === "virtual" ? 0.5 : 0.95}
                    stroke={selected || dragging ? "var(--color-on-accent)" : "color-mix(in srgb, var(--color-ink) 55%, transparent)"}
                    strokeWidth={dragging ? 1.5 : 1}
                    onClick={() => !dragging && onSelect?.(b.id)}
                  />
                  {bw > 50 && (
                    <text
                      x={bx + 6}
                      y={TOP + ri * ROW_H + 18}
                      fontSize="9.5"
                      fill="var(--color-on-accent)"
                      fontWeight="700"
                      fontFamily="var(--font-display)"
                      pointerEvents="none"
                    >
                      {b.isSuperBlock ? "SUPER" : b.departments[0]} {fmtMin(sMin)}–{fmtMin(eMin)}
                    </text>
                  )}
                  {dragging && (
                    <text
                      x={bx + bw / 2}
                      y={TOP + ri * ROW_H - 3}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--color-saffron)"
                      fontWeight="700"
                      fontFamily="var(--font-mono)"
                    >
                      {fmtMin(sMin)}–{fmtMin(eMin)} ({(eMin - sMin) / 60}h)
                    </text>
                  )}
                  {onResize && !dragging && (
                    <>
                      <rect
                        x={bx - 2}
                        y={TOP + ri * ROW_H + 5}
                        width="7"
                        height={ROW_H - 14}
                        rx="3"
                        fill="var(--color-on-accent)"
                        opacity="0.6"
                        style={{ cursor: "ew-resize" }}
                        onPointerDown={(e) => beginDrag(e, b, "l")}
                      />
                      <rect
                        x={bx + bw - 5}
                        y={TOP + ri * ROW_H + 5}
                        width="7"
                        height={ROW_H - 14}
                        rx="3"
                        fill="var(--color-on-accent)"
                        opacity="0.6"
                        style={{ cursor: "ew-resize" }}
                        onPointerDown={(e) => beginDrag(e, b, "r")}
                      />
                    </>
                  )}
                  <title>
                    {`${b.segmentCode} · ${fmtMin(b.startMin)}–${fmtMin(b.endMin)} · ${b.departments.join("+")} · ${b.defectCount} tasks`}
                  </title>
                </g>
              );
            })}
          </g>
        );
      })}

      <text x={LABEL} y={Math.max(H, 120) - 4} fontSize="9.5" fill="var(--color-faint)" fontFamily="var(--font-display)">
        {onResize
          ? "Drag block handles to resize window · delay impact recalculates instantly · click a block to view its safety order"
          : "Golden maintenance window 00:30–04:30 · click any block to view its generated safety work order"}
      </text>
    </svg>
  );
}
