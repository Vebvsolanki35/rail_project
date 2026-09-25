"use client";

/**
 * Dynamic re-planning console.
 *
 * Fire a live event at the plan and inspect exactly what changed. Committed
 * blocks (crew on site) are frozen and never moved; the new version records its
 * lineage (supersedes), the trigger and a structured diff.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, GitBranch, Lock, RefreshCw, Zap } from "lucide-react";
import BlockExplain from "./BlockExplain";
import type { PlanDTO } from "@/lib/engine/types";

export interface ReplanEventMetaDTO {
  label: string;
  blurb: string;
  tone: "info" | "warn" | "critical";
  defaultParam: number;
  paramLabel: string;
}

export interface PlanVersionDTO {
  id: number;
  name: string;
  horizon: string;
  createdAt: string;
  supersedesId: number | null;
  triggerNote: string | null;
  diff: { added: string[]; removed: string[]; moved: string[]; frozen: string[]; note: string } | null;
  resilienceScore: number;
  kpis: Record<string, number>;
}

export default function ReplanPanel({
  events,
  history,
  latestPlan,
  segments,
}: {
  events: Record<string, ReplanEventMetaDTO>;
  history: PlanVersionDTO[];
  latestPlan: PlanDTO | null;
  segments: { id: number; code: string; corridor: string; dailyTrains: number }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<string>("TRAIN_DELAY");
  const [segmentId, setSegmentId] = useState<number | "">("");
  const [blockItemId, setBlockItemId] = useState<number | "">("");
  const [amountMin, setAmountMin] = useState<number>(events.TRAIN_DELAY.defaultParam);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ diff: PlanVersionDTO["diff"]; triggerNote: string; planId: number; frozenCount: number; log: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = events[kind];

  async function fire() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/replan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          segmentId: segmentId === "" ? undefined : Number(segmentId),
          blockItemId: blockItemId === "" ? undefined : Number(blockItemId),
          amountMin: meta.defaultParam > 0 ? amountMin : undefined,
          note: note || undefined,
          actorName: "Control Office (Re-plan Console)",
          actorRole: "CONTROL",
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        diff?: PlanVersionDTO["diff"];
        triggerNote?: string;
        plan?: { id: number };
        frozenCount?: number;
        log?: string[];
      };
      if (!res.ok) {
        setError(json.error ?? "Re-plan failed");
        return;
      }
      setResult({
        diff: json.diff ?? null,
        triggerNote: json.triggerNote ?? "",
        planId: json.plan?.id ?? 0,
        frozenCount: json.frozenCount ?? 0,
        log: json.log ?? [],
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Event console */}
        <div className="space-y-3">
          <div className="rounded-xl border border-edge/70 bg-panel/50 p-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
              <Zap size={13} className="text-amber-400" /> Live event
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Object.entries(events).map(([key, e]) => (
                <button
                  key={key}
                  onClick={() => {
                    setKind(key);
                    setAmountMin(e.defaultParam);
                  }}
                  className={`rounded-lg border p-2 text-left text-[11px] font-semibold transition ${
                    kind === key ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-edge bg-hull/40 text-dim hover:text-ink"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-dim">{meta.blurb}</p>

            <div className="mt-3 space-y-2">
              <label className="block text-[10px] text-dim">
                Section (optional — blank = all affected sections)
                <select
                  value={segmentId}
                  onChange={(e) => setSegmentId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-edge bg-hull/50 px-2 py-1.5 text-[11px] text-ink outline-none"
                >
                  <option value="">All sections</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.corridor} ({s.dailyTrains}/day)
                    </option>
                  ))}
                </select>
              </label>

              {meta.defaultParam > 0 && (
                <label className="block text-[10px] text-dim">
                  {meta.paramLabel}
                  <input
                    type="number"
                    value={amountMin}
                    onChange={(e) => setAmountMin(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-edge bg-hull/50 px-2 py-1.5 text-[11px] text-ink outline-none"
                  />
                </label>
              )}

              {kind === "BLOCK_CANCELLED" && latestPlan && (
                <label className="block text-[10px] text-dim">
                  Block to withdraw
                  <select
                    value={blockItemId}
                    onChange={(e) => setBlockItemId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-edge bg-hull/50 px-2 py-1.5 text-[11px] text-ink outline-none"
                  >
                    <option value="">First movable block</option>
                    {latestPlan.blocks.slice(0, 40).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.segmentCode} · D{b.day + 1} {String(Math.floor(b.startMin / 60)).padStart(2, "0")}:{String(b.startMin % 60).padStart(2, "0")} ·{" "}
                        {b.defectCount} task(s)
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Operator note (recorded in the trigger)"
                className="w-full rounded-lg border border-edge bg-hull/50 px-2 py-1.5 text-[11px] text-ink outline-none"
              />

              <button
                onClick={fire}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {busy ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                {busy ? "Re-planning…" : "Re-plan now"}
              </button>
            </div>
            {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
          </div>

          {latestPlan && (
            <div className="rounded-xl border border-edge/70 bg-panel/50 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-dim">Current version</h3>
              <p className="mt-1 text-[11px] text-ink">{latestPlan.name}</p>
              <p className="text-[10px] text-faint">
                #{latestPlan.id} · {latestPlan.horizon} · resilience {latestPlan.resilienceScore}% · {latestPlan.blocks.length} blocks
              </p>
              {latestPlan.triggerNote && <p className="mt-1 text-[10px] text-amber-300">trigger: {latestPlan.triggerNote}</p>}
            </div>
          )}
        </div>

        {/* Result + lineage */}
        <div className="space-y-3">
          {result && (
            <div className="anim-rise rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                New version #{result.planId} published
              </h3>
              <p className="mt-1 text-[11px] text-dim">
                trigger: {result.triggerNote} · {result.frozenCount} block(s) held frozen
              </p>
              {result.diff && <DiffView diff={result.diff} />}
              <ul className="mt-2 space-y-0.5">
                {result.log.map((l) => (
                  <li key={l} className="text-[10px] text-faint">
                    • {l}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-edge/70 bg-panel/50 p-4">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
              <GitBranch size={13} className="text-amber-400" /> Plan version lineage
            </h3>
            <div className="mt-3 space-y-2">
              {history.map((v) => (
                <div key={v.id} className="rounded-lg border border-edge/60 bg-hull/40 p-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-mono text-ink">#{v.id}</span>
                    <span className="text-dim">{v.name}</span>
                    {v.supersedesId != null && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                        supersedes #{v.supersedesId}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-faint">{new Date(v.createdAt).toLocaleString()}</span>
                  </div>
                  {v.triggerNote && <p className="mt-1 text-[10px] text-amber-300">trigger: {v.triggerNote}</p>}
                  {v.diff && <DiffView diff={v.diff} compact />}
                  <p className="mt-1 text-[10px] text-faint">
                    resilience {v.resilienceScore}% · downtime {v.kpis?.downtimeOptimizedH ?? "—"} h · re-plans {v.kpis?.replanCount ?? 0}
                  </p>
                </div>
              ))}
              {history.length === 0 && <p className="text-[11px] text-faint">No plan versions yet — run the block planner.</p>}
            </div>
          </div>

          {latestPlan && latestPlan.blocks.some((b) => b.status === "frozen") && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-dim">
                <Lock size={13} className="text-rose-400" /> Frozen blocks in the live version
              </h3>
              <div className="space-y-2">
                {latestPlan.blocks
                  .filter((b) => b.status === "frozen")
                  .map((b) => (
                    <BlockExplain key={b.id} block={b} />
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {pending && <p className="text-[10px] text-faint">refreshing plan…</p>}
    </div>
  );
}

function DiffView({ diff, compact }: { diff: NonNullable<PlanVersionDTO["diff"]>; compact?: boolean }) {
  const groups: { label: string; items: string[]; tone: string }[] = [
    { label: "Added", items: diff.added, tone: "text-emerald-300" },
    { label: "Removed", items: diff.removed, tone: "text-rose-300" },
    { label: "Moved", items: diff.moved, tone: "text-amber-300" },
    { label: "Frozen", items: diff.frozen, tone: "text-rose-200" },
  ];
  return (
    <div className={`mt-2 grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <div key={g.label} className="rounded-lg border border-edge/60 bg-hull/40 p-2">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${g.tone}`}>
              {g.label} ({g.items.length})
            </p>
            <ul className="mt-1 space-y-0.5">
              {g.items.slice(0, compact ? 4 : 8).map((i) => (
                <li key={i} className="text-[10px] text-dim">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      <p className="text-[10px] text-faint">
        <AlertTriangle size={10} className="mr-1 inline" />
        {diff.note}
      </p>
    </div>
  );
}
