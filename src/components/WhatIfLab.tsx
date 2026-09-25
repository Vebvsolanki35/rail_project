"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeIndianRupee, Boxes, CheckCircle2, FlaskConical, Fuel, Loader2, TrafficCone, TrainFront, Users, XCircle } from "lucide-react";
import RailMap from "@/components/RailMap";
import { fmtMin } from "@/lib/engine/network";
import type { SegmentDTO, StationDTO, WhatIfResult } from "@/lib/engine/types";

const lakh = (n: number) => `₹${(n / 100000).toFixed(2)}L`;

export default function WhatIfLab({ stations, segments, fog }: { stations: StationDTO[]; segments: SegmentDTO[]; fog: boolean }) {
  const [segmentId, setSegmentId] = useState(segments.find((s) => s.code === "NZM-ANVT")?.id ?? segments[0]?.id ?? 1);
  const [durationH, setDurationH] = useState(2);
  const [startMin, setStartMin] = useState(600);
  const [superBlock, setSuperBlock] = useState(true);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      // Loading flag set inside the debounce callback, not synchronously in the
      // effect body (react-hooks/set-state-in-effect).
      setLoading(true);
      try {
        const res = await fetch("/api/whatif", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentId, durationH, startMin, superBlock }),
        });
        setResult(await res.json());
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [segmentId, durationH, startMin, superBlock]);

  const seg = useMemo(() => segments.find((s) => s.id === segmentId), [segments, segmentId]);

  return (
    <section className="panel overflow-hidden">
      <div className="panel-hd">
        <span className="flex items-center gap-2">
          <FlaskConical size={14} className="text-sky-400" />
          What-If Cascade Simulation Lab (Cost-Benefit & Delay Diffusion)
        </span>
        <span className="text-[10.5px] font-mono text-dim">{loading ? "Simulating…" : "Live"}</span>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-5">
        {/* Scenario Controls */}
        <div className="border-b border-edge p-5 lg:col-span-2 lg:border-b-0 lg:border-r space-y-4">
          <div>
            <label className="block text-xs font-semibold text-dim mb-1">Target Track Section</label>
            <select
              value={segmentId}
              onChange={(e) => setSegmentId(Number(e.target.value))}
              className="w-full rounded-xl border border-edge bg-panel px-3 py-2 text-xs font-medium text-ink outline-none focus:border-amber-500/40"
            >
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.corridor}{s.isBridge ? " (Bridge)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-medium text-dim">
              <span>Proposed Block Duration</span>
              <span className="font-mono font-bold text-amber-400">{durationH} hrs</span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              step={0.5}
              value={durationH}
              onChange={(e) => setDurationH(Number(e.target.value))}
              className="mt-2 w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-faint font-mono">
              <span>1h</span><span>4h</span><span>8h</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-medium text-dim">
              <span>Start Window Time</span>
              <span className="font-mono font-bold text-sky-400">{fmtMin(startMin)} IST</span>
            </div>
            <input
              type="range"
              min={0}
              max={1410}
              step={30}
              value={startMin}
              onChange={(e) => setStartMin(Number(e.target.value))}
              className="mt-2 w-full accent-sky-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-faint font-mono">
              <span>00:00</span><span className="text-amber-400">Golden 00:30–04:30</span><span>23:30</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSuperBlock(!superBlock)}
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
              superBlock
                ? "border-purple-500/40 bg-purple-500/10 text-purple-300"
                : "border-edge bg-panel text-dim hover:text-ink"
            }`}
          >
            <Boxes size={18} className={superBlock ? "text-purple-400" : "text-faint"} />
            <div>
              <span className="block text-xs font-bold">
                Super-Block Bundling: {superBlock ? "Enabled" : "Disabled"}
              </span>
              <span className="block text-[11px] text-faint">Simultaneous Track, OHE & S&T work</span>
            </div>
          </button>

          {seg && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border border-edge bg-hull/60 p-2.5">
                <span className="block font-mono font-bold text-ink">{seg.dailyTrains}</span>
                <span className="text-[10px] text-dim">trains/day</span>
              </div>
              <div className="rounded-xl border border-edge bg-hull/60 p-2.5">
                <span className="block font-mono font-bold text-ink">{seg.criticality}/10</span>
                <span className="text-[10px] text-dim">criticality</span>
              </div>
              <div className="rounded-xl border border-edge bg-hull/60 p-2.5">
                <span className="block font-mono font-bold text-ink">{seg.lengthKm} km</span>
                <span className="text-[10px] text-dim">length</span>
              </div>
            </div>
          )}
        </div>

        {/* Map & Scenario Verdict */}
        <div className="p-5 lg:col-span-3 space-y-4">
          <div className="gridlines overflow-hidden rounded-xl border border-edge bg-[#070b13]">
            <RailMap
              stations={stations}
              segments={segments}
              heat={result?.stationHeat ?? {}}
              blockedSegmentIds={[segmentId]}
              fog={fog}
            />
          </div>

          {result && (
            <div className="anim-rise grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Verdict Card */}
              <div
                className={`rounded-xl border p-4 ${
                  result.recommend
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.recommend ? <CheckCircle2 size={17} className="text-emerald-400" /> : <XCircle size={17} className="text-rose-400" />}
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {result.recommend ? "AI Recommendation: Approved" : "AI Recommendation: Rejected"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-ink/90 leading-relaxed">{result.verdict}</p>
                <p className="mt-3 text-[11px] font-mono text-dim">
                  Optimal alternate slot: <strong className="text-amber-400">{fmtMin(result.bestWindow.startMin)} IST</strong>
                </p>
              </div>

              {/* Financial Balance Sheet */}
              <div className="rounded-xl border border-edge bg-panel p-4 text-xs space-y-2">
                <div className="flex items-center justify-between text-dim">
                  <span className="flex items-center gap-1.5"><TrainFront size={12} /> Impacted Trains</span>
                  <span className="font-mono font-bold text-ink">{result.affectedTrains}</span>
                </div>
                <div className="flex items-center justify-between text-dim">
                  <span className="flex items-center gap-1.5"><Fuel size={12} /> Total Delay Minutes</span>
                  <span className="font-mono font-bold text-amber-400">{result.totalDelayMin} min</span>
                </div>
                <div className="flex items-center justify-between text-dim">
                  <span className="flex items-center gap-1.5"><Users size={12} /> Passenger Delay Cost</span>
                  <span className="font-mono text-rose-400">{lakh(result.passengerDelayCost)}</span>
                </div>
                <div className="flex items-center justify-between text-dim">
                  <span className="flex items-center gap-1.5"><BadgeIndianRupee size={12} /> Future Failure Avoided</span>
                  <span className="font-mono text-emerald-400">+{lakh(result.futureFailureCostAvoided)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-edge pt-2 font-semibold">
                  <span>Net Economic Benefit</span>
                  <span className={`font-mono text-sm font-bold ${result.netBenefit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {result.netBenefit >= 0 ? "+" : "−"}{lakh(Math.abs(result.netBenefit))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {result && result.cascade.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.cascade.map((c) => (
                <div key={c.station} className="rounded-lg border border-edge bg-panel px-3 py-1.5 text-xs">
                  <span className="font-mono font-bold text-dim">{c.station}:</span>
                  <span className="ml-1.5 font-mono font-bold text-amber-400">+{c.delayMin}m</span>
                  <span className="ml-1.5 text-faint hidden sm:inline">({c.note})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
