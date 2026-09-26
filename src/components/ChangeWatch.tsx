"use client";

/**
 * NETWORK CHANGE WATCH (Phase 9) — detection desk.
 *
 * The panel lists what the engine detects right now, what each change touches
 * (trains, blocks, jobs, sections) and how much exposure it creates. Publishing a
 * new plan version is an explicit human action: it calls the existing re-planner
 * and shows the OLD / NEW / DIFF that came back.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Radar, RefreshCw, TrainFront } from "lucide-react";
import StatusPill from "./StatusPill";
import type { ChangeImpact, ChangeKind } from "@/lib/engine/changeimpact";

type KindMeta = Record<ChangeKind, { label: string; blurb: string; paramLabel: string; defaultParam: number }>;

const SEV_TONE = { critical: "critical", warn: "warning", info: "info" } as const;

export default function ChangeWatch({ initial, kindMeta }: { initial: ChangeImpact[]; kindMeta: KindMeta }) {
  const router = useRouter();
  const [changes, setChanges] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [manual, setManual] = useState<ChangeKind>("TRAIN_DELAY");
  const [amount, setAmount] = useState(30);
  const [diff, setDiff] = useState<{ planId: number; supersedesId: number | null; diff: { added: string[]; removed: string[]; moved: string[]; frozen: string[]; note: string } | null } | null>(null);
  const [, startTransition] = useTransition();

  async function scan() {
    setBusy("SCAN");
    setMessage(null);
    try {
      const json = (await fetch("/api/changes", { cache: "no-store" }).then((r) => r.json())) as { detected?: ChangeImpact[] };
      setChanges(json.detected ?? []);
      setMessage({ text: `Scan complete — ${(json.detected ?? []).length} change(s) with a plan impact detected.`, ok: true });
    } finally {
      setBusy(null);
    }
  }

  async function apply(href: string, kind: ChangeKind, payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setMessage(null);
    setDiff(null);
    try {
      const res = await fetch(href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, apply: true, actorName: "Duty Controller", actorRole: "CONTROL", ...payload }),
      });
      const json = (await res.json()) as { error?: string; impact?: ChangeImpact; applied?: boolean; result?: { planId: number; supersedesId: number | null; diff: { added: string[]; removed: string[]; moved: string[]; frozen: string[]; note: string } } };
      if (json.error) setMessage({ text: json.error, ok: false });
      else if (json.result) {
        setDiff({ planId: json.result.planId, supersedesId: json.result.supersedesId, diff: json.result.diff });
        setMessage({ text: `New plan version #${json.result.planId} published (supersedes #${json.result.supersedesId ?? "—"}).`, ok: true });
        const fresh = (await fetch("/api/changes", { cache: "no-store" }).then((r) => r.json())) as { detected?: ChangeImpact[] };
        setChanges(fresh.detected ?? []);
        startTransition(() => router.refresh());
      } else {
        setMessage({ text: "Detection complete — no plan impact, so no re-plan was published.", ok: false });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <div className={`flex items-start gap-2 border px-3 py-2 ${message.ok ? "border-mint/40 bg-mint/[0.06]" : "border-saffron/40 bg-saffron/[0.06]"}`}>
          <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${message.ok ? "text-mint" : "text-saffron"}`} aria-hidden />
          <p className="text-[11.5px] leading-relaxed text-ink">{message.text}</p>
        </div>
      )}

      {/* Manual change injection — the desk raises the event it knows about */}
      <section className="panel">
        <div className="panel-hd">
          <span>Raise a network change</span>
          <span className="flex items-center gap-1.5">
            <button onClick={scan} disabled={busy !== null} className="btn btn-xs">
              {busy === "SCAN" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Radar size={10} aria-hidden />} Re-scan now
            </button>
          </span>
        </div>
        <div className="grid gap-2 p-3 lg:grid-cols-4">
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Change kind</span>
            <select value={manual} onChange={(e) => setManual(e.target.value as ChangeKind)} className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink">
              {(Object.keys(kindMeta) as ChangeKind[]).map((k) => (
                <option key={k} value={k}>
                  {kindMeta[k].label}
                </option>
              ))}
            </select>
            <span className="mt-0.5 block text-[10px] leading-snug text-faint">{kindMeta[manual].blurb}</span>
          </label>
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{kindMeta[manual].paramLabel}</span>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              disabled={kindMeta[manual].paramLabel === "—"}
              className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 font-mono text-[11.5px] text-ink disabled:opacity-50"
            />
          </label>
          <div className="flex items-end gap-1.5">
            <button
              onClick={() => apply("/api/changes", manual, { amountMin: amount }, `DETECT-${manual}`)}
              disabled={busy !== null}
              className="btn btn-xs"
            >
              {busy === `DETECT-${manual}` ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Radar size={10} aria-hidden />} Detect only
            </button>
            <button
              onClick={() => apply("/api/changes", manual, { amountMin: amount }, `APPLY-${manual}`)}
              disabled={busy !== null}
              className="btn btn-primary btn-xs"
            >
              {busy === `APPLY-${manual}` ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <RefreshCw size={10} aria-hidden />} Detect &amp; publish new plan
            </button>
          </div>
          <p className="text-[10.5px] leading-relaxed text-faint">
            Publishing calls the existing re-planner: committed (frozen) blocks never move, superseded blocks are re-placed, and the response carries the diff of
            what changed. The old plan stays on record for the audit trail.
          </p>
        </div>
      </section>

      {/* Detected changes */}
      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <Radar size={13} aria-hidden /> Detected changes affecting the current plan
          </span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{changes.length} live signal(s)</span>
        </div>
        {changes.length === 0 ? (
          <p className="p-5 text-center text-[11.5px] text-faint">
            Nothing on the network currently invalidates the published plan — no defect above the risk threshold, no competing crew withdrawal, no freight surge
            and no corridor fault outstanding.
          </p>
        ) : (
          <ul className="divide-y divide-edge">
            {changes.map((c) => (
              <li key={c.kind} className={`px-3 py-2.5 ${c.severity === "critical" ? "bg-signal/[0.04]" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={c.replanEvent.label} tone={SEV_TONE[c.severity]} />
                  <span className="text-[12px] font-bold text-ink">{c.headline}</span>
                  <span className="font-mono text-[10px] text-faint">
                    {c.section.code} · exposure {c.exposureMin} min · plan #{c.planId ?? "—"}
                  </span>
                  <button onClick={() => apply("/api/changes", c.kind, { segmentId: c.section.id ?? undefined, amountMin: amount }, `APPLY-${c.kind}`)} disabled={busy !== null} className="btn btn-xs ml-auto">
                    {busy === `APPLY-${c.kind}` ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <RefreshCw size={10} aria-hidden />} Publish new plan version
                  </button>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {c.evidence.map((e) => (
                    <li key={e} className="text-[11px] leading-relaxed text-dim">
                      • {e}
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 grid gap-2 lg:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-faint">Affected blocks ({c.affectedBlocks.length})</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {c.affectedBlocks.slice(0, 6).map((b) => (
                        <li key={b.id} className="font-mono text-[10px] text-dim">
                          {b.label}: {b.detail}
                        </li>
                      ))}
                      {c.affectedBlocks.length === 0 && <li className="text-[10px] text-faint">none</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-faint">Affected trains ({c.trainCount})</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {c.affectedTrains.slice(0, 5).map((t) => (
                        <li key={`${t.id}-${t.label}`} className="flex items-center gap-1.5 font-mono text-[10px] text-dim">
                          <TrainFront size={9} className="shrink-0 text-saffron" aria-hidden /> {t.label} — {t.detail}
                        </li>
                      ))}
                      {c.affectedTrains.length === 0 && <li className="text-[10px] text-faint">none</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-faint">Affected jobs ({c.jobCount})</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {c.affectedJobs.slice(0, 5).map((j) => (
                        <li key={j.id} className="font-mono text-[10px] text-dim">
                          {j.label}: {j.detail}
                        </li>
                      ))}
                      {c.affectedJobs.length === 0 && <li className="text-[10px] text-faint">none</li>}
                    </ul>
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] text-faint">
                  Sections in scope: {c.affectedSections.length ? c.affectedSections.join(", ") : "—"} · trigger maps to{" "}
                  <span className="font-mono">{c.replanKind}</span> in the re-plan engine
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* OLD / NEW / DIFF */}
      {diff && (
        <section className="panel">
          <div className="panel-hd">
            <span>
              NEW PLAN PUBLISHED — version #{diff.planId} supersedes #{diff.supersedesId ?? "—"}
            </span>
            <Link href="/replan" className="btn btn-xs">
              Open re-plan register
            </Link>
          </div>
          <div className="grid gap-2 p-3 lg:grid-cols-4">
            {[
              { label: "Added", value: diff.diff?.added ?? [], tone: "text-mint" },
              { label: "Removed", value: diff.diff?.removed ?? [], tone: "text-signal" },
              { label: "Moved", value: diff.diff?.moved ?? [], tone: "text-saffron" },
              { label: "Frozen (never moved)", value: diff.diff?.frozen ?? [], tone: "text-primary" },
            ].map((col) => (
              <div key={col.label} className="border border-edge px-2.5 py-2">
                <p className={`text-[10.5px] font-bold uppercase tracking-wider ${col.tone}`}>
                  {col.label} <span className="font-mono">({col.value.length})</span>
                </p>
                <ul className="mt-1 space-y-0.5">
                  {col.value.slice(0, 12).map((v) => (
                    <li key={v} className="font-mono text-[10px] text-dim">
                      {v}
                    </li>
                  ))}
                  {col.value.length === 0 && <li className="text-[10px] text-faint">none</li>}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">{diff.diff?.note}</div>
        </section>
      )}
    </div>
  );
}
