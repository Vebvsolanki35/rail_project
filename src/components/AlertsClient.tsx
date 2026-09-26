"use client";

/**
 * ALERT CENTRE — client side (Phase 18).
 *
 * Alerts are derived live from the register (defects, requests, conflicts,
 * feeds, quality, plans), each carrying the rule that fired, the measured value,
 * the threshold it crossed and a link to the record that caused it.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Check, ExternalLink, Loader2, ShieldAlert, TriangleAlert, Info } from "lucide-react";
import StatusPill from "./StatusPill";
import type { OperationalAlert } from "@/lib/engine/alerts";

const TONE = { CRITICAL: "critical", WARNING: "warning", INFO: "info" } as const;
const ICON = { CRITICAL: ShieldAlert, WARNING: TriangleAlert, INFO: Info } as const;

export default function AlertsClient({ initial, summary, riskThreshold }: { initial: OperationalAlert[]; summary: { total: number; critical: number; warning: number; info: number; unacknowledged: number }; riskThreshold: number }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(initial);
  const [filter, setFilter] = useState<"ALL" | "CRITICAL" | "WARNING" | "INFO">("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const shown = alerts.filter((a) => filter === "ALL" || a.severity === filter);

  async function ack(a: OperationalAlert) {
    setBusy(a.id);
    setMessage(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: a.id, actorName: "Duty Officer (Control)", actorRole: "CONTROL", note }),
      });
      const json = (await res.json()) as { error?: string; acknowledged?: { at: string }; alerts?: OperationalAlert[] };
      if (json.error) setMessage(json.error);
      else {
        setMessage(`${a.id} acknowledged at ${new Date(json.acknowledged?.at ?? Date.now()).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })} — recorded in the audit trail.`);
        const fresh = (await fetch("/api/alerts", { cache: "no-store" }).then((r) => r.json())) as { alerts: OperationalAlert[] };
        setAlerts(fresh.alerts ?? alerts);
        setNote("");
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Active alerts", value: String(summary.total), sub: `${summary.unacknowledged} unacknowledged` },
          { label: "Critical", value: String(summary.critical), sub: `failure risk ≥ ${(riskThreshold * 100).toFixed(0)}%, blocking conflicts, emergency defects` },
          { label: "Warning", value: String(summary.warning), sub: "competing demand, overdue work, stale feeds" },
          { label: "Informational", value: String(summary.info), sub: "new plan, re-plan, quality quarantine" },
          { label: "Acknowledged", value: String(summary.total - summary.unacknowledged), sub: "recorded with actor and role" },
        ].map((k) => (
          <div key={k.label} className="panel px-3 py-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{k.label}</p>
            <p className="mt-1 font-mono text-[17px] font-bold leading-none text-ink">{k.value}</p>
            <p className="mt-1 text-[10.5px] text-dim">{k.sub}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "CRITICAL", "WARNING", "INFO"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`btn btn-xs ${filter === f ? "btn-primary" : ""}`} aria-pressed={filter === f}>
            {f} ({f === "ALL" ? alerts.length : alerts.filter((a) => a.severity === f).length})
          </button>
        ))}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Acknowledgement remark (applied to the next acknowledgement)"
          className="ml-auto w-full max-w-sm border border-edge bg-hull px-2 py-1.5 text-[11px] text-ink placeholder:text-faint"
        />
      </div>

      {message && <p className="border border-mint/40 bg-mint/[0.06] px-3 py-2 text-[11.5px] text-ink">{message}</p>}

      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <BellRing size={13} aria-hidden /> Alert queue — {shown.length} shown
          </span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">every alert names its rule, measured value and threshold</span>
        </div>
        <ul className="divide-y divide-edge">
          {shown.map((a) => {
            const Icon = ICON[a.severity];
            return (
              <li key={a.id} className={`flex flex-wrap items-start gap-3 px-3 py-2.5 ${a.severity === "CRITICAL" ? "bg-signal/[0.04]" : ""} ${a.acknowledged ? "opacity-70" : ""}`}>
                <Icon
                  size={14}
                  className={`mt-0.5 shrink-0 ${a.severity === "CRITICAL" ? "text-signal" : a.severity === "WARNING" ? "text-saffron" : "text-primary"}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <StatusPill label={a.severity} tone={TONE[a.severity]} />
                    <span className="text-[12px] font-bold text-ink">{a.title}</span>
                    {a.acknowledged && <StatusPill label="ACKNOWLEDGED" tone="success" />}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-dim">{a.detail}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[10px] text-faint">
                    <span>rule: {a.rule}</span>
                    <span>measured: {a.measured}</span>
                    <span>threshold: {a.threshold}</span>
                    <span>{a.section}</span>
                    {a.department && <span>{a.department}</span>}
                    <span>{new Date(a.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                  </p>
                  {a.acknowledged && (
                    <p className="mt-1 text-[10.5px] text-mint">
                      Acknowledged by {a.acknowledged.by} ({a.acknowledged.role}) — {a.acknowledged.note || "no remark"}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* the alert must reach the record that caused it */}
                  {a.link.href.startsWith("/") ? (
                    <Link href={a.link.href} className="btn btn-xs" title={a.link.label}>
                      <ExternalLink size={10} aria-hidden /> {a.link.label}
                    </Link>
                  ) : (
                    <span className="font-mono text-[10px] text-dim">{a.link.label}</span>
                  )}
                  <button onClick={() => ack(a)} disabled={busy !== null || !!a.acknowledged} className="btn btn-xs">
                    {busy === a.id ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Check size={10} aria-hidden />} Ack
                  </button>
                </div>
              </li>
            );
          })}
          {shown.length === 0 && <li className="p-6 text-center text-[11.5px] text-faint">No alert at this severity — the register is clear.</li>}
        </ul>
      </section>

      <p className="text-[10.5px] leading-relaxed text-faint">
        Alerts are generated from live rows on every request, so an alert disappears by itself when the condition is fixed (the defect closed, the overlap moved,
        the feed synced). Acknowledgement never deletes the alert: it writes an <span className="font-mono">SYNTHETIC_ALERT</span> entry to the ledger with the
        actor, role, severity and remark, and the alert remains visible as acknowledged.
      </p>
    </div>
  );
}
