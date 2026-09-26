/**
 * DIGITAL BLOCK AUTHORIZATION (Phase 14).
 *
 * A formal block authorization is generated from an APPROVED plan block: the
 * reference number, section, window, departments, tasks, safety requirements
 * and the full approval chain that authorised it. The document body is compiled
 * text (printable / exportable) — the same register an SSE would carry to site.
 *
 * Generation is REFUSED unless the plan's approval chain has reached the DRM
 * stage, so a document can never exist without the authority behind it.
 */
import { db } from "@/db";
import { assets, blockAuthorizations, blockItems, defects, plans, segments } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { approvalBoard, latestPlanRow } from "./approvals";
import { recordAudit } from "./audittrail";
import { SETUP_MIN } from "./superblock";

export interface AuthorizationDTO {
  id: number;
  ref: string;
  planId: number;
  planName: string;
  blockItemId: number;
  section: string;
  corridor: string;
  windowLabel: string;
  day: number;
  startMin: number;
  endMin: number;
  durationMin: number;
  departments: string[];
  tasks: { defectCode: string; title: string; department: string; durationMin: number; chainage?: string }[];
  safetyRequirements: string[];
  approvalChain: { stage: string; actorName: string; actorRole: string; action: string; at: string }[];
  status: string;
  issuedBy: string;
  issuedRole: string;
  body: string;
  issuedAt: string;
  completedAt: string | null;
}

function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function toDTO(r: typeof blockAuthorizations.$inferSelect, planName: string, corridor: string, chain: AuthorizationDTO["approvalChain"]): AuthorizationDTO {
  return {
    id: r.id,
    ref: r.ref,
    planId: r.planId,
    planName,
    blockItemId: r.blockItemId,
    section: r.windowLabel.split(" · ")[0] || r.windowLabel,
    corridor,
    windowLabel: r.windowLabel,
    day: 0,
    startMin: 0,
    endMin: 0,
    durationMin: 0,
    departments: r.departments,
    tasks: r.tasks.map((t) => ({ ...t, chainage: t.chainage ?? "—" })),
    safetyRequirements: r.safetyRequirements,
    approvalChain: r.approvalChain.length ? r.approvalChain : chain,
    status: r.status,
    issuedBy: r.issuedBy,
    issuedRole: r.issuedRole,
    body: r.body,
    issuedAt: r.issuedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

/** Safety requirements are derived from the work itself, never a fixed list. */
export function safetyRequirements(input: {
  departments: string[];
  needsPower: boolean;
  isBridge: boolean;
  isLevelCrossing: boolean;
  fogMode: boolean;
  rainMm?: number;
  worksAtNight: boolean;
}): string[] {
  const out: string[] = [];
  if (input.needsPower) {
    out.push("Power block sanction from Traction Power Controller (TPC) before OHE approach");
    out.push("Earthing of OHE at both ends + short-circuiting straps applied and recorded");
  }
  if (input.departments.includes("TRD")) out.push("Tower wagon with certified OHE staff; minimum 4-person crew");
  if (input.departments.includes("ENG")) out.push("Protection: 3 detonators at 600 m and 1200 m, banner flags, look-out man posted");
  if (input.departments.includes("SNT")) out.push("Signal interlocking: points clamped and padlocked; control advised before TC disconnection");
  if (input.isBridge) out.push("Bridge Engineer (Bridges) clearance attached — Yamuna Bridge SOP-7 applies; equipment tethered");
  if (input.isLevelCrossing) out.push("Level crossing gate protection with gate lamps and TVU/CCTV if busy; DTP red zone respected");
  if (input.worksAtNight) out.push("Night working: portable flood lighting, reflective jackets, head-count board at gate");
  if (input.fogMode) out.push("Fog Mode: physical-only work restricted; if unavoidable, visibility monitoring + extra look-out at 500 m");
  if ((input.rainMm ?? 0) > 0) out.push("Wet weather: earthing checks doubled; ballast/CWR activities rescheduled");
  out.push("Site register signed by SSE in charge; completion reported to Section Controller for sanction of 'block complete'");
  return out;
}

/** Continue the year's authorization series (see nextRef in blockrequests.ts). */
export async function nextAuthRef(): Promise<string> {
  const year = new Date().getFullYear();
  const [{ maxRef }] = await db
    .select({ maxRef: sql<string | null>`max(${blockAuthorizations.ref})` })
    .from(blockAuthorizations)
    .where(sql`${blockAuthorizations.ref} like ${`RR/AUTH/${year}/%`}`);
  const n = maxRef ? Number(maxRef.slice(maxRef.lastIndexOf("/") + 1)) : 0;
  return `RR/AUTH/${year}/${String(n + 1).padStart(4, "0")}`;
}

/**
 * Issue an authorization for one block of the latest plan.
 * Refused unless the DRM has approved (or an emergency override is on record).
 */
export async function issueAuthorization(input: { blockItemId: number; actorName: string; actorRole: string; fogMode?: boolean; rainMm?: number }) {
  const [item] = await db.select().from(blockItems).where(eq(blockItems.id, input.blockItemId));
  if (!item) throw new Error(`block item ${input.blockItemId} not found`);
  const [plan] = await db.select().from(plans).where(eq(plans.id, item.planId));
  if (!plan) throw new Error(`plan ${item.planId} not found`);

  const board = await approvalBoard(plan.id);
  const drmDone = board.stages.find((s) => s.stage === "DRM")?.state === "DONE";
  if (!drmDone) {
    throw new Error(
      `block authorization refused: plan #${plan.id} has not cleared DRM approval (current stage ${board.currentStage.replace(/_/g, " ")}). Get the divisional approval first.`
    );
  }

  const [seg] = await db.select().from(segments).where(eq(segments.id, item.segmentId));
  const defectRows = (await db.select().from(defects)).filter((d) => (item.defectIds ?? []).includes(d.id));
  const assetRows = await db.select().from(assets);
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const tasks = defectRows.map((d) => ({
    defectCode: d.defectCode || `#${d.id}`,
    title: d.title,
    department: d.department,
    durationMin: d.durationMin,
    chainage: `${assetById.get(d.assetId)?.label ?? "—"} · ${seg?.code ?? "—"}`,
  }));

  const worksAtNight = item.startMin < 360 || item.endMin > 1320;
  const needsPower = defectRows.some((d) => d.needsPowerBlock) || item.departments.includes("TRD");
  const requirements = safetyRequirements({
    departments: item.departments,
    needsPower,
    isBridge: !!seg?.isBridge,
    isLevelCrossing: !!seg?.isLevelCrossing,
    fogMode: !!input.fogMode,
    rainMm: input.rainMm,
    worksAtNight,
  });

  const chain = board.history
    .slice()
    .reverse()
    .filter((h) => h.action !== "REPLAN_REQUESTED")
    .map((h) => ({ stage: h.stage, actorName: h.actorName, actorRole: h.actorRole, action: h.action, at: h.at }));

  const ref = await nextAuthRef();
  const durationMin = item.endMin - item.startMin;
  const windowLabel = `${seg?.code ?? "—"} · Day ${item.day + 1} · ${fmt(item.startMin)}–${fmt(item.endMin)} · ${item.window}`;

  const body = [
    `DIGITAL BLOCK AUTHORIZATION — ${ref}`,
    `RAIL RAKSHAK · AI-Powered Railway Operations & Maintenance Management System`,
    `Division: Delhi (NR) · Node NR-DELHI-03 · Prototype document — SIMULATED / DEMO DATA`,
    ``,
    `1. SECTION            : ${seg?.code ?? "—"} (${seg?.fromCode ?? "—"}–${seg?.toCode ?? "—"}, ${seg?.corridor ?? "—"} corridor, ${seg?.lengthKm ?? 0} km)`,
    `2. AUTHORISED WINDOW  : Day ${item.day + 1}, ${fmt(item.startMin)}–${fmt(item.endMin)} hrs (${durationMin} min, ${item.window} window)`,
    `3. LINE BLOCK         : ${item.departments.length > 1 ? "COMBINED (cross-departmental) possession" : "single-department possession"}`,
    `4. DEPARTMENTS        : ${item.departments.join(" + ")}`,
    `5. POWER ISOLATION    : ${needsPower ? "REQUIRED — TPC sanction + earthing recorded before approach" : "Not required"}`,
    `6. TASKS (${tasks.length})`,
    ...tasks.map((t) => `     · ${t.defectCode} [${t.department}] ${t.title} — ${t.durationMin} min (${t.chainage})`),
    `7. BLOCK FORMALITIES  : ${SETUP_MIN} min setup charged for line protection, detonators, gate protection and control intimation`,
    `8. SAFETY REQUIREMENTS`,
    ...requirements.map((s, i) => `     ${i + 1}. ${s}`),
    `9. APPROVAL CHAIN`,
    ...chain.map((c) => `     · ${c.stage.replace(/_/g, " ")} — ${c.action} by ${c.actorName} (${c.actorRole}) at ${new Date(c.at).toLocaleString("en-IN", { hour12: false })}`),
    `10. ISSUED BY         : ${input.actorName} (${input.actorRole}) at ${new Date().toLocaleString("en-IN", { hour12: false })}`,
    ``,
    `This authorization is valid only inside the stated window and only for the listed tasks. Any extension requires a fresh sanction from the`,
    `Section Controller; any change of tasks requires a re-issued document. Completion must be reported before the next train is admitted.`,
    `Prototype document generated from a SIMULATED plan — not a real Indian Railways sanction.`,
  ].join("\n");

  const [row] = await db
    .insert(blockAuthorizations)
    .values({
      ref,
      planId: plan.id,
      blockItemId: item.id,
      segmentId: item.segmentId,
      windowLabel,
      departments: item.departments,
      tasks,
      safetyRequirements: requirements,
      approvalChain: chain,
      status: "ISSUED",
      issuedBy: input.actorName,
      issuedRole: input.actorRole,
      body,
    })
    .returning();

  await recordAudit({
    actorName: input.actorName,
    actorRole: input.actorRole,
    action: "AUTH_ISSUED",
    entity: "BLOCK",
    entityRef: ref,
    planId: plan.id,
    planVersion: plan.id,
    newValue: { ref, section: seg?.code, window: windowLabel, departments: item.departments, tasks: tasks.length },
    reason: `Digital block authorization ${ref} issued for ${seg?.code} ${fmt(item.startMin)}–${fmt(item.endMin)} (${tasks.length} task(s), ${item.departments.join("+")})`,
    severity: "info",
  });

  return { authorization: toDTO(row, plan.name, seg?.corridor ?? "—", chain), body };
}

export async function listAuthorizations(limit = 50): Promise<AuthorizationDTO[]> {
  const rows = await db.select().from(blockAuthorizations).orderBy(desc(blockAuthorizations.id)).limit(limit);
  const planRows = await db.select().from(plans);
  const segRows = await db.select().from(segments);
  const planById = new Map(planRows.map((p) => [p.id, p]));
  const segById = new Map(segRows.map((s) => [s.id, s]));
  return rows.map((r) => toDTO(r, planById.get(r.planId)?.name ?? `Plan #${r.planId}`, segById.get(r.segmentId)?.corridor ?? "—", []));
}

export async function authorizationForBlock(blockItemId: number) {
  const rows = await db.select().from(blockAuthorizations).where(eq(blockAuthorizations.blockItemId, blockItemId)).orderBy(desc(blockAuthorizations.id));
  const planRows = await db.select().from(plans);
  return rows.map((r) => toDTO(r, planRows.find((p) => p.id === r.planId)?.name ?? `Plan #${r.planId}`, "—", []));
}

export async function authorizationSummary() {
  const rows = await listAuthorizations(200);
  return {
    total: rows.length,
    issued: rows.filter((r) => r.status === "ISSUED").length,
    active: rows.filter((r) => r.status === "ACTIVE").length,
    completed: rows.filter((r) => r.status === "COMPLETED").length,
    tasks: rows.reduce((s, r) => s + r.tasks.length, 0),
    combined: rows.filter((r) => r.departments.length > 1).length,
    latest: rows[0] ?? null,
  };
}
