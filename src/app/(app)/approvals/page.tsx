import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import PageHeader from "@/components/PageHeader";
import ApprovalClient from "@/components/ApprovalClient";
import { approvalBoard } from "@/lib/engine/approvals";
import { authorizationSummary, listAuthorizations } from "@/lib/engine/authorization";

export const dynamic = "force-dynamic";

/**
 * APPROVAL WORKFLOW + DIGITAL BLOCK AUTHORIZATION (Phases 13–14).
 */
export default async function ApprovalsPage() {
  const [board, auths, summary] = await Promise.all([approvalBoard(), listAuthorizations(60), authorizationSummary()]);
  const pending = board.stages.filter((s) => s.state === "ACTIVE" || s.state === "PENDING").length;

  return (
    <RoleGate title="Approval Workflow & Block Authorizations">
      <div className="space-y-3">
        <PageHeader
          module="ADM-APR"
          title="Approval Workflow & Block Authorizations"
          titleKey="page.approvals"
          subtitleKey="page.approvals.sub"
          subtitle="No AI-generated plan becomes a working possession on its own. It moves through technical review, the section controller and the DRM, and each sign-off is recorded with actor, role, time and remarks. Once the plan is approved, the Control Office issues a numbered block authorization carrying the window, departments, tasks, safety requirements and the approval chain."
          crumbs={[{ label: "Administration" }, { label: "Approval Workflow" }]}
          state={
            board.planStatus === "PUBLISHED"
              ? `Plan #${board.planId} published — authorizations may be issued`
              : board.planStatus === "APPROVED"
                ? `Plan #${board.planId} approved by DRM — ready to publish`
                : `${pending} step(s) remaining in the approval chain`
          }
          stateTone={board.planStatus === "PUBLISHED" ? "success" : board.planStatus === "APPROVED" ? "info" : "warning"}
          reference={`Current stage ${board.stages.find((s) => s.stage === board.currentStage)?.label ?? "—"} · ${summary.total} authorization(s) issued · ${summary.tasks} task(s) under authority`}
          actions={
            <>
              <Link href="/planner" className="btn btn-xs">
                Planner
              </Link>
              <Link href="/audit" className="btn btn-xs">
                Audit trail
              </Link>
            </>
          }
        />

        <ApprovalClient board={board} authorizations={auths} summary={summary} canIssue />

        <p className="text-[10.5px] leading-relaxed text-faint">
          The authorization document is compiled from the block itself: section and chainage, the possession window, the departmental tasks with their durations,
          the safety requirements derived from the work (power isolation, earthed OHE, look-out men, speed restrictions on hand-back, and so on) and the recorded
          approval chain. It is a prototype record generated from the live plan — the divisional block register remains the statutory authority.
        </p>
      </div>
    </RoleGate>
  );
}
