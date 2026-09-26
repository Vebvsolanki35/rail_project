"use client";

/**
 * RESOURCE OPTIMIZATION DESK — client side (Phase 7).
 *
 * The toggle is the honest part of this screen: marking a gang unavailable or a
 * machine out of service changes what the optimizer is ALLOWED to place. The
 * desk can then re-run the plan and see the refusals the constraint produced.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, HardHat, Loader2, RefreshCw, Truck } from "lucide-react";
import StatusPill from "./StatusPill";
import type { ResourceRow } from "@/lib/engine/resources";

interface Board {
  resources: ResourceRow[];
  establishment: number;
}

interface DeptUse {
  department: string;
  crews: number;
  capacity: number;
  committed: number;
  utilisationPct: number;
  machines: number;
}

function fmt(min: number): string {
  if (min >= 1439) return "round the clock";
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default function ResourceClient({
  board,
  utilisation,
  dayCapacity,
  rejections,
  planId,
}: {
  board: Board;
  utilisation: { byDept: DeptUse[]; machines: { code: string; minutes: number }[]; infeasible: string[]; totalCommitted: number };
  dayCapacity: { department: string; day: number; crewUsed: number; crewCap: number }[];
  rejections: { id: number; at: string; note: string | null; department?: unknown; window?: unknown; reasons?: unknown }[];
  planId: number | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(board.resources);
  const [busy, setBusy] = useState<string | "REPLAN" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [, startTransition] = useTransition();

  async function toggle(r: ResourceRow) {
    setBusy(r.code);
    setMessage(null);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: r.code,
          available: !r.available,
          reason: r.available ? "withdrawn by SSE — redeployed to another work site" : "restored to the division roster",
          actorName: "SSE (Resource Desk)",
          actorRole: "CONTROL",
        }),
      });
      const json = (await res.json()) as { error?: string; resources?: ResourceRow[] };
      const changed = json.resources?.find((x) => x.code === r.code);
      if (json.error) setMessage({ text: json.error, ok: false });
      else {
        if (json.resources) setRows(json.resources);
        setMessage({
          text: changed?.available
            ? `${r.code} is available again (${r.units} unit(s), ${r.department}). Re-run the plan to let the optimizer use it.`
            : `${r.code} withdrawn from service. The optimizer will now refuse any block that needs it — ${r.units} unit(s) removed from ${r.department} capacity.`,
          ok: true,
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function replan() {
    setBusy("REPLAN");
    setMessage(null);
    try {
      const res = await fetch("/api/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ horizon: "WEEKLY", actorName: "Resource Desk", actorRole: "CONTROL" }) });
      const json = (await res.json()) as { planId?: number; blocks?: number; placed?: number; refusals?: number; error?: string };
      if (json.error) setMessage({ text: json.error, ok: false });
      else {
        setMessage({
          text: `Plan #${json.planId} generated under the current roster: ${json.blocks} block(s) placed, ${json.refusals ?? 0} candidate placement(s) refused by the resource constraints. Open the planner for the per-block authority contract.`,
          ok: true,
        });
        const fresh = (await fetch("/api/resources", { cache: "no-store" }).then((r) => r.json())) as { resources: ResourceRow[] };
        setRows(fresh.resources ?? rows);
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  const crews = rows.filter((r) => r.kind === "CREW");
  const machines = rows.filter((r) => r.kind !== "CREW");
  const unavailable = rows.filter((r) => !r.available);
  const capOf = (dept: string) => rows.filter((r) => r.department === dept && r.kind === "CREW" && r.available).reduce((s, r) => s + r.units, 0);

  return (
    <div className="space-y-3">
      {message && (
        <div className={`flex items-start gap-2 border px-3 py-2 ${message.ok ? "border-mint/40 bg-mint/[0.06]" : "border-signal/40 bg-signal/[0.06]"}`}>
          <HardHat size={13} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <p className="text-[11.5px] leading-relaxed text-ink">{message.text}</p>
        </div>
      )}

      {/* Department capacity today */}
      <section className="panel">
        <div className="panel-hd">
          <span>Department capacity — the ceiling the solver cannot cross</span>
          <button onClick={replan} disabled={busy !== null} className="btn btn-primary btn-xs">
            {busy === "REPLAN" ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <RefreshCw size={11} aria-hidden />} Re-run plan with this roster
          </button>
        </div>
        <div className="gov-table-wrap">
          <table className="gov-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Day</th>
                <th className="num">Crews detailed / available</th>
                <th className="num">Machines in service</th>
                <th>Headroom</th>
              </tr>
            </thead>
            <tbody>
              {dayCapacity.map((d) => (
                <tr key={`${d.department}-${d.day}`}>
                  <td className="text-[11px] font-semibold">{d.department}</td>
                  <td className="font-mono text-[10.5px]">Day {d.day + 1}</td>
                  <td className="num font-mono">
                    {d.crewUsed} / {d.crewCap}
                  </td>
                  <td className="num font-mono">{rows.filter((r) => r.department === d.department && r.kind !== "CREW" && r.available).reduce((s, r) => s + r.units, 0)}</td>
                  <td>
                    {d.crewUsed > d.crewCap ? (
                      <StatusPill label="SATURATED" tone="critical" />
                    ) : d.crewUsed === 0 ? (
                      <StatusPill label="FREE" tone="success" />
                    ) : (
                      <StatusPill label={`${d.crewCap - d.crewUsed} crew slot(s) left`} tone="info" />
                    )}
                  </td>
                </tr>
              ))}
              {dayCapacity.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-5 text-center text-[11.5px] text-faint">
                    No plan placed yet — run the optimizer to populate the commitment sheet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
          Capacity is counted in crew-slots per department per day (a gang detailed to two blocks on one day consumes two slots). A block that would exceed the
          ceiling is refused at placement time with the reason recorded, not quietly squeezed in.
        </div>
      </section>

      {/* Establishment */}
      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <HardHat size={13} aria-hidden /> Crew, machine &amp; equipment establishment
          </span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
            {rows.length} resource(s) · {unavailable.length} currently out of service
          </span>
        </div>
        <div className="grid gap-2 p-3 lg:grid-cols-2">
          <table className="gov-table">
            <caption className="sr-only">Crew gangs in the division</caption>
            <thead>
              <tr>
                <th>Crew gang</th>
                <th>Dept</th>
                <th>Section scope</th>
                <th className="num">Units</th>
                <th>Shift window</th>
                <th className="num">Max shift</th>
                <th>State</th>
                <th>Toggle</th>
              </tr>
            </thead>
            <tbody>
              {crews.map((r) => (
                <tr key={r.code} className={!r.available ? "opacity-60" : undefined}>
                  <td className="font-mono text-[10.5px]">
                    {r.code}
                    <span className="mt-0.5 block text-[10px] text-faint">{r.name}</span>
                  </td>
                  <td className="text-[11px] font-semibold">{r.department}</td>
                  <td className="text-[10.5px] text-dim">{r.sectionScope.length === 0 ? "division-wide (mobile relief)" : r.sectionScope.join(", ")}</td>
                  <td className="num font-mono">{r.units}</td>
                  <td className="font-mono text-[10.5px]">
                    {fmt(r.shiftStart)}–{fmt(r.shiftEnd)}
                  </td>
                  <td className="num font-mono">{r.maxShiftMin} m</td>
                  <td>{r.available ? <StatusPill label="AVAILABLE" tone="success" /> : <StatusPill label="WITHDRAWN" tone="critical" />}</td>
                  <td>
                    <button onClick={() => toggle(r)} disabled={busy !== null} className="btn btn-xs">
                      {busy === r.code ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Ban size={10} aria-hidden />} {r.available ? "Withdraw" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="gov-table">
            <caption className="sr-only">Machines and equipment</caption>
            <thead>
              <tr>
                <th>Machine / equipment</th>
                <th>Dept</th>
                <th className="num">Units</th>
                <th>Deployable</th>
                <th>State</th>
                <th>Toggle</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((r) => (
                <tr key={r.code} className={!r.available ? "opacity-60" : undefined}>
                  <td className="font-mono text-[10.5px]">
                    {r.code}
                    <span className="mt-0.5 block text-[10px] text-faint">{r.name}</span>
                  </td>
                  <td className="text-[11px] font-semibold">{r.department}</td>
                  <td className="num font-mono">{r.units}</td>
                  <td className="text-[10.5px] text-dim">{r.sectionScope.length === 0 ? "division-wide" : r.sectionScope.join(", ")}</td>
                  <td>{r.available ? <StatusPill label="IN SERVICE" tone="success" /> : <StatusPill label="OUT OF SERVICE" tone="critical" />}</td>
                  <td>
                    <button onClick={() => toggle(r)} disabled={busy !== null} className="btn btn-xs">
                      {busy === r.code ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Truck size={10} aria-hidden />} {r.available ? "Withdraw" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Utilisation */}
      <section className="grid gap-3 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-hd">
            <span>Utilisation against the placed plan</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">units consumed ÷ units available</span>
          </div>
          <div className="gov-table-wrap max-h-[26rem]">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Establishment</th>
                  <th className="num">Crew-slots used</th>
                  <th className="num">of capacity (7 d)</th>
                  <th>Load</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {utilisation.byDept.map((u) => (
                  <tr key={u.department}>
                    <td className="text-[11px] font-semibold">{u.department}</td>
                    <td className="text-[10.5px] text-dim">
                      {u.crews} gang(s) · {u.machines} machine type(s)
                    </td>
                    <td className="num font-mono">{u.committed}</td>
                    <td className="num font-mono">
                      {u.committed} / {u.capacity}
                    </td>
                    <td>
                      <span className="block h-1.5 w-full max-w-[10rem] border border-edge bg-abyss" aria-hidden>
                        <span className={`block h-full ${u.utilisationPct >= 90 ? "bg-signal" : u.utilisationPct >= 60 ? "bg-saffron" : "bg-mint"}`} style={{ width: `${Math.min(100, u.utilisationPct)}%` }} />
                      </span>
                    </td>
                    <td className="num font-mono">{u.utilisationPct}%</td>
                  </tr>
                ))}
                {utilisation.byDept.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-5 text-center text-[11.5px] text-faint">
                      No plan committed yet — run the optimizer to load the establishment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-hd">
            <span>Refused placements (last 24 h)</span>
            <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">proof the constraint operates</span>
          </div>
          <ul className="max-h-[26rem] divide-y divide-edge overflow-auto">
            {rejections.map((r) => (
              <li key={r.id} className="px-3 py-2">
                <p className="flex items-center gap-2 text-[11px]">
                  <StatusPill label={String(r.department ?? "—")} tone="info" />
                  <span className="font-mono text-[10.5px] text-dim">{String(r.window ?? "—")} window</span>
                  <span className="ml-auto font-mono text-[10px] text-faint">
                    {new Date(r.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                </p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink">{arr(r.reasons).join("; ") || r.note}</p>
              </li>
            ))}
            {rejections.length === 0 && (
              <li className="p-5 text-center text-[11.5px] text-faint">
                No placement was refused in the last 24 hours — the roster currently supports every task the plan wanted to place.
              </li>
            )}
          </ul>
          <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
            Refusals are the honest output of the resource engine: {rows.length - unavailable.length} of {rows.length} resources are in service
            {unavailable.length > 0 ? `, with ${unavailable.map((u) => u.code).join(", ")} withdrawn — any block needing them is refused rather than scheduled.` : " and the establishment covers all requested work."}
            {planId ? ` Load figures above are computed against plan #${planId} (crew capacity ${["ENG", "TRD", "SNT"].map((d) => `${d} ${capOf(d)}`).join(", ")}).` : ""}
            {utilisation.infeasible.length > 0 ? ` The current plan contains ${utilisation.infeasible.length} window(s) that this roster could not have supported: ${utilisation.infeasible.slice(0, 3).join(" | ")}.` : ""}
          </div>
        </section>
      </section>
    </div>
  );
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}
