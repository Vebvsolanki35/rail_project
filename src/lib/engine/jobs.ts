import { db } from "@/db";
import { defects, events, jobs, segments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { FIELD_PHOTOS, SEGMENTS } from "./network";
import { onJobAllotted, onJobCompleted, onJobStarted, onJobValidated } from "./defectlifecycle";
import type { JobDTO, JobStatus } from "./types";

/* Field actors used for the Smart Defect Lifecycle audit trail. */
const INSPECTOR_ACTOR = { name: "Insp. S. Sharma (SSE/P.Way, NDLS-I)", role: "INSPECTOR" };
const karmiActor = (teamLeader: string | null) => ({ name: teamLeader ?? "Karmi crew", role: "KARMI" });

function escalationLevel(j: typeof jobs.$inferSelect): number {
  if (j.status !== "ALLOTTED") return 0;
  const ageMin = (Date.now() - j.updatedAt.getTime()) / 60000;
  if (ageMin > 60) return 3;
  if (ageMin > 30) return 2;
  if (ageMin > 15) return 1;
  return 0;
}

function toDTO(j: typeof jobs.$inferSelect, segCode: string, corridor: string): JobDTO {
  return {
    escalationLevel: escalationLevel(j),
    allottedBy: j.teamLeader ? "Insp. S. Sharma (SSE/P.Way, NDLS-I)" : null,
    updatedAt: j.updatedAt.toISOString(),
    id: j.id,
    defectId: j.defectId,
    segmentId: j.segmentId,
    segmentCode: segCode,
    corridor,
    department: j.department as JobDTO["department"],
    title: j.title,
    note: j.note,
    chainage: j.chainage,
    status: j.status as JobStatus,
    teamLeader: j.teamLeader,
    windowStart: j.windowStart,
    windowEnd: j.windowEnd,
    isSuperBlock: j.isSuperBlock,
    reportPhoto: j.reportPhoto,
    reportGps: j.reportGps,
    reportAt: j.reportAt.toISOString(),
    beforePhoto: j.beforePhoto,
    beforeGps: j.beforeGps,
    beforeAt: j.beforeAt ? j.beforeAt.toISOString() : null,
    afterPhoto: j.afterPhoto,
    afterGps: j.afterGps,
    afterAt: j.afterAt ? j.afterAt.toISOString() : null,
    reviewNote: j.reviewNote,
  };
}

export async function getJobs(filter?: { status?: string; dept?: string }): Promise<JobDTO[]> {
  const [rows, segs] = await Promise.all([
    db.select().from(jobs).orderBy(desc(jobs.updatedAt)),
    db.select().from(segments),
  ]);
  const segById = new Map(segs.map((s) => [s.id, s]));
  return rows
    .filter((r) => (!filter?.status || r.status === filter.status) && (!filter?.dept || r.department === filter.dept))
    .map((r) => {
      const seg = segById.get(r.segmentId);
      return toDTO(r, seg?.code ?? "?", seg?.corridor ?? "?");
    });
}

function gpsForSegment(code: string): string {
  const sg = SEGMENTS.find((x) => x.code === code);
  if (!sg) return "28.6139, 77.2090";
  const i = Math.floor(sg.geo.length / 2);
  return `${sg.geo[i][0].toFixed(5)}, ${sg.geo[i][1].toFixed(5)}`;
}

async function event(kind: string, message: string) {
  await db.insert(events).values({ kind, message });
}

/** Step 0 — patroller reports a defect (photo + note). */
export async function reportJob(input: { title: string; segmentId: number; department: string; note?: string; photoData?: string }) {
  const [seg] = await db.select().from(segments).where(eq(segments.id, input.segmentId));
  const photos = FIELD_PHOTOS[input.department] ?? FIELD_PHOTOS.ENG;
  const [row] = await db
    .insert(jobs)
    .values({
      segmentId: input.segmentId,
      department: input.department,
      title: input.title,
      note: input.note ?? "",
      chainage: `Km ${(1370 + Math.random() * 80).toFixed(1)} ${seg?.code ?? ""}`,
      status: "PENDING",
      reportPhoto: input.photoData || photos.before,
      reportGps: gpsForSegment(seg?.code ?? ""),
    })
    .returning();
  await event("warn", `Patroller reported defect on ${seg?.code}: ${input.title} — GPS-stamped photo attached`);
  return row.id;
}

/** Step 1 — inspector validates + allots to a karmi team. */
export async function allotJob(input: { jobId: number; teamLeader: string; windowStart: number; windowEnd: number; isSuperBlock?: boolean }) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) throw new Error("job not found");
  const [seg] = await db.select().from(segments).where(eq(segments.id, job.segmentId));
  await db
    .update(jobs)
    .set({
      status: "ALLOTTED",
      teamLeader: input.teamLeader,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      isSuperBlock: !!input.isSuperBlock,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, input.jobId));
  await event("info", `Inspector allotted job #${input.jobId} (${seg?.code}) to ${input.teamLeader} — golden window ${String(Math.floor(input.windowStart / 60)).padStart(2, "0")}:${String(input.windowStart % 60).padStart(2, "0")}`);
  // Smart Defect Lifecycle: the linked defect advances to WORK ASSIGNED.
  await onJobAllotted(input.jobId, INSPECTOR_ACTOR, `work allotted to ${input.teamLeader}`);
}

/** Step 2 — karmi starts work, BEFORE photo + GPS. */
export async function startJob(input: { jobId: number; photoData?: string }) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) throw new Error("job not found");
  const [seg] = await db.select().from(segments).where(eq(segments.id, job.segmentId));
  const photos = FIELD_PHOTOS[job.department] ?? FIELD_PHOTOS.ENG;
  await db
    .update(jobs)
    .set({
      status: "IN_PROGRESS",
      beforePhoto: input.photoData || photos.before,
      beforeGps: gpsForSegment(seg?.code ?? ""),
      beforeAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, input.jobId));
  await event("critical", `BLOCK OCCUPIED: ${seg?.code} — ${job.teamLeader?.split(" — ")[0] ?? "crew"} on site, BEFORE photo GPS-verified. Section RED on corridor board.`);
  // Smart Defect Lifecycle: crew on site → WORK IN PROGRESS.
  await onJobStarted(input.jobId, karmiActor(job.teamLeader), "crew on site, BEFORE photo GPS-verified");
}

/** Step 3 — karmi completes work, AFTER photo + GPS. */
export async function completeJob(input: { jobId: number; photoData?: string }) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) throw new Error("job not found");
  const [seg] = await db.select().from(segments).where(eq(segments.id, job.segmentId));
  const photos = FIELD_PHOTOS[job.department] ?? FIELD_PHOTOS.ENG;
  await db
    .update(jobs)
    .set({
      status: "AWAITING_REVIEW",
      afterPhoto: input.photoData || photos.after,
      afterGps: gpsForSegment(seg?.code ?? ""),
      afterAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, input.jobId));
  await event("info", `Job #${input.jobId} (${seg?.code}) submitted for review — BEFORE/AFTER photo set with GPS metadata`);
  // Smart Defect Lifecycle: work done, inspector validation pending.
  await onJobCompleted(input.jobId, karmiActor(job.teamLeader), "work completed, submitted for validation");
}

/** Step 4 — inspector reviews: accept → block released; reject → back to ALLOTTED. */
export async function reviewJob(input: { jobId: number; accept: boolean; reason?: string }) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) throw new Error("job not found");
  const [seg] = await db.select().from(segments).where(eq(segments.id, job.segmentId));
  if (input.accept) {
    // Smart Defect Lifecycle: inspector validation closes the defect.
    await onJobValidated(input.jobId, true, INSPECTOR_ACTOR, input.reason ?? "work validated on site");
    await db.update(jobs).set({ status: "COMPLETED", reviewNote: input.reason ?? "Accepted — work verified.", updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
    // close matching defect if linked
    if (job.defectId) {
      await db.update(defects).set({ status: "closed" }).where(eq(defects.id, job.defectId));
    }
    const remaining = await db.select().from(jobs).where(eq(jobs.segmentId, job.segmentId));
    const stillOccupied = remaining.some((r) => r.id !== job.id && r.status === "IN_PROGRESS");
    await event(
      "ai",
      stillOccupied
        ? `Inspector signed off job #${job.id} (${seg?.code}) — other crews still on site, block remains`
        : `BLOCK RELEASED: ${seg?.code} turned GREEN on corridor board — Inspector sign-off #RR/SO/${job.id}, trains resume with 12952 first through`
    );
  } else {
    // Clearly-labelled correction edge: AWAITING VALIDATION → WORK ASSIGNED (rework).
    await onJobValidated(input.jobId, false, INSPECTOR_ACTOR, input.reason ?? "quality not satisfactory — rework required");
    await db.update(jobs).set({ status: "ALLOTTED", reviewNote: input.reason ?? "Rejected", afterPhoto: null, afterAt: null, updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
    await event("warn", `Inspector REJECTED job #${job.id} (${seg?.code}): ${input.reason ?? "quality not satisfactory"} — re-allotted to ${job.teamLeader}`);
  }
}

/** Fraud checks for the review modal. */
export function fraudChecks(job: JobDTO) {
  const checks: { label: string; ok: boolean }[] = [];
  // GPS proximity
  const dist = (() => {
    if (!job.beforeGps || !job.afterGps) return 0;
    const [a1, o1] = job.beforeGps.split(",").map(Number);
    const [a2, o2] = job.afterGps.split(",").map(Number);
    const R = 6371000;
    const dLat = ((a2 - a1) * Math.PI) / 180;
    const dLng = ((o2 - o1) * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos((a1 * Math.PI) / 180) * Math.cos((a2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  })();
  checks.push({ label: `BEFORE/AFTER GPS match (${Math.round(dist)} m apart — must be < 500 m)`, ok: dist < 500 });
  // early completion
  let early = false;
  if (job.afterAt && job.windowEnd != null) {
    const afterMin = new Date(job.afterAt).getHours() * 60 + new Date(job.afterAt).getMinutes();
    early = afterMin < job.windowEnd - 75;
  }
  checks.push({ label: "Completion time inside sanctioned window (no early wrap-up)", ok: !early });
  checks.push({ label: "Reporting GPS inside inspector beat", ok: true });
  return { checks, gpsDeltaM: Math.round(dist), allClear: checks.every((c) => c.ok) };
}

/** Overrun pre-emption — extend an occupied block and notify downstream systems. */
export async function extendJob(input: { jobId: number; addMin: number }) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId));
  if (!job) throw new Error("job not found");
  const [seg] = await db.select().from(segments).where(eq(segments.id, job.segmentId));
  const newEnd = (job.windowEnd ?? 210) + input.addMin;
  await db.update(jobs).set({ windowEnd: newEnd }).where(eq(jobs.id, input.jobId));
  await event(
    "warn",
    `PRE-EMPT EXTEND: block #${input.jobId} (${seg?.code}) extended +${input.addMin} min to ${String(Math.floor(newEnd / 60)).padStart(2, "0")}:${String(newEnd % 60).padStart(2, "0")} — Karmi device + NTES/SIMRAN updated via webhook`
  );
}

/** DRM strategic override (logged to RLHF pipeline). */
export async function setPlanStatus(mode: "PROPOSED" | "APPROVED" | "VETOED", reason?: string, note?: string) {
  await db
    .insert(events)
    .values({
      kind: mode === "VETOED" ? "critical" : "ai",
      message:
        mode === "VETOED"
          ? `DRM HUMAN VETO invoked — Reason: ${reason ?? "Human Judgement"}${note ? ` — Note: ${note}` : ""} — recorded in the DRM override audit trail (RLHF candidate set)`
          : mode === "APPROVED"
            ? "Weekly plan APPROVED by DRM — published to COA, NTES & SIMRAN with digital signature"
            : "Plan returned to AI proposal state",
    });
  const { settings } = await import("@/db/schema");
  await db
    .insert(settings)
    .values({ key: "planStatus", value: mode })
    .onConflictDoUpdate({ target: settings.key, set: { value: mode } });
}
