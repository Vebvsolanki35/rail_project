"use client";

/**
 * STATION MASTER DESK.
 *
 * The station master is the person who actually lives with the consequences of a
 * block: trains held at his station, platforms occupied, staff redeployed. This
 * screen gives him the view relevant to HIS station — the sections attached to
 * it, the blocks touching them, the defects live on those sections and the
 * patrol reports waiting for an inspector.
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BellRing, Radio, ShieldCheck, TrainFront, Users } from "lucide-react";
import { DueChip, DepartmentChip, PriorityChip, StageChip, UrgencyChip } from "./DefectBadges";
import BlockExplain from "./BlockExplain";
import type { BlockItemDTO, DefectDTO, JobDTO } from "@/lib/engine/types";

interface StationOption {
  id: number;
  code: string;
  name: string;
  kind: string;
  dailyTrains: number;
  vipZone: boolean;
}

interface SectionRow {
  id: number;
  code: string;
  fromCode: string;
  toCode: string;
  corridor: string;
  dailyTrains: number;
  criticality: number;
  isLevelCrossing: boolean;
  isBridge: boolean;
}

export default function StationClient({
  stations,
  sections,
  defects,
  blocks,
  jobs,
}: {
  stations: StationOption[];
  sections: SectionRow[];
  defects: DefectDTO[];
  blocks: BlockItemDTO[];
  jobs: JobDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stationId, setStationId] = useState<number>(stations[0]?.id ?? 0);
  const [msg, setMsg] = useState<string | null>(null);

  const station = stations.find((s) => s.id === stationId) ?? stations[0];

  const attached = useMemo(
    () => sections.filter((s) => s.fromCode === station?.code || s.toCode === station?.code),
    [sections, station]
  );
  const attachedIds = useMemo(() => new Set(attached.map((s) => s.id)), [attached]);
  const stationBlocks = useMemo(() => blocks.filter((b) => attachedIds.has(b.segmentId)), [blocks, attachedIds]);
  const stationDefects = useMemo(
    () => defects.filter((d) => attachedIds.has(d.segmentId) && d.status !== "closed"),
    [defects, attachedIds]
  );
  const stationJobs = useMemo(() => jobs.filter((j) => attachedIds.has(j.segmentId)), [jobs, attachedIds]);
  const patrolReports = useMemo(
    () => stationDefects.filter((d) => d.sourceSystem === "RAKSHAK-PATROL" || d.lifecycleStatus === "REPORTED"),
    [stationDefects]
  );
  const critical = stationDefects.filter((d) => d.severity >= 8);

  async function startReview(id: number) {
    setMsg(null);
    try {
      const res = await fetch(`/api/defects/${id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "advance", to: "UNDER_REVIEW", note: "station master forwarded for review", actorName: station?.name ?? "Station Master", actorRole: "STATION_MASTER" }),
      });
      const json = (await res.json()) as { error?: string };
      setMsg(res.ok ? `Forwarded for review by the section inspector.` : json.error ?? "Refused");
      if (res.ok) startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge/70 bg-panel/50 p-3">
        <label className="text-[10px] uppercase tracking-wide text-faint">
          My station
          <select
            value={stationId}
            onChange={(e) => setStationId(Number(e.target.value))}
            className="ml-2 rounded-lg border border-edge bg-hull/50 px-2 py-1.5 text-[12px] text-ink outline-none"
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </label>
        {station?.vipZone && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300">
            VIP / VVIP movement zone — sub-critical work is withheld here
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-dim">
          <Radio size={12} className="text-emerald-400" /> {station?.dailyTrains ?? 0} trains/day through this station
        </span>
      </div>

      {/* KPIs for this station */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
            <TrainFront size={12} className="text-sky-400" /> Sections attached
          </p>
          <p className="mt-1 font-mono text-2xl text-ink">{attached.length}</p>
          <p className="text-[10px] text-faint">{attached.map((s) => s.code).slice(0, 3).join(", ")}{attached.length > 3 ? "…" : ""}</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-[10px] uppercase tracking-wide text-faint">Blocks in the live plan</p>
          <p className="mt-1 font-mono text-2xl text-amber-300">{stationBlocks.length}</p>
          <p className="text-[10px] text-faint">
            {stationBlocks.filter((b) => b.isSuperBlock).length} super block(s) ·{" "}
            {Math.round(stationBlocks.reduce((s, b) => s + (b.endMin - b.startMin), 0) / 60)} h occupancy
          </p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
            <BellRing size={12} className="text-red-400" /> Critical defects nearby
          </p>
          <p className="mt-1 font-mono text-2xl text-red-300">{critical.length}</p>
          <p className="text-[10px] text-faint">{stationDefects.length} open in total on attached sections</p>
        </div>
        <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
            <Users size={12} className="text-dim" /> Crews on / near site
          </p>
          <p className="mt-1 font-mono text-2xl text-ink">{stationJobs.length}</p>
          <p className="text-[10px] text-faint">
            {stationJobs.filter((j) => j.status === "IN_PROGRESS").length} working now ·{" "}
            {stationJobs.filter((j) => j.status === "AWAITING_REVIEW").length} awaiting sign-off
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Blocks */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-dim">Blocks touching my sections</h3>
          {stationBlocks.length === 0 ? (
            <p className="rounded-xl border border-edge/70 bg-panel/50 p-4 text-[11px] text-dim">
              No sanctioned block touches this station in the current plan version.
            </p>
          ) : (
            stationBlocks.slice(0, 8).map((b) => <BlockExplain key={b.id} block={b} />)
          )}
          {stationBlocks.length > 0 && (
            <p className="text-[10px] leading-relaxed text-faint">
              Occupancy on {station?.code} sections: {stationBlocks.map((b) => `D${b.day + 1} ${String(Math.floor(b.startMin / 60)).padStart(2, "0")}:${String(b.startMin % 60).padStart(2, "0")}`).join(" · ")}
            </p>
          )}
        </div>

        {/* Patrol reports + defects */}
        <div className="space-y-3">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">
              Patrol reports near {station?.code} ({patrolReports.length})
            </h3>
            <div className="space-y-2">
              {patrolReports.slice(0, 6).map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-edge/70 bg-panel/50 p-2.5">
                  <div className="min-w-[180px] flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] text-amber-400">{d.defectCode}</span>
                      <StageChip stage={d.lifecycleStatus} label={d.lifecycleLabel} />
                      <UrgencyChip cls={d.urgencyClass} score={d.urgencyScore} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink">{d.title}</p>
                    <p className="text-[10px] text-faint">
                      {d.segmentCode} · {d.sourceSystem} · severity {d.severity}/10
                    </p>
                  </div>
                  {d.lifecycleStatus === "REPORTED" && (
                    <button
                      onClick={() => startReview(d.id)}
                      className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-semibold text-slate-950 transition hover:bg-amber-400"
                    >
                      Forward for review
                    </button>
                  )}
                  <Link href={`/defects/${d.id}`} className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:underline">
                    Details <ArrowRight size={10} />
                  </Link>
                </div>
              ))}
              {patrolReports.length === 0 && (
                <p className="rounded-xl border border-edge/70 bg-panel/50 p-3 text-[11px] text-dim">
                  No unreviewed patrol reports on these sections.
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Highest-priority open defects on my sections</h3>
            <div className="space-y-1.5">
              {[...stationDefects]
                .sort((a, b) => b.sortKey - a.sortKey)
                .slice(0, 8)
                .map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-edge/60 bg-hull/40 p-2">
                    <span className="font-mono text-[10px] text-amber-400">{d.defectCode}</span>
                    <span className="min-w-[140px] flex-1 truncate text-[11px] text-ink">{d.title}</span>
                    <DepartmentChip dept={d.department} />
                    <PriorityChip priority={d.priority} />
                    <DueChip dueInDays={d.dueInDays} />
                    <Link href={`/defects/${d.id}`} className="text-[10px] font-semibold text-dim hover:text-ink">
                      open
                    </Link>
                  </div>
                ))}
              {stationDefects.length === 0 && <p className="text-[11px] text-faint">No open defects on attached sections.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-edge/70 bg-panel/50 p-3 text-[10px] leading-relaxed text-dim">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
              <ShieldCheck size={12} className="text-emerald-400" /> Station master advisory
            </p>
            <p className="mt-1">
              Station masters can forward patrol reports for inspector review but cannot change the lifecycle stage of a
              verified defect, approve a block or close work — those actions belong to the DRM, control office and
              section inspector respectively. Every action taken here is recorded in the defect audit trail with the
              station master&apos;s role.
            </p>
          </div>
        </div>
      </div>

      {msg && <p className="text-[11px] text-emerald-300">{msg}</p>}
      {pending && <p className="text-[10px] text-faint">refreshing…</p>}
    </div>
  );
}
