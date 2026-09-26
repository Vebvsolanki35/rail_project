import { NextResponse } from "next/server";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeeded } from "@/lib/engine/seed";
import { APPROVAL_ACTIONS, APPROVAL_STAGES, approvalBoard, recordApproval, STAGE_META, type ApprovalAction } from "@/lib/engine/approvals";

export const dynamic = "force-dynamic";

/** GET /api/approvals?planId=3 — the approval chain + every recorded action. */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const planId = new URL(req.url).searchParams.get("planId");
    return NextResponse.json({
      stages: APPROVAL_STAGES.map((s) => ({ stage: s, ...STAGE_META[s] })),
      actions: APPROVAL_ACTIONS,
      board: await approvalBoard(planId ? Number(planId) : undefined),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/**
 * POST /api/approvals { action, actorName, actorRole, reason?, planId?, blockItemId?, newStartMin?, newEndMin?, newDay? }
 * Authority is enforced server-side by stage.
 */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action) as ApprovalAction;
    if (!APPROVAL_ACTIONS.includes(action)) return NextResponse.json({ error: `action must be one of ${APPROVAL_ACTIONS.join(", ")}` }, { status: 400 });
    /* Every approval is a human decision: the officer must be named, and the plan
       being acted on must exist (a stale tab must not approve a deleted plan). */
    const actorName = String(body.actorName ?? "").trim();
    const actorRole = String(body.actorRole ?? "").trim();
    if (!actorName || !actorRole)
      return NextResponse.json({ error: "actorName and actorRole are required — an approval must name the officer who made it" }, { status: 400 });
    if (body.planId !== undefined && body.planId !== null) {
      const planId = Number(body.planId);
      const [exists] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, planId));
      if (!exists) return NextResponse.json({ error: `plan ${body.planId} not found — reload the approval board` }, { status: 404 });
    }
    const result = await recordApproval({
      planId: body.planId ? Number(body.planId) : undefined,
      action,
      actorName,
      actorRole,
      reason: body.reason ? String(body.reason) : undefined,
      blockItemId: body.blockItemId ? Number(body.blockItemId) : undefined,
      newStartMin: body.newStartMin !== undefined ? Number(body.newStartMin) : undefined,
      newEndMin: body.newEndMin !== undefined ? Number(body.newEndMin) : undefined,
      newDay: body.newDay !== undefined ? Number(body.newDay) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: /not found/.test(message) ? 404 : 400 });
  }
}
