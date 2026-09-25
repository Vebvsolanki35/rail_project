"use client";

/**
 * SHADOW BLOCK REGISTER — client side (Phase 4).
 *
 * The table shows the per-section arithmetic already computed on the server and
 * lets a controller store an analysis (audited as RR-SHD) or open one section's
 * wave plan. No number is recalculated in the browser.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, Save } from "lucide-react";
import StatusPill from "./StatusPill";
import type { ShadowAnalysis } from "@/lib/engine/shadowblock";

export default function ShadowClient({ initial }: { initial: ShadowAnalysis[] }) {
  const router = useRouter();
  const [rows] = useState(initial);
  const [open, setOpen] = useState<number | null>(initial[0]?.segmentId ?? null);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function store(a: ShadowAnalysis) {
    setBusy(a.segmentId);
    setNote(null);
    try {
      const res = await fetch("/api/shadow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ segmentId: a.segmentId, actorName: "Shadow Block Engine", actorRole: "SYSTEM" }),
      });
      const json = (await res.json()) as { error?: string; stored?: { ref: string; savedMin: number } };
      setNote(json.error ? json.error : `${json.stored?.ref} stored — ${json.stored?.savedMin} min of possession saved against independent departmental blocks.`);
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-hd">
        <span>Section register — combination potential</span>
        <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">independent vs combined possession, from the live register</span>
      </div>
      {note && <p className="border-b border-edge bg-primary/[0.04] px-3 py-1.5 text-[11px] text-primary">{note}</p>}
      <div className="gov-table-wrap max-h-[38rem]">
        <table className="gov-table">
          <caption className="sr-only">Shadow block analysis by section</caption>
          <thead>
            <tr>
              <th className="sr">Sr</th>
              <th aria-label="expand" />
              <th>Section</th>
              <th>Departments with open work</th>
              <th className="num">Tasks</th>
              <th className="num">Independent</th>
              <th className="num">Combined</th>
              <th className="num">Time saved</th>
              <th className="num">Dup. poss.</th>
              <th className="num">Train delay saved</th>
              <th>Verdict</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <>
                <tr key={a.segmentId} className={open === a.segmentId ? "bg-primary/[0.04]" : undefined}>
                  <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                  <td>
                    <button onClick={() => setOpen(open === a.segmentId ? null : a.segmentId)} aria-label={open === a.segmentId ? "collapse" : "expand"} className="text-dim hover:text-ink">
                      {open === a.segmentId ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  </td>
                  <td className="ref">
                    {a.segmentCode}
                    <span className="mt-0.5 block text-[10px] text-faint">
                      {a.corridor} · {a.dailyTrains} trains/day
                    </span>
                  </td>
                  <td className="text-[11px]">
                    {a.departments.join(" + ")}
                    <span className="mt-0.5 block text-[10px] text-faint">
                      ENG {a.breakdown.find((b) => b.department === "ENG")?.durationMin ?? 0}m · TRD {a.breakdown.find((b) => b.department === "TRD")?.durationMin ?? 0}m · SNT{" "}
                      {a.breakdown.find((b) => b.department === "SNT")?.durationMin ?? 0}m
                    </span>
                  </td>
                  <td className="num font-mono">{a.tasks.length}</td>
                  <td className="num font-mono">{a.independentMin} m</td>
                  <td className="num font-mono">{a.combinedMin} m</td>
                  <td className={`num font-mono font-bold ${a.savedMin > 0 ? "text-mint" : "text-faint"}`}>
                    {a.savedMin} m{a.savedPct > 0 ? ` (${a.savedPct}%)` : ""}
                  </td>
                  <td className="num font-mono">{a.duplicatePossessionsAvoided}</td>
                  <td className="num font-mono">{a.trainDelaySavedMin} m</td>
                  <td>
                    {a.compatible ? <StatusPill label={a.savedMin > 0 ? "COMBINABLE" : "NO GAIN"} tone={a.savedMin > 0 ? "success" : "info"} /> : <StatusPill label="REFUSED" tone="critical" />}
                  </td>
                  <td>
                    <span className="flex gap-1">
                      <button onClick={() => store(a)} disabled={busy !== null} className="btn btn-xs">
                        {busy === a.segmentId ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Save size={10} aria-hidden />} Store
                      </button>
                      <Link2 href={`/blocks?segmentId=${a.segmentId}`} />
                    </span>
                  </td>
                </tr>
                {open === a.segmentId && (
                  <tr key={`${a.segmentId}-detail`}>
                    <td colSpan={12} className="bg-abyss/60 p-3">
                      <div className="grid gap-3 lg:grid-cols-3">
                        <div>
                          <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Tasks in scope</p>
                          <ul className="mt-1 space-y-0.5">
                            {a.tasks.map((t) => (
                              <li key={t.id} className="flex items-start gap-1.5 text-[11px]">
                                <span className="mt-0.5 font-mono text-[10px] font-bold text-primary">{t.department}</span>
                                <span className="text-ink">{t.defectCode}</span>
                                <span className="text-dim">— {t.title}</span>
                                <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] text-dim">{t.durationMin}m</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Wave plan (parallel work)</p>
                          <ol className="mt-1 space-y-1">
                            {a.waves.map((w) => (
                              <li key={w.index} className="flex items-center gap-2 border border-edge px-2 py-1">
                                <span className="font-mono text-[10.5px] font-bold text-ink">WAVE {w.index + 1}</span>
                                <span className="text-[11px] text-dim">{w.departments.join(" + ")}</span>
                                <span className="ml-auto font-mono text-[10.5px]">{w.durationMin} min</span>
                              </li>
                            ))}
                          </ol>
                          <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
                            Requirements: {a.lineBlockRequired ? "line block" : "no line block"}
                            {a.powerIsolationRequired ? " + power isolation (TRD)" : ""} · confidence {a.confidence.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Compatibility verdict</p>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-dim">{a.note}</p>
                          {a.blockers.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {a.blockers.map((b) => (
                                <li key={b} className="text-[10.5px] text-signal">
                                  • {b}
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
                            Train-delay comparison: {a.trainDelayIndependentMin} min if worked separately vs {a.trainDelayCombinedMin} min combined — costed with the same
                            per-class delay values the planner uses.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="p-6 text-center text-[11.5px] text-faint">
                  No open work on any section — nothing to combine.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
        &quot;Combinable&quot; is not a preference: it means the tasks passed the compatibility test (line-block scope, power isolation for OHE work, exclusive machine
        clash) and the wave packer found parallelism that a sequential schedule cannot. Where the test fails, the reason is printed on the row and the saving is zero.
      </div>
    </section>
  );
}

function Link2({ href }: { href: string }) {
  return (
    <a href={href} className="btn btn-xs" title="Raise a block request for this section">
      Request
    </a>
  );
}
