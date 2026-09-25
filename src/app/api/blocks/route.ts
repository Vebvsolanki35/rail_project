import { NextResponse } from "next/server";
import { db } from "@/db";
import { defects, segments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeeded } from "@/lib/engine/seed";
import { advanceRequest, createRequest, competingDemand, listRequests, requestDraftFromDefect, requestSummary, REQUEST_STATUSES } from "@/lib/engine/blockrequests";

export const dynamic = "force-dynamic";

/**
 * GET /api/blocks                     — the block request register + summary
 * GET /api/blocks?defectId=12         — a prefilled request draft from a defect
 * GET /api/blocks?id=4                — one request
 */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const url = new URL(req.url);
    const defectId = url.searchParams.get("defectId");
    if (defectId) return NextResponse.json({ draft: await requestDraftFromDefect(Number(defectId)) });
    const id = url.searchParams.get("id");
    if (id) {
      const rows = await listRequests();
      return NextResponse.json({ request: rows.find((r) => r.id === Number(id)) ?? null });
    }
    const [requests, summary, demand] = await Promise.all([
      listRequests({ status: url.searchParams.get("status") ?? undefined, department: url.searchParams.get("department") ?? undefined }),
      requestSummary(),
      competingDemand(),
    ]);
    return NextResponse.json({ statuses: REQUEST_STATUSES, requests, summary, competingDemand: demand });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/**
 * POST /api/blocks  { action: "create" | "advance", ... }
 * create:  { department, segmentId, defectId?, durationMin, priority?, powerIsolation?, lineBlock?, requestedStart?, requestedEnd?, note?, actorName?, actorRole? }
 * advance: { id, to, actorName, actorRole, reason? }
 */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "create");
    if (action === "advance") {
      const result = await advanceRequest({
        id: Number(body.id),
        to: String(body.to) as (typeof REQUEST_STATUSES)[number],
        actorName: String(body.actorName ?? "Control Office"),
        actorRole: String(body.actorRole ?? "CONTROL"),
        reason: body.reason ? String(body.reason) : undefined,
      });
      return NextResponse.json(result);
    }
    /* Validate the referenced entities before writing: a block request that names
       a section or defect that does not exist must be refused with a readable
       message, not fail later with a database error. */
    const segmentId = Number(body.segmentId);
    const defectId = body.defectId ? Number(body.defectId) : undefined;
    if (!Number.isFinite(segmentId))
      return NextResponse.json({ error: "segmentId is required — build the request from a defect (GET /api/blocks?defectId=) or pick a section" }, { status: 400 });
    if (defectId !== undefined && !(await db.select({ id: defects.id }).from(defects).where(eq(defects.id, defectId))).length)
      return NextResponse.json({ error: `defect ${defectId} not found — refresh the register before raising a block request` }, { status: 404 });
    if (!(await db.select({ id: segments.id }).from(segments).where(eq(segments.id, segmentId))).length)
      return NextResponse.json({ error: `section ${segmentId} not found` }, { status: 404 });

    const result = await createRequest({
      department: String(body.department ?? "ENG"),
      segmentId,
      defectId,
      assetId: body.assetId ? Number(body.assetId) : undefined,
      durationMin: Number(body.durationMin ?? 60),
      priority: body.priority ? String(body.priority) : undefined,
      resources: Array.isArray(body.resources) ? (body.resources as string[]) : undefined,
      crewRequired: body.crewRequired ? Number(body.crewRequired) : undefined,
      machineRequired: body.machineRequired ? String(body.machineRequired) : undefined,
      powerIsolation: !!body.powerIsolation,
      lineBlock: body.lineBlock === undefined ? true : !!body.lineBlock,
      requestedDay: body.requestedDay ? Number(body.requestedDay) : undefined,
      requestedStart: body.requestedStart ? Number(body.requestedStart) : undefined,
      requestedEnd: body.requestedEnd ? Number(body.requestedEnd) : undefined,
      note: body.note ? String(body.note) : undefined,
      actorName: body.actorName ? String(body.actorName) : undefined,
      actorRole: body.actorRole ? String(body.actorRole) : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
