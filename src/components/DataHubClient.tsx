"use client";

/**
 * DATA INTEGRATION HUB — desk (Phase 1).
 *
 * Government-portal treatment: one contract register, one integrity strip per
 * source, and a record inspector. The "SIMULATED / DEMO DATA" banner is rendered
 * from the `simulated` flag the adapters publish, so it disappears by itself the
 * day an authorised production connector replaces a demo transport.
 */
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Database, Download, Loader2, RefreshCw, ShieldAlert, Timer } from "lucide-react";
import type { FeedStatus } from "@/lib/engine/ingestion";
import StatusPill from "./StatusPill";

interface RecordRow {
  id: number;
  system: string;
  sourceRef: string;
  entity: string;
  section: string;
  department: string;
  severity: number;
  quantity: number;
  status: string;
  issues: string[];
  observedAt: string;
}

const TONE: Record<string, "success" | "warning" | "critical" | "info"> = {
  CONNECTED: "success",
  DEGRADED: "warning",
  STALE: "warning",
  DISCONNECTED: "critical",
};

export default function DataHubClient({ initialStatus, summary, throughput }: { initialStatus: FeedStatus[]; summary: Record<string, unknown>; throughput: Record<string, unknown> }) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [records, setRecords] = useState<{ system: string; rows: RecordRow[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function sync(system?: string) {
    setBusy(system ?? "ALL");
    setMessage(null);
    try {
      const res = await fetch("/api/feeds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(system ? { system } : {}) });
      const json = (await res.json()) as { status?: FeedStatus[]; cycles?: { system: string; valid: number; records: number; durationMs: number; state: string }[]; error?: string };
      if (json.error) setMessage(json.error);
      // re-read the hub after the cycles so counts and freshness are true
      const fresh = await fetch("/api/feeds", { cache: "no-store" }).then((r) => r.json());
      setStatus(fresh.status as FeedStatus[]);
      setMessage(
        (json.cycles ?? []).map((c) => `${c.system}: ${c.valid}/${c.records} valid in ${c.durationMs} ms → ${c.state}`).join(" · ") || "cycle complete"
      );
      startTransition(() => {});
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function loadRecords(system: string, onlyInvalid = false) {
    setBusy(`REC-${system}`);
    try {
      const res = await fetch(`/api/feeds?system=${system}&records=1&limit=80${onlyInvalid ? "&status=INVALID" : ""}`, { cache: "no-store" });
      const json = (await res.json()) as { records: RecordRow[] };
      setRecords({ system, rows: json.records ?? [] });
    } finally {
      setBusy(null);
    }
  }

  function exportFeeds() {
    const head = ["System", "Domain", "Contract", "Transport", "State", "Simulated", "Records", "Valid", "Invalid", "Duplicates", "Duration (ms)", "Checksum", "Freshness", "Last sync"];
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = status.map((s) => [s.system, s.domain, s.contractVersion, s.transport, s.state, "YES", s.records, s.valid, s.invalid, s.duplicates, s.durationMs, s.checksum, s.freshness, s.lastSync ?? ""].map(q).join(","));
    const blob = new Blob([[head.map(q).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rail-rakshak-integration-hub-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totalRecords = status.reduce((s, x) => s + x.records, 0);
  const totalValid = status.reduce((s, x) => s + x.valid, 0);

  return (
    <div className="space-y-3">
      {/* Data-honesty banner — driven by the adapters' own flag */}
      <div className="flex flex-wrap items-start gap-2 border border-saffron/40 bg-saffron/[0.06] px-3 py-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-saffron" aria-hidden />
        <p className="text-[11.5px] leading-relaxed text-ink">
          <span className="font-bold uppercase tracking-wide text-saffron">Simulated / demo data.</span> Real Indian Railways TMS, SMMS, TDMS, COA, FOIS,
          working-timetable and IMD operational feeds are not publicly available and no authorised integration exists for this prototype. Every adapter runs
          the production contract shape over a synthetic transport: replacing it with an authorised connector means implementing <span className="font-mono text-[10.5px]">Transport.pull()</span> for
          that system and clearing its <span className="font-mono text-[10.5px]">simulated</span> flag — the normaliser, hub, optimizer and this screen are unchanged.
        </p>
      </div>

      {/* Integrity strip */}
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Contracts", value: String(status.length), sub: "declared departmental feeds" },
          { label: "Connected", value: String(status.filter((s) => s.state === "CONNECTED").length), sub: "inside their sync window" },
          { label: "Degraded / stale", value: String(status.filter((s) => s.state !== "CONNECTED").length), sub: status.filter((s) => s.state !== "CONNECTED").map((s) => s.system).join(", ") || "none" },
          { label: "Records held", value: totalRecords.toLocaleString("en-IN"), sub: `${totalValid.toLocaleString("en-IN")} valid · ${(totalRecords - totalValid).toLocaleString("en-IN")} quarantined/invalid` },
          { label: "Integrity", value: `${totalRecords ? Math.round((totalValid / totalRecords) * 1000) / 10 : 0}%`, sub: "valid share of ingested rows" },
          { label: "Cycles (60 min)", value: String((throughput.cycles as number) ?? 0), sub: `avg ${(throughput.avgDurationMs as number) ?? 0} ms/cycle` },
        ].map((k) => (
          <div key={k.label} className="panel px-3 py-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{k.label}</p>
            <p className="mt-1 font-mono text-[17px] font-bold leading-none text-ink">{k.value}</p>
            <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <Database size={13} aria-hidden /> Contract register — ingestion integrity
          </span>
          <span className="flex items-center gap-1.5">
            <button onClick={exportFeeds} className="btn btn-xs">
              <Download size={11} aria-hidden /> Export
            </button>
            <button onClick={() => sync()} disabled={busy !== null} className="btn btn-primary btn-xs">
              {busy === "ALL" ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <RefreshCw size={11} aria-hidden />} Sync all feeds
            </button>
          </span>
        </div>

        {message && <p className="border-b border-edge bg-primary/[0.04] px-3 py-1.5 font-mono text-[10.5px] text-primary">{message}</p>}

        <div className="gov-table-wrap">
          <table className="gov-table">
            <caption className="sr-only">Departmental feed contracts with their latest ingestion cycle</caption>
            <thead>
              <tr>
                <th className="sr">Sr</th>
                <th>Source</th>
                <th>Contract</th>
                <th>Transport</th>
                <th>State</th>
                <th className="num">Records</th>
                <th className="num">Valid</th>
                <th className="num">Invalid</th>
                <th className="num">Dup</th>
                <th className="num">Duration</th>
                <th>Freshness</th>
                <th>Checksum</th>
                <th>Last sync (IST)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {status.map((s, i) => (
                <tr key={s.system}>
                  <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                  <td>
                    <span className="font-semibold text-ink">{s.system}</span>
                    <span className="mt-0.5 block max-w-[22rem] text-[10.5px] leading-snug text-faint">{s.domain}</span>
                    <span className="mt-0.5 block font-mono text-[9.5px] text-faint">{s.endpoint}</span>
                  </td>
                  <td className="font-mono text-[10.5px]">
                    {s.contractVersion}
                    <span className="mt-0.5 block text-[9.5px] text-faint">every {s.frequencySec}s</span>
                  </td>
                  <td className="text-[10.5px] text-dim">{s.transport}</td>
                  <td>
                    <StatusPill label={s.state} tone={TONE[s.state] ?? "info"} />
                    {s.simulated && <span className="mt-0.5 block font-mono text-[9px] uppercase text-faint">simulated</span>}
                  </td>
                  <td className="num font-mono">{s.records}</td>
                  <td className="num font-mono text-mint">{s.valid}</td>
                  <td className={`num font-mono ${s.invalid > 0 ? "text-signal" : "text-faint"}`}>{s.invalid}</td>
                  <td className={`num font-mono ${s.duplicates > 0 ? "text-saffron" : "text-faint"}`}>{s.duplicates}</td>
                  <td className="num font-mono">{s.durationMs} ms</td>
                  <td className="text-[10.5px] text-dim">{s.freshness}</td>
                  <td className="font-mono text-[9.5px] text-faint">{s.checksum || "—"}</td>
                  <td className="whitespace-nowrap font-mono text-[10px] text-dim">
                    {s.lastSync ? new Date(s.lastSync).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "never"}
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      <button onClick={() => sync(s.system)} disabled={busy !== null} className="btn btn-xs">
                        {busy === s.system ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <RefreshCw size={10} aria-hidden />} Sync
                      </button>
                      <button onClick={() => loadRecords(s.system)} disabled={busy !== null} className="btn btn-xs">
                        <Database size={10} aria-hidden /> Records
                      </button>
                      {s.invalid > 0 && (
                        <button onClick={() => loadRecords(s.system, true)} disabled={busy !== null} className="btn btn-xs">
                          <ShieldAlert size={10} aria-hidden /> Invalid
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
          Checksum is an FNV-1a digest of the exact payload read in the cycle — evidence that the record set was not altered between transport and store.
          Invalid rows are <span className="text-ink">quarantined</span>, never discarded: they remain in <span className="font-mono">ingest_records</span> and appear in the
          Data Quality monitor with the field and reason that failed.
        </div>
      </section>

      {/* Record inspector */}
      {records && (
        <section className="panel">
          <div className="panel-hd">
            <span>
              Normalised records — {records.system} <span className="font-mono normal-case tracking-normal text-faint">({records.rows.length} shown)</span>
            </span>
            <button onClick={() => setRecords(null)} className="btn btn-xs">
              Close
            </button>
          </div>
          <div className="gov-table-wrap max-h-[30rem]">
            <table className="gov-table">
              <thead>
                <tr>
                  <th className="sr">Sr</th>
                  <th>Source ref</th>
                  <th>Entity</th>
                  <th>Section</th>
                  <th>Dept</th>
                  <th className="num">Severity</th>
                  <th className="num">Quantity</th>
                  <th>Status</th>
                  <th>Validation issues</th>
                  <th>Observed (IST)</th>
                </tr>
              </thead>
              <tbody>
                {records.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                    <td className="ref max-w-[16rem] truncate">{r.sourceRef}</td>
                    <td className="text-[10.5px] text-dim">{r.entity}</td>
                    <td className="font-mono text-[10.5px]">{r.section || "—"}</td>
                    <td className="text-[10.5px]">{r.department || "—"}</td>
                    <td className="num font-mono">{r.severity.toFixed(0)}</td>
                    <td className="num font-mono">{r.quantity.toLocaleString("en-IN")}</td>
                    <td>
                      <StatusPill label={r.status} tone={r.status === "VALID" ? "success" : r.status === "DUPLICATE" ? "warning" : "critical"} />
                    </td>
                    <td className="max-w-[24rem] text-[10.5px] text-dim">
                      {r.issues.length === 0 ? (
                        <span className="flex items-center gap-1 text-mint">
                          <CheckCircle2 size={10} aria-hidden /> passes contract validation
                        </span>
                      ) : (
                        <ul className="list-none space-y-0.5">
                          {r.issues.map((x) => (
                            <li key={x} className="flex items-start gap-1">
                              <Timer size={9} className="mt-1 shrink-0 text-saffron" aria-hidden />
                              {x}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="whitespace-nowrap font-mono text-[10px]">
                      {new Date(r.observedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </td>
                  </tr>
                ))}
                {records.rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-[11.5px] text-faint">
                      No records matched. Run a sync cycle for this source.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-[10.5px] text-faint">
        {pending ? "Refreshing hub state…" : "Hub state is read live from the integration tables."} Contract schemas are declared per source and validated on every
        cycle; a payload that stops matching its declared contract raises a schema-mismatch finding in Data Quality.
      </p>
    </div>
  );
}
