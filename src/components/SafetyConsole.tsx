"use client";

/**
 * SAFETY & PERMITS CONSOLE
 *
 * Two real capabilities, both on existing backend paths:
 *   1. Permit-to-work register — evidence compliance derived from the work
 *      order record (crew assigned, sanctioned window, GPS-stamped BEFORE and
 *      AFTER photographs, inspector validation, escalation age).
 *   2. Block safety work order — calls the existing `POST /api/safety-order`
 *      for a chosen planned block and renders the returned document for
 *      printing/signing. The engine composes it; nothing is mocked here.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, Printer, ShieldCheck, XCircle } from "lucide-react";
import { fmtMin } from "@/lib/engine/network";
import type { JobDTO } from "@/lib/engine/types";
import StatusPill from "./StatusPill";

export type SafetyBlock = {
  id: number;
  segmentCode: string;
  corridor: string;
  day: number;
  startMin: number;
  endMin: number;
  departments: string[];
  isSuperBlock: boolean;
  mode: string;
  defectCount: number;
};

type SafetyOrder = { ref: string; generatedInMs: number; title: string; body: string[] };

/** Permit reference derived from the work order (display reference, not a registry). */
export function permitRef(jobId: number, year = new Date().getFullYear()) {
  return `RR/PTW/${year}/${String(jobId).padStart(4, "0")}`;
}

type Check = { label: string; ok: boolean; detail: string };

export function permitChecks(j: JobDTO): Check[] {
  return [
    {
      label: "Crew leader nominated",
      ok: !!j.teamLeader,
      detail: j.teamLeader ?? "no team leader recorded",
    },
    {
      label: "Sanctioned block window",
      ok: j.windowStart != null && j.windowEnd != null,
      detail: j.windowStart != null && j.windowEnd != null ? `${fmtMin(j.windowStart)}–${fmtMin(j.windowEnd)}` : "not sanctioned",
    },
    {
      label: "BEFORE photograph with GPS",
      ok: !!j.beforePhoto && !!j.beforeGps,
      detail: j.beforePhoto ? `GPS ${j.beforeGps ?? "—"}` : "no before-repair evidence",
    },
    {
      label: "AFTER photograph with GPS",
      ok: !!j.afterPhoto && !!j.afterGps,
      detail: j.afterPhoto ? `GPS ${j.afterGps ?? "—"}` : "no after-repair evidence",
    },
    {
      label: "Inspector validation",
      ok: j.status === "COMPLETED",
      detail: j.status === "COMPLETED" ? "signed off" : j.status.replace("_", " ").toLowerCase(),
    },
    {
      label: "No escalation pending",
      ok: j.escalationLevel === 0,
      detail: j.escalationLevel === 0 ? "within time" : `escalation level ${j.escalationLevel}`,
    },
  ];
}

export default function SafetyConsole({
  blocks,
  jobs,
  fogMode,
  vipAlert,
}: {
  blocks: SafetyBlock[];
  jobs: JobDTO[];
  fogMode: boolean;
  vipAlert: boolean;
}) {
  const [blockId, setBlockId] = useState<number | null>(blocks[0]?.id ?? null);
  const [order, setOrder] = useState<SafetyOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (blockId == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/safety-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blockItemId: blockId }),
      });
      const json = (await res.json()) as SafetyOrder & { error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? "The safety order could not be generated.");
        setOrder(null);
      } else {
        setOrder(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const selected = blocks.find((b) => b.id === blockId) ?? null;

  return (
    <div className="grid gap-3 xl:grid-cols-[420px_minmax(0,1fr)]">
      {/* ── Permit-to-work register ── */}
      <section className="panel">
        <div className="panel-hd">
          <span>Permit-to-work register</span>
          <StatusPill label={`${jobs.filter((j) => j.status === "IN_PROGRESS").length} active`} tone="warning" />
        </div>

        {(fogMode || vipAlert) && (
          <div className="flex items-start gap-2 border-b border-saffron/30 bg-saffron/[0.06] px-3 py-2 text-[11px] leading-relaxed text-saffron">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {fogMode && "Fog mode is enforced: physical-only maintenance is withheld and visibility-dependent work needs the DAS/RDPMS route. "}
              {vipAlert && "VVIP corridor watch is active: sub-critical work within 5 km of NDLS/DLI/NZM requires escort protocol."}
            </span>
          </div>
        )}

        <div className="max-h-[32rem] divide-y divide-edge overflow-y-auto">
          {jobs.map((j) => {
            const checks = permitChecks(j);
            const passed = checks.filter((c) => c.ok).length;
            const tone = j.status === "COMPLETED" ? "success" : j.status === "IN_PROGRESS" ? "warning" : passed >= 3 ? "info" : "critical";
            return (
              <article key={j.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-primary">{permitRef(j.id)}</span>
                  <StatusPill label={`${passed}/${checks.length} checks`} tone={tone} />
                </div>
                <p className="mt-1 text-[12px] font-semibold leading-snug text-ink">{j.title}</p>
                <p className="mt-0.5 text-[10.5px] text-dim">
                  <span className="font-mono">{j.segmentCode}</span> · {j.department} · {j.teamLeader ?? "unassigned"} ·{" "}
                  {j.windowStart != null && j.windowEnd != null ? `${fmtMin(j.windowStart)}–${fmtMin(j.windowEnd)}` : "window not sanctioned"}
                </p>
                <ul className="mt-1.5 space-y-[3px]">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-1.5 text-[10.5px]">
                      {c.ok ? (
                        <CheckCircle2 size={11} className="mt-[1px] shrink-0 text-mint" aria-hidden />
                      ) : (
                        <XCircle size={11} className="mt-[1px] shrink-0 text-signal" aria-hidden />
                      )}
                      <span className={c.ok ? "text-dim" : "text-signal"}>
                        {c.label}
                        <span className="text-faint"> — {c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
          {jobs.length === 0 && <p className="p-4 text-[11.5px] text-dim">No work orders raised. Allot work from the Field Dashboard.</p>}
        </div>
        <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
          Permit references are derived from the work-order record. Compliance checks read the stored evidence fields; they do not assert that a
          photograph was taken on site.
        </p>
      </section>

      {/* ── Block safety work order ── */}
      <section className="panel">
        <div className="panel-hd">
          <span>Combined block safety work order</span>
          {selected && <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{selected.segmentCode}</span>}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-b border-edge p-3">
          <label className="min-w-[16rem] flex-1">
            <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-faint">Planned block</span>
            <select
              value={blockId ?? ""}
              onChange={(e) => {
                setBlockId(Number(e.target.value));
                setOrder(null);
              }}
              disabled={blocks.length === 0}
              className="w-full border border-edge bg-panel px-2 py-1.5 text-[12px] text-ink focus:border-primary focus:outline-none disabled:opacity-60"
            >
              {blocks.length === 0 && <option value="">No blocks in the published plan</option>}
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  D+{b.day} {fmtMin(b.startMin)}–{fmtMin(b.endMin)} · {b.segmentCode} · {b.departments.join("+")}
                  {b.isSuperBlock ? " · super-block" : ""}
                </option>
              ))}
            </select>
          </label>

          <button onClick={generate} disabled={busy || blockId == null} className="btn btn-primary">
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <FileCheck2 size={13} aria-hidden />}
            {busy ? "Composing…" : "Generate work order"}
          </button>

          {order && (
            <button onClick={() => window.print()} className="btn">
              <Printer size={13} aria-hidden /> Print / sign
            </button>
          )}
        </div>

        {error && <p className="border-b border-signal/30 bg-signal/[0.06] px-3 py-2 text-[11.5px] text-signal">{error}</p>}

        {!order && !error && (
          <div className="p-4">
            <p className="text-[11.5px] leading-relaxed text-dim">
              Select a planned occupancy and generate the combined block safety work order. The document is composed by the engine
              (`generateSafetyOrder`) with the block particulars, department scope, rule citations, protection arrangements, digital sign-off
              block and emergency revocation clause, and it is recorded in the operational event feed.
            </p>
            {selected && (
              <dl className="kv mt-3">
                <dt>Section</dt>
                <dd className="font-mono">
                  {selected.segmentCode} · {selected.corridor}
                </dd>
                <dt>Window</dt>
                <dd className="font-mono">
                  Day D+{selected.day} · {fmtMin(selected.startMin)}–{fmtMin(selected.endMin)} ({selected.endMin - selected.startMin} min)
                </dd>
                <dt>Departments</dt>
                <dd>{selected.departments.join(" + ")}</dd>
                <dt>Nature</dt>
                <dd>{selected.isSuperBlock ? "Multi-department super-block" : "Single-department block"} · {selected.mode}</dd>
                <dt>Sanctioned tasks</dt>
                <dd>{selected.defectCount}</dd>
              </dl>
            )}
          </div>
        )}

        {order && (
          <article className="bg-white p-5 text-ink dark:bg-panel">
            <header className="border-b-2 border-primary pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint">Indian Railways · Northern Railway · Delhi Division</p>
                  <h2 className="mt-0.5 text-[14px] font-bold leading-snug text-ink">{order.title}</h2>
                </div>
                <div className="shrink-0 border border-edge px-2 py-1 text-right">
                  <p className="text-[9.5px] uppercase tracking-wider text-faint">Reference</p>
                  <p className="font-mono text-[11px] font-bold text-primary">{order.ref}</p>
                </div>
              </div>
            </header>

            <ol className="mt-3 space-y-2.5">
              {order.body.map((para, i) => (
                <li key={i} className="text-[11.5px] leading-relaxed text-ink">
                  {para}
                </li>
              ))}
            </ol>

            <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-3">
              <span className="text-[10.5px] text-faint">
                Composed in {order.generatedInMs} ms · recorded in the operational event feed · human counter-signature required before issue.
              </span>
              <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-saffron">
                <ShieldCheck size={12} aria-hidden /> Advisory document — divisional officer approval mandatory
              </span>
            </footer>
          </article>
        )}
      </section>
    </div>
  );
}
