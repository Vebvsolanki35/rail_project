"use client";

/**
 * BLOCK REQUEST EXCHANGE — desk (Phase 3).
 *
 * A departmental demand is raised, checked against the resource establishment
 * at creation, and then moved through the exchange's status machine. CONFLICT is
 * not a free label: the API refuses it unless a real overlap exists, and the
 * overlap evidence is printed on the row.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Send, Wrench } from "lucide-react";
import StatusPill from "./StatusPill";
import type { BlockRequestDTO, RequestStatus } from "@/lib/engine/blockrequests";

interface SegmentOption {
  id: number;
  code: string;
  corridor: string;
  dailyTrains: number;
}
interface DefectOption {
  id: number;
  defectCode: string;
  title: string;
  department: string;
  segmentId: number;
  durationMin: number;
}

const STATUS_TONE: Record<RequestStatus, "neutral" | "info" | "warning" | "critical" | "success" | "ai"> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  CONFLICT: "critical",
  OPTIMIZING: "ai",
  PROPOSED: "warning",
  APPROVED: "success",
  REJECTED: "critical",
  PUBLISHED: "success",
  COMPLETED: "success",
};

function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default function BlockExchangeClient({
  initial,
  segments,
  defects,
}: {
  initial: BlockRequestDTO[];
  segments: SegmentOption[];
  defects: DefectOption[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState<number | string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    department: "ENG",
    segmentId: segments[0]?.id ?? 0,
    defectId: 0,
    durationMin: 90,
    priority: "HIGH",
    crewRequired: 1,
    machineRequired: "",
    powerIsolation: false,
    lineBlock: true,
    requestedStart: 60,
    note: "",
  });

  const inSegment = defects.filter((d) => d.segmentId === form.segmentId);

  async function reload() {
    const json = (await fetch("/api/blocks", { cache: "no-store" }).then((r) => r.json())) as { requests: BlockRequestDTO[] };
    setRequests(json.requests ?? []);
    startTransition(() => router.refresh());
  }

  async function create() {
    setBusy("create");
    setMessage(null);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          department: form.department,
          segmentId: form.segmentId,
          defectId: form.defectId || undefined,
          durationMin: form.durationMin,
          priority: form.priority,
          crewRequired: form.crewRequired,
          machineRequired: form.machineRequired || undefined,
          powerIsolation: form.powerIsolation,
          lineBlock: form.lineBlock,
          requestedStart: form.requestedStart,
          requestedEnd: form.requestedStart + form.durationMin,
          note: form.note,
          actorName: "Desk Officer (Block Exchange)",
          actorRole: "CONTROL",
        }),
      });
      const json = (await res.json()) as { error?: string; request?: BlockRequestDTO; resourceVerdict?: { feasible: boolean; rejections: string[]; shiftWindow: string | null; crewUsed: number; crewCapacity: number } };
      if (json.error) setMessage({ text: json.error, ok: false });
      else {
        setMessage({
          text: json.resourceVerdict?.feasible
            ? `${json.request?.ref} raised — resource check passed (crew ${json.resourceVerdict.crewUsed}/${json.resourceVerdict.crewCapacity} on the day, shift ${json.resourceVerdict.shiftWindow ?? "—"}).`
            : `${json.request?.ref} raised WITH resource constraint flagged: ${json.resourceVerdict?.rejections.join("; ")}. It cannot be worked as requested until a crew/machine is freed.`,
          ok: !!json.resourceVerdict?.feasible,
        });
        await reload();
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "request failed", ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function advance(r: BlockRequestDTO, to: RequestStatus) {
    setBusy(r.id);
    setMessage(null);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "advance", id: r.id, to, actorName: "Desk Officer (Block Exchange)", actorRole: "CONTROL", reason: `${r.status} → ${to} from the Block Request Exchange` }),
      });
      const json = (await res.json()) as { error?: string; conflicts?: { detail: string }[] };
      if (json.error) setMessage({ text: json.error, ok: false });
      else {
        setMessage({
          text: json.conflicts?.length
            ? `${r.ref} → ${to}. Overlap evidence: ${json.conflicts.map((c) => c.detail).join("; ")}`
            : `${r.ref} → ${to}.`,
          ok: true,
        });
        await reload();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <div className={`flex items-start gap-2 border px-3 py-2 ${message.ok ? "border-mint/40 bg-mint/[0.06]" : "border-signal/40 bg-signal/[0.06]"}`}>
          {message.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-mint" aria-hidden /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden />}
          <p className="text-[11.5px] leading-relaxed text-ink">{message.text}</p>
        </div>
      )}

      {/* Raise a request */}
      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <Send size={13} aria-hidden /> Raise a maintenance block request
          </span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">validated against the resource establishment on submit</span>
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-3 xl:grid-cols-4">
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Department</span>
            <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink">
              {["ENG", "TRD", "SNT"].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Section</span>
            <select
              value={form.segmentId}
              onChange={(e) => setForm({ ...form, segmentId: Number(e.target.value), defectId: 0 })}
              className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink"
            >
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.corridor} · {s.dailyTrains} t/day
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Linked defect (optional)</span>
            <select value={form.defectId} onChange={(e) => {
              const id = Number(e.target.value);
              const d = inSegment.find((x) => x.id === id);
              setForm({ ...form, defectId: id, durationMin: d?.durationMin ?? form.durationMin, note: d ? `${d.defectCode} — ${d.title}` : form.note });
            }} className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink">
              <option value={0}>— standalone request —</option>
              {inSegment.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.defectCode} · {d.department} · {d.durationMin}m
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Duration (min)</span>
            <input
              type="number"
              min={15}
              max={600}
              value={form.durationMin}
              onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
              className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 font-mono text-[11.5px] text-ink"
            />
          </label>
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Window start (min from 00:00)</span>
            <input
              type="number"
              min={0}
              max={1380}
              step={15}
              value={form.requestedStart}
              onChange={(e) => setForm({ ...form, requestedStart: Number(e.target.value) })}
              className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 font-mono text-[11.5px] text-ink"
            />
            <span className="mt-0.5 block font-mono text-[10px] text-faint">
              = {fmt(form.requestedStart)}–{fmt(form.requestedStart + form.durationMin)} hrs
            </span>
          </label>
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Priority</span>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink">
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Machine / equipment</span>
            <input
              value={form.machineRequired}
              onChange={(e) => setForm({ ...form, machineRequired: e.target.value })}
              placeholder="e.g. tamping machine"
              className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink placeholder:text-faint"
            />
          </label>
          <div className="flex items-end gap-3 pb-1">
            <label className="flex items-center gap-1.5 text-[11px] text-ink">
              <input type="checkbox" checked={form.lineBlock} onChange={(e) => setForm({ ...form, lineBlock: e.target.checked })} /> Line block
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-ink">
              <input type="checkbox" checked={form.powerIsolation} onChange={(e) => setForm({ ...form, powerIsolation: e.target.checked })} /> Power isolation
            </label>
          </div>
          <label className="block md:col-span-3 xl:col-span-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Note</span>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Scope of work, access constraints, SSE in charge…"
              className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink placeholder:text-faint"
            />
          </label>
          <div className="flex items-end">
            <button onClick={create} disabled={busy !== null} className="btn btn-primary w-full">
              {busy === "create" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Send size={12} aria-hidden />} Raise request
            </button>
          </div>
        </div>
      </section>

      {/* Register */}
      <section className="panel">
        <div className="panel-hd">
          <span>Block request register</span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{requests.length} record(s) · status machine enforced server-side</span>
        </div>
        <div className="gov-table-wrap max-h-[36rem]">
          <table className="gov-table">
            <thead>
              <tr>
                <th className="sr">Sr</th>
                <th>Reference</th>
                <th>Dept</th>
                <th>Section</th>
                <th className="num">Duration</th>
                <th>Window requested</th>
                <th>Priority</th>
                <th>Flags</th>
                <th>Status</th>
                <th>Resource / conflict note</th>
                <th>Raised by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id}>
                  <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                  <td className="ref">{r.ref}</td>
                  <td className="text-[11px] font-semibold">{r.department}</td>
                  <td className="font-mono text-[11px]">
                    {r.segmentCode}
                    <span className="mt-0.5 block text-[10px] text-faint">{r.corridor}</span>
                  </td>
                  <td className="num font-mono">{r.durationMin} m</td>
                  <td className="font-mono text-[10.5px]">
                    D{r.requestedDay + 1} {fmt(r.requestedStart)}–{fmt(r.requestedEnd)}
                  </td>
                  <td className="text-[10.5px]">{r.priority}</td>
                  <td className="text-[10px] text-dim">
                    {r.lineBlock ? "LINE" : "—"}
                    {r.powerIsolation ? " · POWER" : ""}
                    {r.crewRequired > 1 ? ` · ×${r.crewRequired} crew` : ""}
                  </td>
                  <td>
                    <StatusPill label={r.statusLabel} tone={STATUS_TONE[r.status]} />
                  </td>
                  <td className="max-w-[22rem] text-[10.5px] text-dim">{r.conflictNote || (r.blockItemId ? `placed in plan #${r.planId} block #${r.blockItemId}` : "—")}</td>
                  <td className="text-[10.5px]">
                    {r.requestedBy}
                    <span className="mt-0.5 block text-[10px] text-faint">{new Date(r.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {r.next.map((n) => (
                        <button key={n} onClick={() => advance(r, n)} disabled={busy !== null} className="btn btn-xs">
                          {busy === r.id ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <Wrench size={10} aria-hidden />} {n.replace(/_/g, " ")}
                        </button>
                      ))}
                      {r.next.length === 0 && <span className="text-[10px] text-faint">terminal</span>}
                    </span>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-[11.5px] text-faint">
                    No block requests on record. Raise the first demand above, or prefill one from a defect in the workbench.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
          Permitted transitions: DRAFT → SUBMITTED → (CONFLICT | OPTIMIZING) → PROPOSED → APPROVED → PUBLISHED → COMPLETED, with REJECTED available to the
          reviewing officer. Moving a request to CONFLICT requires a proven overlap (existing possession or working-timetable path); the API refuses the
          transition and states why if there is none.
        </div>
      </section>
      {pending && <p className="text-[10.5px] text-faint">Refreshing register…</p>}
    </div>
  );
}
