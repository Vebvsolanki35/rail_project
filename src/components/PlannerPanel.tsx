"use client";

/**
 * AI BLOCK PLANNER — WORKFLOW, EXPLAINABILITY AND DECISION CONTROLS
 *
 * Implements the seven-step planning workflow and the human-authority contract
 * required of the planning desk:
 *
 *   1 Select Section → 2 Maintenance Requirements → 3 Analyse Train Operations
 *   → 4 Generate AI Plan → 5 Review Conflicts → 6 Human Approval → 7 Publish
 *
 * Every action button here calls a real endpoint or computes over real plan
 * data. The AI panel always presents its output as a RECOMMENDATION with the
 * evidence behind it, and states plainly who holds the decision:
 * AI Recommendation · Human Review Required · Approval Status · Override
 * Available. Nothing on this component can publish a block on its own.
 */
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  GitCompareArrows,
  Loader2,
  Play,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  XCircle,
} from "lucide-react";
import { fmtMin } from "@/lib/engine/network";
import type { BlockItemDTO, DashboardState, PlanDTO } from "@/lib/engine/types";
import StatusPill from "./StatusPill";

/* ────────────────────────── workflow stepper ────────────────────────── */

export type StepState = "done" | "active" | "pending";
export type WorkflowStep = {
  n: number;
  label: string;
  owner: string;
  state: StepState;
  detail: string;
};

export function WorkflowSteps({ steps, note }: { steps: WorkflowStep[]; note?: string }) {
  const reached = steps.filter((s) => s.state === "done").length;
  return (
    <section className="panel">
      <div className="panel-hd">
        <span>Block planning workflow — seven steps</span>
        <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
          {reached} of {steps.length} steps complete
        </span>
      </div>

      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {steps.map((s, i) => {
          const tone = s.state === "done" ? "success" : s.state === "active" ? "warning" : "neutral";
          return (
            <li
              key={s.n}
              className={`relative flex gap-2 border-b border-edge px-3 py-2.5 sm:border-r lg:last:border-r-0 ${
                s.state === "active" ? "bg-saffron/[0.06]" : s.state === "done" ? "bg-mint/[0.04]" : ""
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border font-mono text-[10px] font-bold ${
                  s.state === "done"
                    ? "border-mint bg-mint text-abyss"
                    : s.state === "active"
                      ? "border-saffron bg-saffron text-abyss"
                      : "border-edge bg-panel text-faint"
                }`}
                aria-hidden
              >
                {s.n}
              </span>
              <div className="min-w-0">
                <p className={`text-[11.5px] font-bold leading-snug ${s.state === "pending" ? "text-dim" : "text-ink"}`}>{s.label}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-faint">{s.owner}</p>
                <p className="mt-1 text-[10.5px] leading-snug text-dim">{s.detail}</p>
                <span className="sr-only">
                  {s.state === "done" ? "completed" : s.state === "active" ? "current step" : "not started"}
                </span>
                {i < steps.length - 1 && <ChevronRight size={11} className="absolute right-1 top-3 hidden text-faint xl:block" aria-hidden />}
              </div>
            </li>
          );
        })}
      </ol>

      {note && <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">{note}</p>}
    </section>
  );
}

/* ─────────────────────── decision / action controls ─────────────────────── */

export function PlanningActions({
  running,
  plan,
  approved,
  vetoed,
  isDrm,
  conflictChecked,
  conflicts,
  busy,
  onAnalyze,
  onGenerate,
  onConflictCheck,
  onCompare,
  onSubmit,
  onApprove,
  onReject,
  onOverride,
}: {
  running: boolean;
  plan: PlanDTO | null;
  approved: boolean;
  vetoed: boolean;
  isDrm: boolean;
  conflictChecked: boolean;
  conflicts: number;
  busy: boolean;
  onAnalyze: () => void;
  onGenerate: () => void;
  onConflictCheck: () => void;
  onCompare: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onOverride: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-hd">
        <span>Planning actions</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill label={approved ? "Approval status: approved" : vetoed ? "Approval status: rejected" : "Approval status: pending"} tone={approved ? "success" : vetoed ? "critical" : "warning"} />
          <StatusPill label={isDrm ? "Override available" : "Override: DRM only"} tone={isDrm ? "info" : "neutral"} />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3">
        <button onClick={onAnalyze} disabled={running} className="btn">
          <Activity size={13} aria-hidden /> Analyze Network
        </button>

        <button onClick={onGenerate} disabled={running} className="btn btn-primary">
          {running ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
          {running ? "Generating plan…" : "Generate AI Plan"}
        </button>

        <button onClick={onConflictCheck} disabled={!plan || running} className="btn">
          <ShieldAlert size={13} aria-hidden /> Run Conflict Check
          {conflictChecked && (
            <span className={`ml-1 font-mono text-[10px] font-bold ${conflicts > 0 ? "text-signal" : "text-mint"}`}>
              {conflicts > 0 ? `${conflicts}` : "clear"}
            </span>
          )}
        </button>

        <button onClick={onCompare} className="btn">
          <GitCompareArrows size={13} aria-hidden /> Compare Plans
        </button>

        <span className="mx-0.5 hidden h-5 border-l border-edge sm:block" aria-hidden />

        <button onClick={onSubmit} disabled={!plan || busy || approved} className="btn">
          <Send size={13} aria-hidden /> Submit for Approval
        </button>

        <button onClick={onApprove} disabled={!plan || busy || approved || !isDrm} className="btn btn-accent" title={isDrm ? "Record your approval" : "Divisional (DRM) authority required"}>
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <BadgeCheck size={13} aria-hidden />} Approve
        </button>

        <button onClick={onReject} disabled={!plan || busy || !isDrm} className="btn btn-danger" title={isDrm ? "Reject the plan" : "Divisional (DRM) authority required"}>
          <XCircle size={13} aria-hidden /> Reject
        </button>

        <button onClick={onOverride} disabled={!plan || busy || !isDrm} className="btn btn-danger" title={isDrm ? "Override the AI recommendation" : "Divisional (DRM) authority required"}>
          <AlertTriangle size={13} aria-hidden /> Override AI Recommendation
        </button>
      </div>

      <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
        Approve, Reject and Override are reserved for the divisional (DRM) desk and are recorded against the plan with the actor, reason and timestamp.
        Every other action is analysis and can be re-run freely.
      </p>
    </section>
  );
}

/* ───────────────────────── AI recommendation panel ───────────────────────── */

export function AiRecommendationPanel({
  plan,
  state,
  conflictChecked,
  conflicts,
  conflictSections,
}: {
  plan: PlanDTO | null;
  state: DashboardState;
  conflictChecked: boolean;
  conflicts: number;
  conflictSections: string[];
}) {
  const blocks = plan?.blocks ?? [];
  const kpis = plan?.kpis ?? {};

  /* The engine's own priority order: super-blocks first, then the occupancy
     that clears the most work for the least delay. */
  const lead: BlockItemDTO | null =
    [...blocks].sort(
      (a, b) => Number(b.isSuperBlock) - Number(a.isSuperBlock) || b.defectCount - a.defectCount || a.delayCostMin - b.delayCostMin
    )[0] ?? null;

  const superBlocks = blocks.filter((b) => b.isSuperBlock);
  const departments = [...new Set(blocks.flatMap((b) => b.departments))];
  const totalTasks = blocks.reduce((n, b) => n + b.defectCount, 0);
  const busiest = [...blocks].sort((a, b) => b.defectCount - a.defectCount)[0] ?? null;

  const reasoning: string[] = [];
  if (lead) {
    reasoning.push(
      `Places ${lead.defectCount} task(s) on ${lead.segmentCode} in the ${lead.window} window (D+${lead.day}, ${fmtMin(lead.startMin)}–${fmtMin(lead.endMin)}) — measured delay cost ${lead.delayCostMin} min.`
    );
    if (lead.rationale) reasoning.push(lead.rationale);
  }
  if (superBlocks.length > 0) {
    reasoning.push(
      `Bundles ${superBlocks.length} multi-department occupancy(ies) so ${departments.join(", ")} share one possession instead of sequential blocks, removing repeated setup.`
    );
  }
  if (typeof kpis.reductionPct === "number") {
    reasoning.push(`Projects ${kpis.reductionPct}% less corridor downtime than the manual baseline for this queue.`);
  }
  if (typeof kpis.avgDelayMin === "number") {
    reasoning.push(`Average delay carried by affected trains: ${Number(kpis.avgDelayMin).toFixed(1)} min per train.`);
  }
  if (conflictChecked) {
    reasoning.push(
      conflicts > 0
        ? `Conflict check measured ${conflicts} same-section overlap(s)${conflictSections.length ? ` (${conflictSections.slice(0, 3).join(", ")})` : ""} — resolve before approval.`
        : "Conflict check measured no same-section overlap in this plan."
    );
  }
  if (state.overrun) {
    reasoning.push(`A live overrun risk is open on job #${state.overrun.jobId} (${state.overrun.segCode}) at ${state.overrun.probability.toFixed(0)}% — the next version should absorb it.`);
  }

  return (
    <section className="panel">
      <div className="panel-hd">
        <span className="flex items-center gap-2">
          <Bot size={13} className="text-violet" aria-hidden /> AI recommendation — block plan
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill label="AI recommendation" tone="ai" />
          <StatusPill label="Human review required" tone="warning" />
        </span>
      </div>

      {!plan ? (
        <p className="p-4 text-[12px] leading-relaxed text-dim">
          No plan has been generated for the current defect queue. Run <strong className="text-ink">Analyze Network</strong> then{" "}
          <strong className="text-ink">Generate AI Plan</strong>; the recommendation will appear here with its reasoning, expected train impact and
          conflict assessment — and will still require divisional approval before any occupancy is issued.
        </p>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Evidence */}
          <div className="border-b border-edge p-3 lg:border-b-0 lg:border-r">
            <dl className="kv sm:grid-cols-2">
              <dt>Recommended block window</dt>
              <dd className="font-mono">
                {lead ? `D+${lead.day} · ${fmtMin(lead.startMin)}–${fmtMin(lead.endMin)} · ${lead.window}` : "—"}
              </dd>
              <dt>Section</dt>
              <dd className="font-mono">{lead ? `${lead.segmentCode} (${lead.corridor})` : "—"}</dd>
              <dt>Expected train impact</dt>
              <dd>
                {typeof kpis.avgDelayMin === "number" ? `${Number(kpis.avgDelayMin).toFixed(1)} min average delay per affected train` : "not modelled"}
                {typeof kpis.delayCostMin === "number" && ` · ${Number(kpis.delayCostMin).toLocaleString("en-IN")} delay-minutes in total`}
              </dd>
              <dt>Maintenance opportunity</dt>
              <dd>
                {totalTasks} task(s) across {blocks.length} occupancy(ies) · {departments.length} discipline(s)
                {busiest && ` · heaviest: ${busiest.segmentCode} (${busiest.defectCount} task(s))`}
              </dd>
              <dt>Conflict risk</dt>
              <dd>
                {conflictChecked ? (
                  conflicts > 0 ? (
                    <span className="font-semibold text-signal">{conflicts} same-section overlap(s) measured</span>
                  ) : (
                    <span className="font-semibold text-mint">no same-section overlap measured</span>
                  )
                ) : (
                  <span className="text-faint">not assessed — run the conflict check</span>
                )}
              </dd>
              <dt>Plan confidence</dt>
              <dd>
                Resilience {Math.round(plan.resilienceScore)}/100
                {typeof kpis.availabilityPct === "number" && ` · availability ${kpis.availabilityPct}%`}
                {typeof kpis.qualityScore === "number" && ` · quality ${kpis.qualityScore}/100`}
              </dd>
            </dl>

            <div className="mt-3 border border-violet/25 bg-violet/[0.04] p-2.5">
              <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-violet">
                <TrendingDown size={12} aria-hidden /> Why the engine recommends this
              </p>
              <ul className="mt-1.5 space-y-1">
                {reasoning.slice(0, 6).map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink">
                    <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-violet" aria-hidden />
                    <span>{r}</span>
                  </li>
                ))}
                {reasoning.length === 0 && <li className="text-[11px] text-dim">Run the optimiser to produce reasoning for this queue.</li>}
              </ul>
            </div>
          </div>

          {/* Authority panel */}
          <aside className="bg-abyss/40 p-3">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint">Decision authority</p>
            <ul className="mt-2 space-y-2.5">
              <AuthorityRow
                icon={<Bot size={13} className="text-violet" aria-hidden />}
                title="AI recommendation"
                body="Advisory output of the optimiser. It has no authority to publish occupancy."
              />
              <AuthorityRow
                icon={<ShieldCheck size={13} className="text-saffron" aria-hidden />}
                title="Human review required"
                body="A divisional officer must accept, amend or reject the recommendation before publication."
              />
              <AuthorityRow
                icon={<BadgeCheck size={13} className="text-mint" aria-hidden />}
                title="Approval status"
                body={
                  state.settings.planStatus === "APPROVED"
                    ? "Approved by the DRM. Occupancies are published to the field and station desks."
                    : state.settings.planStatus === "VETOED"
                      ? "Rejected by the DRM. Publication is withheld; re-plan with the recorded reason."
                      : "Pending. Awaiting the divisional decision."
                }
              />
              <AuthorityRow
                icon={<CalendarClock size={13} className="text-primary" aria-hidden />}
                title="Override available"
                body="The officer may override any recommendation; the reason is written to the audit trail with the actor and timestamp."
              />
            </ul>

            <div className="mt-3 flex items-center gap-1.5 border-t border-edge pt-2.5 text-[10.5px] text-faint">
              <Scale size={12} aria-hidden />
              AI recommends · officer decides · system records.
            </div>
          </aside>
        </div>
      )}

      <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
        Impact, cost and risk figures are model estimates produced by the optimiser over the current defect queue (cost model under Administration →
        Configuration). They are advisory inputs to the officer&apos;s decision, not operational instructions.
      </p>
    </section>
  );
}

function AuthorityRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border border-edge bg-panel">{icon}</span>
      <span>
        <span className="block text-[11.5px] font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-snug text-dim">{body}</span>
      </span>
    </li>
  );
}

/** Overlap detection over the plan itself (same section, same day, intersecting windows). */
export function detectConflicts(blocks: BlockItemDTO[]) {
  const bySection = new Map<number, BlockItemDTO[]>();
  for (const b of blocks) {
    const list = bySection.get(b.segmentId) ?? [];
    list.push(b);
    bySection.set(b.segmentId, list);
  }
  const out: { section: string; day: number; a: BlockItemDTO; b: BlockItemDTO; minutes: number }[] = [];
  for (const list of bySection.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const c = list[j];
        if (a.day === c.day && a.startMin < c.endMin && c.startMin < a.endMin) {
          out.push({ section: a.segmentCode, day: a.day, a, b: c, minutes: Math.min(a.endMin, c.endMin) - Math.max(a.startMin, c.startMin) });
        }
      }
    }
  }
  return out;
}
