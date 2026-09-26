"use client";

/**
 * DATA QUALITY MONITOR — client side (Phase 17).
 *
 * Findings are shown with the record they belong to and, where the engine can
 * repair it, the repair is applied explicitly by a steward and audited. Nothing
 * is discarded by the normaliser: invalid rows stay in the store and are listed
 * here, which is why the counts on this screen and the integration hub agree.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, Wrench } from "lucide-react";
import StatusPill from "./StatusPill";
import type { QualityFinding, QualityReport } from "@/lib/engine/dataquality";

const SEV_TONE = { critical: "critical", warning: "warning", info: "info" } as const;

export default function QualityClient({
  report,
  trend,
  repairable,
}: {
  report: QualityReport;
  trend: { at: string; score: number; findings: number }[];
  repairable: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [, startTransition] = useTransition();

  const findings = report.findings.filter((f) => filter === "ALL" || f.category === filter);

  async function repair(f: QualityFinding) {
    if (!f.repair) return;
    setBusy(f.id);
    setMessage(null);
    try {
      const res = await fetch("/api/quality", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: f.repair.action, payload: f.repair.payload, actorName: "Data Steward (Control)", actorRole: "CONTROL" }),
      });
      const json = (await res.json()) as { error?: string; repair?: { label: string; detail: string; auditId: number } };
      if (json.error) setMessage({ text: json.error, ok: false });
      else setMessage({ text: `${json.repair?.label}: ${json.repair?.detail} (audit #${json.repair?.auditId}).`, ok: true });
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className={`border px-3 py-2 text-[11.5px] ${message.ok ? "border-mint/40 bg-mint/[0.06] text-ink" : "border-signal/40 bg-signal/[0.06] text-ink"}`}>{message.text}</p>
      )}

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Quality score", value: `${report.score}/100`, sub: "weighted by severity of findings" },
          { label: "Critical", value: String(report.totals.critical), sub: "record cannot be trusted as-is" },
          { label: "Warning", value: String(report.totals.warning), sub: "usable but degraded" },
          { label: "Informational", value: String(report.totals.info), sub: "noted for the source owner" },
          { label: "Repairable", value: String(repairable), sub: "engine can apply a recorded repair" },
          { label: "Trend points", value: String(trend.length), sub: trend.length ? `latest score ${trend[trend.length - 1]?.score}/100` : "no snapshot yet" },
        ].map((k) => (
          <div key={k.label} className="panel px-3 py-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{k.label}</p>
            <p className="mt-1 font-mono text-[17px] font-bold leading-none text-ink">{k.value}</p>
            <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-hd">
            <span>Findings by category</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">click to filter the register</span>
          </div>
          <ul className="divide-y divide-edge">
            {report.byCategory.map((c) => (
              <li key={c.category}>
                <button onClick={() => setFilter(filter === c.category ? "ALL" : c.category)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-primary/[0.04] ${filter === c.category ? "bg-primary/[0.05]" : ""}`}>
                  <span className="text-ink">{c.label}</span>
                  <span className="ml-auto font-mono font-bold text-ink">{c.n}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-hd">
            <span>Integrity by source system</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">valid ÷ ingested rows</span>
          </div>
          <div className="gov-table-wrap">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>System</th>
                  <th className="num">Findings</th>
                  <th className="num">Valid</th>
                  <th className="num">Invalid</th>
                  <th>Integrity</th>
                </tr>
              </thead>
              <tbody>
                {report.bySystem.map((s) => (
                  <tr key={s.system}>
                    <td className="text-[11px] font-semibold">{s.system}</td>
                    <td className="num font-mono">{s.findings}</td>
                    <td className="num font-mono text-mint">{s.valid}</td>
                    <td className={`num font-mono ${s.invalid > 0 ? "text-signal" : "text-faint"}`}>{s.invalid}</td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <span className="block h-1.5 w-16 border border-edge bg-abyss" aria-hidden>
                          <span className={`block h-full ${s.integrityPct >= 95 ? "bg-mint" : s.integrityPct >= 80 ? "bg-saffron" : "bg-signal"}`} style={{ width: `${Math.min(100, s.integrityPct)}%` }} />
                        </span>
                        <span className="font-mono text-[10.5px]">{s.integrityPct}%</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <ShieldAlert size={13} aria-hidden /> Finding register — {findings.length} shown
            {filter !== "ALL" && <button onClick={() => setFilter("ALL")} className="btn btn-xs">clear filter</button>}
          </span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">record reference is preserved — no row is deleted</span>
        </div>
        <div className="gov-table-wrap max-h-[36rem]">
          <table className="gov-table">
            <thead>
              <tr>
                <th className="sr">Sr</th>
                <th>Id</th>
                <th>Severity</th>
                <th>Category</th>
                <th>System</th>
                <th>Record</th>
                <th>Field</th>
                <th>Detail</th>
                <th>Repair</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f, i) => (
                <tr key={f.id}>
                  <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                  <td className="ref">{f.id}</td>
                  <td>
                    <StatusPill label={f.severity.toUpperCase()} tone={SEV_TONE[f.severity]} />
                  </td>
                  <td className="text-[10.5px]">{f.category.replace(/_/g, " ")}</td>
                  <td className="text-[10.5px] font-semibold">{f.system}</td>
                  <td className="font-mono text-[10.5px]">
                    {f.recordRef}
                    <span className="mt-0.5 block text-[9.5px] text-faint">{f.entity}</span>
                  </td>
                  <td className="font-mono text-[10px]">{f.field || "—"}</td>
                  <td className="max-w-[30rem] text-[10.5px] leading-relaxed text-dim">{f.detail}</td>
                  <td>
                    {f.repair ? (
                      <button onClick={() => repair(f)} disabled={busy !== null} className="btn btn-xs">
                        {busy === f.id ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Wrench size={10} aria-hidden />} {f.repair.label}
                      </button>
                    ) : (
                      <span className="text-[10px] text-faint">owner action</span>
                    )}
                  </td>
                </tr>
              ))}
              {findings.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-[11.5px] text-faint">
                    No finding in this category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">{report.note}</div>
      </section>
    </div>
  );
}
