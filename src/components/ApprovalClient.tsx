"use client";

/**
 * APPROVAL WORKFLOW & DIGITAL BLOCK AUTHORIZATION — desk (Phases 13–14).
 *
 * Authority is enforced by the server, not by this screen: the buttons offered
 * here are only the actions the current stage's roles permit, and a refused
 * action returns the named authority the stage requires.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Check, Download, FileText, Loader2, PencilLine, Printer, RefreshCw, ShieldAlert, Stamp } from "lucide-react";
import StatusPill from "./StatusPill";
import type { ApprovalBoard, ApprovalStageState } from "@/lib/engine/approvals";
import type { AuthorizationDTO } from "@/lib/engine/authorization";

const STAGE_TONE: Record<ApprovalStageState["state"], "success" | "warning" | "critical" | "neutral" | "ai"> = {
  DONE: "success",
  ACTIVE: "warning",
  PENDING: "neutral",
  BLOCKED: "neutral",
  REJECTED: "critical",
};

export default function ApprovalClient({
  board: initialBoard,
  authorizations,
  summary,
  canIssue,
}: {
  board: ApprovalBoard;
  authorizations: AuthorizationDTO[];
  summary: { total: number; issued: number; active: number; completed: number; tasks: number; combined: number };
  canIssue: boolean;
}) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [auths, setAuths] = useState(authorizations);
  const [role, setRole] = useState<"DRM" | "CONTROL" | "INSPECTOR">("CONTROL");
  const [reason, setReason] = useState("");
  const [blockItemId, setBlockItemId] = useState<number | "">("");
  const [newStart, setNewStart] = useState<number | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [openDoc, setOpenDoc] = useState<number | null>(summary.total ? null : null);
  const [exportSlip, setExportSlip] = useState<AuthorizationDTO | null>(null);
  const [, startTransition] = useTransition();

  const actorName = role === "DRM" ? "Divisional Railway Manager" : role === "CONTROL" ? "Section Controller (on duty)" : "Sr. Section Engineer (Inspector)";

  async function act(action: string) {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          actorName,
          actorRole: role,
          reason: reason || undefined,
          blockItemId: action === "MODIFIED" && blockItemId !== "" ? Number(blockItemId) : undefined,
          newStartMin: action === "MODIFIED" && newStart !== "" ? Number(newStart) : undefined,
        }),
      });
      const json = (await res.json()) as { error?: string; board?: ApprovalBoard; message?: string };
      if (json.error) setMessage({ text: json.error, ok: false });
      else {
        if (json.board) setBoard(json.board);
        setMessage({ text: json.message ?? `${action} recorded at stage ${board.currentStage} by ${actorName} (${role}).`, ok: true });
        setReason("");
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  async function issue(blockItemIdToUse: number) {
    setBusy(`AUTH-${blockItemIdToUse}`);
    setMessage(null);
    try {
      const res = await fetch("/api/authorization", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blockItemId: blockItemIdToUse, actorName: "Control Office", actorRole: "CONTROL" }),
      });
      const json = (await res.json()) as { error?: string; authorization?: AuthorizationDTO };
      if (json.error) setMessage({ text: json.error, ok: false });
      else {
        setMessage({ text: `${json.authorization?.ref} issued for ${json.authorization?.section} (${json.authorization?.windowLabel}) with ${json.authorization?.tasks.length} task(s) and ${json.authorization?.safetyRequirements.length} safety requirement(s).`, ok: true });
        const fresh = (await fetch("/api/authorization", { cache: "no-store" }).then((r) => r.json())) as { authorizations: AuthorizationDTO[] };
        setAuths(fresh.authorizations ?? auths);
        setOpenDoc(json.authorization?.id ?? null);
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(null);
    }
  }

  function printAuth(a: AuthorizationDTO) {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      setExportSlip(a);
      return;
    }
    w.document.write(`<!doctype html><html><head><title>${a.ref}</title><style>
      body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;margin:28px;color:#111}
      h1{font-size:15px;margin:0 0 2px} .sub{font-size:11px;color:#444;margin-bottom:14px}
      pre{white-space:pre-wrap;border-top:1px solid #999;border-bottom:1px solid #999;padding:12px 0}
      .foot{margin-top:18px;font-size:10.5px;color:#555}
    </style></head><body>
      <h1>RAIL RAKSHAK — DIVISIONAL BLOCK AUTHORIZATION</h1>
      <div class="sub">Reference ${a.ref} · issued ${new Date(a.issuedAt).toLocaleString("en-IN")} · ${a.status} · ${a.issuedBy} (${a.issuedRole})</div>
      <pre>${a.body.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string)}</pre>
      <div class="foot">Prototype document generated by RAIL RAKSHAK (AI-powered railway operations &amp; maintenance). Not a statutory authority; the divisional block register remains the legal record.</div>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const current = board.stages.find((s) => s.stage === board.currentStage);
  const mayAct = current?.roles.includes(role) ?? false;

  return (
    <div className="space-y-3">
      {message && (
        <div className={`flex items-start gap-2 border px-3 py-2 ${message.ok ? "border-mint/40 bg-mint/[0.06]" : "border-signal/40 bg-signal/[0.06]"}`}>
          {message.ok ? <Check size={13} className="mt-0.5 shrink-0 text-mint" aria-hidden /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-signal" aria-hidden />}
          <p className="text-[11.5px] leading-relaxed text-ink">{message.text}</p>
        </div>
      )}

      {/* Approval chain */}
      <section className="panel">
        <div className="panel-hd">
          <span>Approval chain — plan #{board.planId ?? "—"} &quot;{board.planName}&quot;</span>
          <span className="flex items-center gap-1.5">
            <StatusPill label={`PLAN ${board.planStatus}`} tone={board.planStatus === "APPROVED" ? "success" : board.planStatus === "REJECTED" ? "critical" : "warning"} />
            {board.emergency && <StatusPill label="EMERGENCY OVERRIDE USED" tone="critical" />}
          </span>
        </div>

        <ol className="grid gap-0 p-0 lg:grid-cols-5">
          {board.stages.map((s, i) => (
            <li key={s.stage} className={`border-b border-edge p-3 lg:border-b-0 lg:border-r ${i === 4 ? "lg:border-r-0" : ""} ${s.state === "ACTIVE" ? "bg-saffron/[0.07]" : s.state === "DONE" ? "bg-mint/[0.05]" : s.state === "REJECTED" ? "bg-signal/[0.06]" : ""}`}>
              <p className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-faint">STEP {i + 1}</span>
                <StatusPill label={s.state} tone={STAGE_TONE[s.state]} />
              </p>
              <p className="mt-1.5 text-[12px] font-bold text-ink">{s.label}</p>
              <p className="text-[10.5px] text-dim">{s.actor}</p>
              <p className="mt-1 font-mono text-[10px] text-faint">
                {s.roles.length ? `authority: ${s.roles.join(", ")}` : "system step — no human action"}
              </p>
              {s.action && (
                <p className="mt-1.5 border-t border-edge pt-1.5 text-[10.5px] text-ink">
                  <span className="font-semibold">{s.action}</span> by {s.actorName} ({s.actorRole})
                  <span className="mt-0.5 block font-mono text-[10px] text-faint">
                    {s.at ? new Date(s.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : ""}
                  </span>
                  {s.reason && <span className="mt-0.5 block text-[10.5px] text-dim">“{s.reason}”</span>}
                </p>
              )}
            </li>
          ))}
        </ol>

        {/* Action bar */}
        <div className="border-t border-edge p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Acting as</span>
              <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="mt-1 border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink">
                <option value="CONTROL">CONTROL — Section Controller / review desk</option>
                <option value="DRM">DRM — Divisional Railway Manager</option>
                <option value="INSPECTOR">INSPECTOR — Sr. Section Engineer</option>
              </select>
            </label>
            <label className="block min-w-[16rem] flex-1">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Reason / remarks (mandatory for reject, override, re-plan)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Section controller wishes to shift block 12 clear of the 06:40 passenger" className="mt-1 w-full border border-edge bg-hull px-2 py-1.5 text-[11.5px] text-ink placeholder:text-faint" />
            </label>
            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Modify → block #</span>
              <input type="number" value={blockItemId} onChange={(e) => setBlockItemId(e.target.value === "" ? "" : Number(e.target.value))} className="mt-1 w-24 border border-edge bg-hull px-2 py-1.5 font-mono text-[11.5px] text-ink" />
            </label>
            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">New start (min)</span>
              <input type="number" value={newStart} onChange={(e) => setNewStart(e.target.value === "" ? "" : Number(e.target.value))} className="mt-1 w-28 border border-edge bg-hull px-2 py-1.5 font-mono text-[11.5px] text-ink" />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button onClick={() => act("APPROVED")} disabled={busy !== null} className="btn btn-primary btn-xs">
              {busy === "APPROVED" ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Check size={11} aria-hidden />} Approve at {current?.label}
            </button>
            <button onClick={() => act("MODIFIED")} disabled={busy !== null} className="btn btn-xs">
              {busy === "MODIFIED" ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <PencilLine size={11} aria-hidden />} Modify window
            </button>
            <button onClick={() => act("REJECTED")} disabled={busy !== null} className="btn btn-xs">
              <Ban size={11} aria-hidden /> Reject
            </button>
            <button onClick={() => act("REPLAN_REQUESTED")} disabled={busy !== null} className="btn btn-xs">
              {busy === "REPLAN_REQUESTED" ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <RefreshCw size={11} aria-hidden />} Request re-plan
            </button>
            <button onClick={() => act("EMERGENCY_OVERRIDE")} disabled={busy !== null} className="btn btn-xs">
              <ShieldAlert size={11} aria-hidden /> Emergency override (DRM)
            </button>
            <span className={`ml-auto text-[10.5px] ${mayAct ? "text-mint" : "text-dim"}`}>
              {current?.roles.length
                ? mayAct
                  ? `${role} may action ${current.label}`
                  : `${current.label} is reserved for ${current.roles.join(", ")} — acting as ${role} will be refused by the server`
                : "the current step is a system step"}
            </span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
            The plan&apos;s global status only advances once the DRM stage records an approval — a technical review or controller sign-off cannot publish a plan.
            Every action here is written to the audit trail with actor, role, timestamp, old value, new value and reason.
          </p>
        </div>
      </section>

      {/* Authorization register */}
      <section className="panel">
        <div className="panel-hd">
          <span className="flex items-center gap-2">
            <Stamp size={13} aria-hidden /> Digital block authorizations
          </span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
            {summary.total} issued · {summary.tasks} task(s) · {summary.combined} combined possession(s)
          </span>
        </div>

        {/* Blocks available to authorize from the current plan */}
        <div className="border-b border-edge px-3 py-2">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Authorize a block from plan #{board.planId ?? "—"}</p>
          {board.planStatus === "APPROVED" ? (
            <p className="mt-1 text-[11px] text-mint">Plan is DRM-approved — block authorizations may be issued.</p>
          ) : (
            <p className="mt-1 text-[11px] text-signal">
              Authorization is refused until the DRM stage records approval (current status {board.planStatus}, current stage {current?.label}). Enter the block number
              below and the API will state the refusal.
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Block item id</span>
              <input type="number" value={blockItemId} onChange={(e) => setBlockItemId(e.target.value === "" ? "" : Number(e.target.value))} className="mt-1 w-28 border border-edge bg-hull px-2 py-1.5 font-mono text-[11.5px] text-ink" />
            </label>
            <button onClick={() => blockItemId !== "" && issue(Number(blockItemId))} disabled={blockItemId === "" || busy !== null} className="btn btn-xs">
              {busy === `AUTH-${blockItemId}` ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <FileText size={11} aria-hidden />} Issue authorization
            </button>
            {!canIssue && <span className="text-[10.5px] text-dim">Issue is available to the Control Office after DRM approval.</span>}
          </div>
        </div>

        <div className="gov-table-wrap max-h-[32rem]">
          <table className="gov-table">
            <thead>
              <tr>
                <th className="sr">Sr</th>
                <th>Reference</th>
                <th>Section</th>
                <th>Window</th>
                <th>Departments</th>
                <th className="num">Tasks</th>
                <th className="num">Safety reqs</th>
                <th>Status</th>
                <th>Issued by</th>
                <th>Issued (IST)</th>
                <th>Document</th>
              </tr>
            </thead>
            <tbody>
              {auths.map((a, i) => (
                <tr key={a.id}>
                  <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                  <td className="ref">{a.ref}</td>
                  <td className="font-mono text-[11px]">{a.windowLabel}</td>
                  <td className="font-mono text-[10.5px]">{a.corridor}</td>
                  <td className="text-[10.5px]">{a.departments.join(" + ")}</td>
                  <td className="num font-mono">{a.tasks.length}</td>
                  <td className="num font-mono">{a.safetyRequirements.length}</td>
                  <td>
                    <StatusPill label={a.status} tone={a.status === "ISSUED" ? "info" : a.status === "ACTIVE" ? "warning" : a.status === "COMPLETED" ? "success" : "critical"} />
                  </td>
                  <td className="text-[10.5px]">
                    {a.issuedBy}
                    <span className="mt-0.5 block text-[10px] text-faint">{a.issuedRole}</span>
                  </td>
                  <td className="whitespace-nowrap font-mono text-[10px]">
                    {new Date(a.issuedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </td>
                  <td>
                    <span className="flex gap-1">
                      <button onClick={() => setOpenDoc(openDoc === a.id ? null : a.id)} className="btn btn-xs">
                        {openDoc === a.id ? "Hide" : "View"}
                      </button>
                      <button onClick={() => printAuth(a)} className="btn btn-xs">
                        <Printer size={10} aria-hidden /> Print
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {auths.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-[11.5px] text-faint">
                    No block authorization issued yet. The DRM must approve the plan first, then the Control Office issues the authority for each block.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {openDoc !== null && auths.find((a) => a.id === openDoc) && (
          <div className="border-t border-edge">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-faint">Authority document — {auths.find((a) => a.id === openDoc)?.ref}</span>
              <button onClick={() => printAuth(auths.find((a) => a.id === openDoc)!)} className="btn btn-xs">
                <Download size={10} aria-hidden /> Print / save as PDF
              </button>
            </div>
            <pre className="max-h-[28rem] overflow-auto border-t border-edge bg-abyss px-3 py-2 font-mono text-[10.5px] leading-relaxed text-ink">
              {auths.find((a) => a.id === openDoc)?.body}
            </pre>
            <div className="border-t border-edge px-3 py-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Approval chain as recorded on the authorization</p>
              <ol className="mt-1 space-y-0.5">
                {auths
                  .find((a) => a.id === openDoc)
                  ?.approvalChain.map((c) => (
                    <li key={`${c.stage}-${c.at}`} className="font-mono text-[10.5px] text-dim">
                      {c.stage} — {c.action} by {c.actorName} ({c.actorRole}) at{" "}
                      {new Date(c.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </li>
                  ))}
              </ol>
            </div>
          </div>
        )}
      </section>

      {exportSlip && (
        <div className="border border-saffron/40 bg-saffron/[0.06] px-3 py-2 text-[11px] text-ink">
          Pop-up blocked — use the document pane above and your browser&apos;s print command to produce {exportSlip.ref}.
        </div>
      )}

      {/* Action history */}
      <section className="panel">
        <div className="panel-hd">
          <span>Recorded approval actions</span>
          <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{board.history.length} entry(ies) for this plan</span>
        </div>
        <ul className="divide-y divide-edge">
          {board.history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-start gap-2 px-3 py-2">
              <span className="font-mono text-[10.5px] text-faint">
                {new Date(h.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
              </span>
              <StatusPill label={h.stage.replace(/_/g, " ")} tone="info" />
              <span className="text-[11px] font-semibold text-ink">{h.action}</span>
              <span className="text-[11px] text-dim">
                {h.actorName} ({h.actorRole})
              </span>
              {h.reason && <span className="w-full text-[10.5px] text-dim">Reason: {h.reason}</span>}
              {(h.oldValue || h.newValue) && (
                <span className="w-full font-mono text-[10px] text-faint">
                  {h.oldValue ? `old ${JSON.stringify(h.oldValue)}` : ""} {h.newValue ? `→ new ${JSON.stringify(h.newValue)}` : ""}
                </span>
              )}
            </li>
          ))}
          {board.history.length === 0 && <li className="p-4 text-center text-[11.5px] text-faint">No approval action recorded on this plan yet.</li>}
        </ul>
      </section>
    </div>
  );
}
