/**
 * RESOURCE OPTIMISATION (Phase 7) — crew, machine, equipment and department
 * capacity as HARD constraints.
 *
 * The optimizer does not merely display a resource table: every candidate
 * placement is passed through `checkPlacement()`, and a placement that breaks a
 * shift window, exceeds a department's daily crew capacity, or needs a machine
 * that is unavailable on that section is REJECTED with a machine-readable
 * reason. Rejections are recorded (UsageLedger `RESOURCE_REJECT`) so the
 * explainability panel can show why a slot was refused.
 */
import { db } from "@/db";
import { resourcePools, segments, usageLedger } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type ResourceKind = "CREW" | "MACHINE" | "EQUIPMENT";

export interface ResourceRow {
  id: number;
  code: string;
  department: string;
  kind: ResourceKind;
  name: string;
  sectionScope: string[];
  units: number;
  shiftStart: number;
  shiftEnd: number;
  maxShiftMin: number;
  available: boolean;
  unavailableReason: string;
}

/** Division-wide resource establishment — seeded once, editable data (not code paths). */
const ESTABLISHMENT: Omit<ResourceRow, "id">[] = [
  /* Two kinds of crew exist in a division: LOCAL gangs tied to a section group,
     and MOBILE (relief) gangs that can be sent anywhere on the division. Both are
     modelled so the constraint is realistic rather than a blanket refusal. An
     empty `sectionScope` means division-wide. */
  { code: "ENG-CREW-A", department: "ENG", kind: "CREW", name: "P.Way Gang — NDLS (A shift, local)", sectionScope: ["NDLS-NZM", "NDLS-DLI", "NDLS-SZM"], units: 2, shiftStart: 30, shiftEnd: 300, maxShiftMin: 200, available: true, unavailableReason: "" },
  { code: "ENG-CREW-B", department: "ENG", kind: "CREW", name: "P.Way Gang — NZM (B shift, local)", sectionScope: ["NZM-ANVT", "NZM-OKA", "NZM-FDB"], units: 2, shiftStart: 30, shiftEnd: 300, maxShiftMin: 220, available: true, unavailableReason: "" },
  { code: "ENG-CREW-C", department: "ENG", kind: "CREW", name: "P.Way Gang — GZB (C shift, local)", sectionScope: ["GZB-TKD", "TKD-FDB", "FDB-PWL"], units: 3, shiftStart: 600, shiftEnd: 900, maxShiftMin: 210, available: true, unavailableReason: "" },
  { code: "ENG-CREW-M1", department: "ENG", kind: "CREW", name: "SSE Mobile Maintenance — Division relief", sectionScope: [], units: 3, shiftStart: 0, shiftEnd: 1439, maxShiftMin: 240, available: true, unavailableReason: "" },
  { code: "TRD-CREW-A", department: "TRD", kind: "CREW", name: "OHE Maintenance — NDLS depot", sectionScope: ["NDLS-NZM", "NDLS-DLI", "NZM-OKA"], units: 2, shiftStart: 30, shiftEnd: 300, maxShiftMin: 180, available: true, unavailableReason: "" },
  { code: "TRD-CREW-B", department: "TRD", kind: "CREW", name: "OHE Maintenance — GZB", sectionScope: ["GZB-TKD", "TKD-FDB", "FDB-PWL"], units: 2, shiftStart: 540, shiftEnd: 900, maxShiftMin: 190, available: true, unavailableReason: "" },
  { code: "TRD-CREW-M1", department: "TRD", kind: "CREW", name: "TRD Mobile Emergency — Division relief", sectionScope: [], units: 2, shiftStart: 0, shiftEnd: 1439, maxShiftMin: 180, available: true, unavailableReason: "" },
  { code: "SNT-CREW-A", department: "SNT", kind: "CREW", name: "Signal & Telecom — NDLS", sectionScope: [], units: 2, shiftStart: 30, shiftEnd: 300, maxShiftMin: 170, available: true, unavailableReason: "" },
  { code: "SNT-CREW-B", department: "SNT", kind: "CREW", name: "Signal & Telecom — TKD", sectionScope: [], units: 2, shiftStart: 600, shiftEnd: 960, maxShiftMin: 170, available: true, unavailableReason: "" },
  { code: "SNT-CREW-M1", department: "SNT", kind: "CREW", name: "S&T Mobile Relay — Division relief", sectionScope: [], units: 2, shiftStart: 0, shiftEnd: 1439, maxShiftMin: 200, available: true, unavailableReason: "" },
  { code: "ENG-BCM", department: "ENG", kind: "MACHINE", name: "Ballast Cleaning Machine (BCM)", sectionScope: [], units: 1, shiftStart: 30, shiftEnd: 300, maxShiftMin: 240, available: true, unavailableReason: "" },
  { code: "ENG-TAMP", department: "ENG", kind: "MACHINE", name: "Duomatic Tamping Machine", sectionScope: [], units: 1, shiftStart: 30, shiftEnd: 330, maxShiftMin: 260, available: true, unavailableReason: "" },
  { code: "TRD-TOWER", department: "TRD", kind: "EQUIPMENT", name: "Tower wagon + earthing sets", sectionScope: [], units: 2, shiftStart: 30, shiftEnd: 330, maxShiftMin: 200, available: true, unavailableReason: "" },
  { code: "SNT-CRM", department: "SNT", kind: "EQUIPMENT", name: "Cable route mapper / TC tester", sectionScope: [], units: 2, shiftStart: 30, shiftEnd: 360, maxShiftMin: 180, available: true, unavailableReason: "" },
  { code: "SNT-RDPMS", department: "SNT", kind: "EQUIPMENT", name: "RDPMS remote diagnostic console", sectionScope: [], units: 1, shiftStart: 0, shiftEnd: 1439, maxShiftMin: 600, available: true, unavailableReason: "" },
];

let established = false;

/** Seed the establishment once per process (idempotent — keyed by `code`). */
export async function ensureResources(): Promise<void> {
  if (established) return;
  const rows = await db.select({ code: resourcePools.code }).from(resourcePools);
  const existing = new Set(rows.map((r) => r.code));
  const missing = ESTABLISHMENT.filter((e) => !existing.has(e.code));
  /* The establishment is a fixed table keyed by `code`. Two requests can reach
     this point together on a cold database (parallel server renders are normal
     here), so the insert is written to be safe to run twice: whichever request
     loses the race simply does nothing instead of failing the page with a
     duplicate-key error. */
  if (missing.length > 0) await db.insert(resourcePools).values(missing).onConflictDoNothing({ target: resourcePools.code });
  established = true;
}

export async function listResources(includeUnavailable = true): Promise<ResourceRow[]> {
  await ensureResources();
  const query = () =>
    includeUnavailable ? db.select().from(resourcePools).orderBy(resourcePools.department, resourcePools.kind, resourcePools.code) : db.select().from(resourcePools).where(eq(resourcePools.available, true));
  let rows = await query();
  /* The establishment is cached in-process for speed, but the table is the truth:
     if the table is empty (fresh database, or a reset under a running server) the
     cache is discarded and the establishment is re-inserted. Without this the
     optimizer would refuse every slot and place nothing. */
  if (rows.length === 0) {
    established = false;
    await ensureResources();
    rows = await query();
  }
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    department: r.department,
    kind: r.kind as ResourceKind,
    name: r.name,
    sectionScope: r.sectionScope,
    units: r.units,
    shiftStart: r.shiftStart,
    shiftEnd: r.shiftEnd,
    maxShiftMin: r.maxShiftMin,
    available: r.available,
    unavailableReason: r.unavailableReason,
  }));
}

export async function setResourceAvailable(code: string, available: boolean, reason = "") {
  await ensureResources();
  await db.update(resourcePools).set({ available, unavailableReason: available ? "" : reason || "marked unavailable by control" }).where(eq(resourcePools.code, code));
}

/* ------------------------------------------------------------------ */
/*  Capacity accounting                                                */
/* ------------------------------------------------------------------ */

export interface PlacementCheck {
  segmentId: number;
  segmentCode: string;
  day: number;
  startMin: number;
  endMin: number;
  department: string;
  /** That department's OWN work minutes inside the possession. Defaults to the
      full window: a gang can only be on site for as long as its own task runs,
      while the possession itself may outlast a single shift. */
  workMin?: number;
  crewRequired?: number;
  machineRequired?: string;
  /** Crews already committed to this department on this day (day-index → count). */
  committed: Map<string, number>;
}

export interface FeasibilityVerdict {
  feasible: boolean;
  rejections: string[];
  resourceCode: string | null;
  crewUsed: number;
  crewCapacity: number;
  shiftWindow: string | null;
}

/**
 * Hard-constraint check for one placement.
 *
 * Rules enforced (all from the persisted establishment):
 *  R1 the department must own at least one available crew whose SECTION SCOPE
 *     covers this section (empty scope = division-wide);
 *  R2 the whole work window must sit inside that crew's shift;
 *  R3 the DEPARTMENT's own work minutes must not exceed the crew's maximum
     shift (a possession shared by three departments is not three shifts long
     for one gang);
 *  R4 the day's committed crew count must stay within the department's units;
 *  R5 a required machine/equipment must exist, be available, and fit the shift.
 */
export function checkPlacement(p: PlacementCheck, resources: ResourceRow[]): FeasibilityVerdict {
  const rejections: string[] = [];
  const dur = p.workMin ?? p.endMin - p.startMin;
  const deptResources = resources.filter((r) => r.department === p.department);
  const crews = deptResources.filter((r) => r.kind === "CREW");

  if (crews.length === 0) {
    return { feasible: false, rejections: [`no crew establishment for department ${p.department}`], resourceCode: null, crewUsed: 0, crewCapacity: 0, shiftWindow: null };
  }

  const inScope = crews.filter((c) => c.available && (c.sectionScope.length === 0 || c.sectionScope.includes(p.segmentCode)));
  if (inScope.length === 0) {
    rejections.push(`no AVAILABLE ${p.department} crew whose section scope covers ${p.segmentCode}`);
  }

  // R2/R3 — a crew must exist whose shift contains the whole window and which can work that long
  const fitting = inScope.filter((c) => p.startMin >= c.shiftStart && p.endMin <= c.shiftEnd && dur <= c.maxShiftMin);
  if (inScope.length > 0 && fitting.length === 0) {
    const best = inScope[0];
    if (p.startMin < best.shiftStart || p.endMin > best.shiftEnd) {
      rejections.push(
        `window ${String(Math.floor(p.startMin / 60)).padStart(2, "0")}:${String(p.startMin % 60).padStart(2, "0")}–${String(
          Math.floor(p.endMin / 60)
        ).padStart(2, "0")}:${String(p.endMin % 60).padStart(2, "0")} falls outside the ${p.department} crew shift`
      );
    }
    if (dur > Math.max(...inScope.map((c) => c.maxShiftMin))) {
      rejections.push(`duration ${dur} min exceeds the ${p.department} crew maximum shift (${Math.max(...inScope.map((c) => c.maxShiftMin))} min)`);
    }
  }

  // R4 — department daily capacity
  const capacity = crews.reduce((s, c) => s + (c.available ? c.units : 0), 0);
  const used = p.committed.get(`${p.day}:${p.department}`) ?? 0;
  const crewRequired = p.crewRequired ?? 1;
  if (used + crewRequired > capacity) {
    rejections.push(`${p.department} crew capacity exhausted on day ${p.day + 1} (${used}/${capacity} committed, ${crewRequired} requested)`);
  }

  // R5 — machine / equipment
  if (p.machineRequired) {
    const machine = deptResources.find((r) => r.code === p.machineRequired || r.name.toLowerCase().includes(p.machineRequired!.toLowerCase()));
    if (!machine) rejections.push(`required machine/equipment '${p.machineRequired}' is not in the ${p.department} establishment`);
    else {
      if (!machine.available) rejections.push(`${machine.name} is unavailable (${machine.unavailableReason || "no reason recorded"})`);
      if (p.startMin < machine.shiftStart || p.endMin > machine.shiftEnd) rejections.push(`${machine.name} is not rostered over the requested window`);
    }
  }

  const chosen = fitting[0] ?? inScope[0] ?? null;
  return {
    feasible: rejections.length === 0,
    rejections,
    resourceCode: chosen?.code ?? null,
    crewUsed: used + crewRequired,
    crewCapacity: capacity,
    shiftWindow: chosen ? `${String(Math.floor(chosen.shiftStart / 60)).padStart(2, "0")}:${String(chosen.shiftStart % 60).padStart(2, "0")}–${String(Math.floor(chosen.shiftEnd / 60)).padStart(2, "0")}:${String(chosen.shiftEnd % 60).padStart(2, "0")}` : null,
  };
}

/** Crew/machine utilisation over a plan's blocks. */
export function utilisation(
  blocks: { segmentCode: string; day: number; startMin: number; endMin: number; departments: string[] }[],
  resources: ResourceRow[]
) {
  const dayDept = new Map<string, number>();
  const machineMin = new Map<string, number>();
  const rejectedWindows: string[] = [];
  const committed = new Map<string, number>();

  for (const b of blocks) {
    for (const dept of b.departments) {
      const verdict = checkPlacement(
        { segmentId: 0, segmentCode: b.segmentCode, day: b.day, startMin: b.startMin, endMin: b.endMin, department: dept, committed },
        resources
      );
      if (!verdict.feasible) rejectedWindows.push(`${b.segmentCode} D${b.day + 1} ${dept}: ${verdict.rejections[0]}`);
      committed.set(`${b.day}:${dept}`, (committed.get(`${b.day}:${dept}`) ?? 0) + 1);
      dayDept.set(`${b.day}:${dept}`, (dayDept.get(`${b.day}:${dept}`) ?? 0) + 1);
    }
  }

  const byDept = ["ENG", "TRD", "SNT"].map((dept) => {
    const crews = resources.filter((r) => r.department === dept && r.kind === "CREW");
    const capacity = crews.reduce((s, c) => s + c.units, 0) * 7; // 7-day horizon
    const used = [...dayDept.entries()].filter(([k]) => k.endsWith(`:${dept}`)).reduce((s, [, v]) => s + v, 0);
    return {
      department: dept,
      crews: crews.length,
      capacity,
      committed: used,
      utilisationPct: capacity ? Math.round((used / capacity) * 1000) / 10 : 0,
      machines: resources.filter((r) => r.department === dept && r.kind !== "CREW").length,
    };
  });

  return {
    byDept,
    machines: [...machineMin.entries()].map(([k, v]) => ({ code: k, minutes: v })),
    infeasible: rejectedWindows,
    totalCommitted: [...dayDept.values()].reduce((s, v) => s + v, 0),
  };
}

/** Persist a rejection so the audit trail can explain what the solver refused. */
export async function recordRejection(input: { segmentCode: string; day: number; window: string; department: string; reasons: string[] }) {
  await db.insert(usageLedger).values({
    kind: "RESOURCE_REJECT",
    entity: input.segmentCode,
    metrics: { day: input.day, window: 0 },
    data: { department: input.department, window: input.window, reasons: input.reasons },
    note: `${input.department} placement refused on ${input.segmentCode} D${input.day + 1} (${input.window}): ${input.reasons.join("; ")}`,
  });
}

export async function rejectionCounts() {
  const rows = await db
    .select({ entity: usageLedger.entity, n: sql<number>`count(*)::int` })
    .from(usageLedger)
    .where(eq(usageLedger.kind, "RESOURCE_REJECT"))
    .groupBy(usageLedger.entity);
  return rows;
}

export async function rejectionsSince(minutes = 1440) {
  const rows = await db
    .select()
    .from(usageLedger)
    .where(eq(usageLedger.kind, "RESOURCE_REJECT"))
    .orderBy(usageLedger.at);
  const cut = Date.now() - minutes * 60_000;
  return rows
    .filter((r) => r.at.getTime() >= cut)
    .map((r) => ({ id: r.id, at: r.at.toISOString(), note: r.note, ...(r.data as Record<string, unknown>) }));
}

/** Section list per crew scope, for the resource board. */
export async function resourceBoard() {
  await ensureResources();
  const [resources, segRows] = await Promise.all([listResources(), db.select().from(segments)]);
  return {
    resources,
    segments: segRows.map((s) => ({ id: s.id, code: s.code, corridor: s.corridor })),
    establishment: ESTABLISHMENT.length,
  };
}
