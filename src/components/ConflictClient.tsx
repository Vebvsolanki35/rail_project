"use client";

/**
 * CONFLICT RESOLUTION CENTRE — client side (Phase 10).
 *
 * The desk sees one conflict at a time: what it crosses, what it costs, and the
 * feasible options with their re-scored delay. "Apply option" is the human
 * decision — it writes to the block item and appends to the audit trail.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Minus, ShieldCheck, TrainFront } from "lucide-react";
import StatusPill from "./StatusPill";
import { type ConflictRow } from "@/lib/engine/conflicts";

interface Summary {
  total: number;
  critical: number;
  major: number;
  minor: number;
  delayMin: number;
  bestOptionSaving: number;
  sections: string[];
}

const SEV_TONE = { CRITICAL: "critical", MAJOR: "warning", MINOR: "info" } as const;

function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default function ConflictClient({ initial, summary, authority }: { initial: ConflictRow[]; summary: Summary; authority: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial[0]?.conflictKey ?? null);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [filter, setFilter] = useState<"ALL" | "CRITICAL" | "MAJOR" | "MINOR">("ALL");
  const [, startTransition] = useTransition();

  const shown = rows.filter((r) => filter === "ALL" || r.severity === filter);
  const active = rows.find((r) => r.conflictKey === selected) ?? shown[0];

  async function apply(row: ConflictRow, option: string) {
    setBusy(row.conflictKey + option);
    setMessage(null);
    try {
      const res = await fetch("/api/conflicts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blockItemId: row.blockItemId,
          option,
          actorName: "Section Controller (on duty)",
          actorRole: "CONTROL",
          reason: `Conflict ${row.conflictKey} resolved with option ${option}`,
        }),
      });
      const json = (await res.json()) as { error?: string; applied?: { option: string; label: string; delayMin: number; savedMin: number; auditId: number } };
      if (json.error) setMessage({ text: json.error, ok: false });
      else {
        setApplied((a) => ({ ...a, [row.conflictKey]: option }));
        setMessage({
          text: `Option ${json.applied?.option} applied to ${row.segmentCode} day ${row.day + 1}: ${json.applied?.label}. Modelled delay now ${json.applied?.delayMin} min (recovered ${json.applied?.savedMin} min). Recorded in the audit trail as #${json.applied?.auditId}.`,
          ok: true,
        });
        // re-read: the conflict set changes once a block moves
        const fresh = (await fetch("/api/conflicts", { cache: "no-store" }).then((r) => r.json())) as { conflicts: ConflictRow[] };
        setRows(fresh.conflicts ?? []);
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <div className={`flex items-start gap-2 border px-3 py-2 ${message.ok ? "border-mint/40 bg-mint/[0.06]" : "border-signal/40 bg-signal/[0.06]"}`}>
          {message.ok ? <Check size={13} className="mt-0.5 shrink-0 text-mint" aria-hidden /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden />}
          <p className="text-[11.5px] leading-relaxed text-ink">{message.text}</p>
        </div>
      )}

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Conflicts", value: String(summary.total), sub: `${summary.sections.length} section(s)` },
          { label: "Critical", value: String(summary.critical), sub: "needs the controller now" },
          { label: "Major", value: String(summary.major), sub: "resolve before publication" },
          { label: "Minor", value: String(summary.minor), sub: "monitor" },
          { label: "Modelled train delay", value: `${summary.delayMin} min`, sub: "sum across all conflicts" },
          { label: "Recoverable", value: `${summary.bestOptionSaving} min`, sub: "if the best option is taken everywhere" },
        ].map((k) => (
          <div key={k.label} className="panel px-3 py-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{k.label}</p>
            <p className="mt-1 font-mono text-[17px] font-bold leading-none text-ink">{k.value}</p>
            <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["ALL", "CRITICAL", "MAJOR", "MINOR"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`btn btn-xs ${filter === f ? "btn-primary" : ""}`} aria-pressed={filter === f}>
            {f} ({f === "ALL" ? rows.length : rows.filter((r) => r.severity === f).length})
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 border border-ai/40 bg-ai/[0.06] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-ai">
          <ShieldCheck size={11} aria-hidden /> {authority}
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-[22rem_1fr]">
        {/* Conflict list */}
        <section className="panel">
          <div className="panel-hd">
            <span>Conflict queue</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{shown.length} shown</span>
          </div>
          <ul className="max-h-[34rem] divide-y divide-edge overflow-auto">
            {shown.map((r) => (
              <li key={r.conflictKey}>
                <button
                  onClick={() => setSelected(r.conflictKey)}
                  className={`w-full px-3 py-2 text-left transition-colors hover:bg-primary/[0.04] ${active?.conflictKey === r.conflictKey ? "border-l-2 border-primary bg-primary/[0.05]" : "border-l-2 border-transparent"}`}
                >
                  <span className="flex items-center gap-2">
                    <StatusPill label={r.severity} tone={SEV_TONE[r.severity]} />
                    <span className="ref">{r.segmentCode}</span>
                    {applied[r.conflictKey] && <StatusPill label={`OPTION ${applied[r.conflictKey]} APPLIED`} tone="success" />}
                  </span>
                  <span className="mt-1 block font-mono text-[10.5px] text-dim">
                    Day {r.day + 1} · {fmt(r.startMin)}–{fmt(r.endMin)} · {r.window} · {r.departments.join("+")}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-dim">
                    {r.trainsAffected} train(s) · {r.delayMin} delay-min · {r.taskCount} task(s)
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="p-4 text-center text-[11.5px] text-faint">No conflict at this severity.</li>}
          </ul>
        </section>

        {/* Detail + options */}
        {active ? (
          <section className="panel">
            <div className="panel-hd">
              <span>
                {active.conflictKey} — {active.segmentCode} · {active.corridor}
              </span>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
                plan #{active.planId} · block #{active.blockItemId}
              </span>
            </div>

            <div className="grid gap-3 p-3 lg:grid-cols-2">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Conflict</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink">{active.reason}</p>
                <dl className="kv mt-2">
                  <div className="contents">
                    <dt>Possession window</dt>
                    <dd className="font-mono">
                      Day {active.day + 1} {fmt(active.startMin)}–{fmt(active.endMin)} ({active.durationMin} min, {active.window})
                    </dd>
                  </div>
                  <div className="contents">
                    <dt>Departments</dt>
                    <dd>{active.departments.join(" + ")}</dd>
                  </div>
                  <div className="contents">
                    <dt>Tasks in block</dt>
                    <dd className="font-mono">{active.taskCount}</dd>
                  </div>
                  <div className="contents">
                    <dt>Trains affected</dt>
                    <dd className="font-mono">{active.trainsAffected}</dd>
                  </div>
                  <div className="contents">
                    <dt>Modelled delay</dt>
                    <dd className="font-mono text-signal">{active.delayMin} min</dd>
                  </div>
                </dl>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Trains exposed (working timetable)</p>
                <ul className="mt-1 space-y-0.5">
                  {active.trainsExposed.map((t) => (
                    <li key={t} className="flex items-center gap-1.5 font-mono text-[10.5px] text-dim">
                      <TrainFront size={10} className="shrink-0 text-saffron" aria-hidden /> {t}
                    </li>
                  ))}
                  {active.trainsExposed.length === 0 && <li className="text-[11px] text-faint">No scheduled path crosses this window directly.</li>}
                </ul>
                <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                  Delay is costed per train class using the division&apos;s delay values (passenger, freight, diesel, emergency), so an option that shortens the
                  possession but re-exposes a premium train is not automatically &quot;better&quot;.
                </p>
              </div>
            </div>

            <div className="border-t border-edge">
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-faint">Feasible alternatives — re-scored, not copied</span>
                <span className="font-mono text-[10px] text-faint">current delay {active.delayMin} min</span>
              </div>
              <div className="gov-table-wrap">
                <table className="gov-table">
                  <thead>
                    <tr>
                      <th>Option</th>
                      <th>Action</th>
                      <th>Window</th>
                      <th>Depts</th>
                      <th className="num">Trains</th>
                      <th className="num">Delay-min</th>
                      <th className="num">Δ vs current</th>
                      <th>Feasibility</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.alternatives.map((o) => (
                      <tr key={o.id} className={o.option === "D" ? "bg-primary/[0.04]" : undefined}>
                        <td className="font-mono text-[11px] font-bold">
                          {o.option}
                          {o.option === "D" && <span className="ml-1 text-[9px] uppercase text-primary">golden</span>}
                        </td>
                        <td className="text-[11px] text-ink">
                          {o.label}
                          <span className="mt-0.5 block text-[10px] text-faint">{o.action}</span>
                        </td>
                        <td className="font-mono text-[10.5px]">
                          D{o.day + 1} {fmt(o.startMin)}–{fmt(o.endMin)}
                        </td>
                        <td className="text-[10.5px]">{o.departments.join("+")}</td>
                        <td className="num font-mono">{o.affectedTrains}</td>
                        <td className="num font-mono">{o.delayMin}</td>
                        <td className="num font-mono">
                          {o.deltaVsCurrent > 0 ? (
                            <span className="flex items-center justify-end gap-1 text-mint">
                              <Minus size={9} aria-hidden /> {o.deltaVsCurrent}
                            </span>
                          ) : (
                            <span className="text-signal">+{Math.abs(o.deltaVsCurrent)}</span>
                          )}
                        </td>
                        <td>
                          {o.feasible ? (
                            <StatusPill label="FEASIBLE" tone="success" />
                          ) : (
                            <span>
                              <StatusPill label="BLOCKED" tone="critical" />
                              <span className="mt-0.5 block max-w-[14rem] text-[9.5px] text-signal">{o.blockers.join("; ")}</span>
                            </span>
                          )}
                        </td>
                        <td>
                          <button onClick={() => apply(active, o.option)} disabled={!o.feasible || busy !== null} className="btn btn-xs">
                            {busy === active.conflictKey + o.option ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Check size={10} aria-hidden />} Apply
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-edge px-3 py-2">
                <p className="text-[11px] text-ink">
                  <span className="font-bold">Engine preference:</span> {active.recommendation}
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
                  A recommendation is not a decision: the block only moves when an officer applies an option, and that action is written to the audit trail with the
                  actor, role, old window, new window and reason. Rejecting every option leaves the conflict open for the next review.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="panel p-6 text-center text-[11.5px] text-faint">
            No conflict on the current plan — nothing to resolve. The engine re-checks on every plan run and on every timetable or block change.
          </section>
        )}
      </div>
    </div>
  );
}
