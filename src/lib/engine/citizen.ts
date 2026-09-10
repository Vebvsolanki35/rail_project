/**
 * Citizen Train View engine — public, passenger-facing journey status.
 *
 * Reuses the existing prototype data only:
 *  - static roster (TRAINS / STATIONS) + kinematics (legTimings/trainDelayMin)
 *  - seeded DB: jobs (active field work), plans + block_items (planned blocks),
 *    defects + assets (safety watch items), settings (corridor restrictions)
 *
 * Nothing here claims live Indian-Railways connectivity — the API responses
 * carry an explicit "Prototype Data" disclaimer. The assembly layer
 * (getTrainJourney) is the single seam where a future approved enquiry
 * provider could be plugged in.
 */
import { db } from "@/db";
import { assets, blockItems, defects, jobs, plans, segments, settings } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { ensureSeeded } from "./seed";
import { STATIONS, TRAINS, fmtMin, type TrainDef } from "./network";
import { legTimings, trainDelayMin, type LegTiming } from "./livetrains";
import type { CitizenImpactReasonDTO, CitizenJourneyDTO, CitizenSearchResultDTO } from "./types";

/* ------------------------------------------------------------------ */
/*  Label helpers (display only — no new data invented)                */
/* ------------------------------------------------------------------ */

/** Friendly names for roster endpoints outside the Delhi-NCR demo grid. */
const EXTERNAL_STATION_NAMES: Record<string, string> = {
  MMCT: "Mumbai Central",
  HWH: "Howrah Jn",
  DBRG: "Dibrugarh",
  RKM: "Rani Kamlapati (Bhopal)",
  SVDK: "Shri Mata Vaishno Devi Katra",
  KLK: "Kalka",
  VGLJ: "Virangana Lakshmibai Jhansi",
  CNB: "Kanpur Central",
  IPR: "Ismailpur",
  KNE: "Katihar Jn",
};

export function stationName(code: string): string {
  return STATIONS.find((s) => s.code === code)?.name ?? EXTERNAL_STATION_NAMES[code] ?? code;
}

const CORRIDOR_NAMES: Record<string, string> = {
  "DEL-HWH": "Delhi–Howrah corridor",
  "DEL-BCT": "Delhi–Mumbai corridor",
  "DEL-KLK": "Delhi–Kalka corridor",
  "DEL-ROK": "Delhi–Rohtak corridor",
  RING: "Delhi Ring corridor",
  RRTS: "Namo Bharat (RRTS) corridor",
  DFC: "DFC freight corridor",
};

const DEPT_WORDS: Record<string, string> = {
  ENG: "Track",
  TRD: "Traction / OHE",
  SNT: "Signalling & Telecom",
};

function deptWord(departments: string[]): string {
  if (departments.length >= 2) return "Multi-department";
  return DEPT_WORDS[departments[0]] ?? "Railway";
}

/* ------------------------------------------------------------------ */
/*  Search — over the existing static roster (demo dataset)            */
/* ------------------------------------------------------------------ */

export function searchTrains(q: string): CitizenSearchResultDTO[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return TRAINS.filter((t) => t.runs > 0)
    .filter((t) => t.number.toLowerCase().includes(query) || t.name.toLowerCase().includes(query))
    .sort((a, b) => a.number.localeCompare(b.number))
    .slice(0, 12)
    .map((t) => ({
      number: t.number,
      name: t.name,
      kind: t.kind,
      origin: t.origin,
      originName: stationName(t.origin),
      dest: t.dest,
      destName: stationName(t.dest),
      departs: fmtMin(t.depMin),
      runsPerDay: t.runs,
      stationsOnRoute: t.legs.length + 1,
    }));
}

/* ------------------------------------------------------------------ */
/*  Circular time-window overlap (a day is a 1440-min circle)          */
/* ------------------------------------------------------------------ */

function toArcs(sRaw: number, eRaw: number): [number, number][] {
  const s = ((Math.round(sRaw) % 1440) + 1440) % 1440;
  const e = ((Math.round(eRaw) % 1440) + 1440) % 1440;
  return s <= e ? [[s, e]] : [[s, 1440], [0, e]];
}

function arcsOverlap(A: [number, number][], B: [number, number][]): boolean {
  return A.some(([a0, a1]) => B.some(([b0, b1]) => a0 < b1 && b0 < a1));
}

/** Does the train's passage window [p0,p1] meet [w0,w1] (± margin, wrap-safe)? */
function timeOverlap(p0: number, p1: number, w0: number, w1: number, marginMin = 45): boolean {
  return arcsOverlap(toArcs(p0, p1), toArcs(w0 - marginMin, w1 + marginMin));
}

function anyRunOverlaps(windows: [number, number][], w0: number, w1: number, marginMin = 45): boolean {
  return windows.some(([p0, p1]) => timeOverlap(p0, p1, w0, w1, marginMin));
}

/* ------------------------------------------------------------------ */
/*  Run selection — which service of the day is "your journey"         */
/* ------------------------------------------------------------------ */

interface ChosenRun {
  status: "RUNNING" | "SCHEDULED" | "ARRIVED";
  run: number;
  dep: number; // time-of-day departure
  elapsed: number; // minutes since departure (valid for RUNNING/ARRIVED)
}

/** A service that completed within this window is still shown as "arrived". */
const ARRIVED_WINDOW_MIN = 120;

function chooseRun(t: TrainDef, total: number, delay: number, nowM: number): ChosenRun {
  const gap = 1440 / t.runs;
  let running: ChosenRun | null = null; // mid-journey right now
  let upcomingToday: ChosenRun | null = null; // departs later today (soonest)
  let recentArrival: ChosenRun | null = null; // completed within the last window
  let nextDep: ChosenRun | null = null; // next departure, today or tomorrow (soonest tod)

  for (let r = 0; r < t.runs; r++) {
    const dep = (t.depMin + r * gap + delay) % 1440;
    if (!nextDep || dep < nextDep.dep) nextDep = { status: "SCHEDULED", run: r, dep, elapsed: 0 };

    if (dep > nowM) {
      // this service departs later today
      if (!upcomingToday || dep < upcomingToday.dep) upcomingToday = { status: "SCHEDULED", run: r, dep, elapsed: 0 };
      // …but its previous daily cycle may be running (crossing midnight) or recently arrived
      const el = nowM + 1440 - dep;
      if (el < total) {
        if (!running || dep > running.dep) running = { status: "RUNNING", run: r, dep, elapsed: el };
      } else if (el - total <= ARRIVED_WINDOW_MIN) {
        if (!recentArrival || el < recentArrival.elapsed) recentArrival = { status: "ARRIVED", run: r, dep, elapsed: el };
      }
    } else {
      // this service already departed today
      const el = nowM - dep;
      if (el < total) {
        if (!running || dep > running.dep) running = { status: "RUNNING", run: r, dep, elapsed: el };
      } else if (el - total <= ARRIVED_WINDOW_MIN) {
        if (!recentArrival || el < recentArrival.elapsed) recentArrival = { status: "ARRIVED", run: r, dep, elapsed: el };
      }
    }
  }

  if (running) return running;
  if (upcomingToday) return upcomingToday;
  if (recentArrival) return recentArrival;
  return nextDep ?? { status: "SCHEDULED", run: 0, dep: (t.depMin + delay) % 1440, elapsed: 0 };
}

/* ------------------------------------------------------------------ */
/*  Maintenance impact engine                                          */
/* ------------------------------------------------------------------ */

function daysFromToday(date: Date): number {
  const a = new Date(date);
  a.setHours(0, 0, 0, 0);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function whenLabel(deltaDays: number, blockDate: Date): string {
  if (deltaDays <= 0) return "Today";
  if (deltaDays === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(blockDate);
}

function sectionLabel(seg: { fromCode: string; toCode: string }): string {
  return `${stationName(seg.fromCode)} – ${stationName(seg.toCode)}`;
}

const WHAT_WE_DO =
  "Rail Rakshak combines maintenance activities from multiple railway departments into coordinated work windows. This reduces repeated disruption and helps keep more infrastructure available for train operations.";

/**
 * Assemble the full citizen journey view for one train: live-ish status from
 * the prototype clock, route timeline, and maintenance impact classified
 * from real planning data (jobs, plan blocks, defects, corridor settings).
 */
export async function getTrainJourney(number: string): Promise<CitizenJourneyDTO | null> {
  const t = TRAINS.find((x) => x.number === number && x.runs > 0);
  if (!t) return null;
  await ensureSeeded();

  const { timings, total } = legTimings(t);
  const delay = trainDelayMin(t);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const chosen = chooseRun(t, total, delay, nowM);
  const gap = 1440 / t.runs;

  /* ---- passage windows per route segment (time-of-day, all services) ---- */
  const passageBySeg = new Map<string, [number, number][]>();
  for (let r = 0; r < t.runs; r++) {
    const dep = (t.depMin + r * gap + delay) % 1440;
    for (const lg of timings) {
      const list = passageBySeg.get(lg.segCode) ?? [];
      list.push([(dep + lg.enter) % 1440, (dep + lg.exit) % 1440]);
      passageBySeg.set(lg.segCode, list);
    }
  }
  const firstPassage = (segCode: string): string => {
    const w = passageBySeg.get(segCode)?.[0];
    return w ? `≈ ${fmtMin(w[0])}` : "";
  };

  /* ---- route timeline ---- */
  const elapsed = chosen.status === "SCHEDULED" ? -1 : chosen.elapsed;
  const stations: CitizenJourneyDTO["journey"]["stations"] = [];
  stations.push({ code: t.origin, name: stationName(t.origin), seq: 1, timeLabel: fmtMin(chosen.dep), state: "upcoming", note: "Departure" });
  timings.forEach((lg, i) => {
    stations.push({
      code: lg.to,
      name: stationName(lg.to),
      seq: i + 2,
      timeLabel: fmtMin((chosen.dep + lg.exit) % 1440),
      state: "upcoming",
      note: "",
    });
  });
  // mark states against the chosen service
  let currentIdx = 0;
  if (chosen.status === "RUNNING") {
    const legIdx = timings.findIndex((lg) => elapsed >= lg.enter && elapsed < lg.exit);
    if (legIdx >= 0) {
      currentIdx = legIdx + 1; // next stop = "to" of current leg → index legIdx+1 in stations
      for (let i = 0; i <= legIdx; i++) stations[i].state = "passed";
      if (currentIdx < stations.length) {
        stations[currentIdx].state = "current";
        stations[currentIdx].note = `in ${Math.max(0, Math.round(timings[legIdx].exit - elapsed))} min`;
      }
    } else {
      // dwelling at an intermediate station
      const nextLeg = timings.findIndex((lg) => elapsed < lg.enter);
      const prevIdx = nextLeg > 0 ? nextLeg - 1 : timings.length - 1;
      currentIdx = nextLeg >= 0 ? nextLeg : stations.length - 1; // station at start of nextLeg
      for (let i = 0; i <= prevIdx; i++) stations[i].state = "passed";
      if (currentIdx < stations.length) {
        stations[currentIdx].state = "current";
        stations[currentIdx].note = "at platform";
      }
    }
  } else if (chosen.status === "ARRIVED") {
    stations.forEach((s) => (s.state = "passed"));
    currentIdx = stations.length - 1;
    stations[currentIdx].state = "current";
    stations[currentIdx].note = "Arrived";
  } else {
    currentIdx = 0;
    stations[0].state = "current";
    stations[0].note = `departs ${fmtMin(chosen.dep)}`;
  }

  const progressPct =
    chosen.status === "ARRIVED" ? 100 : chosen.status === "SCHEDULED" ? 0 : Math.min(99, Math.round((elapsed / Math.max(total, 1)) * 100));

  // status-card summary (handles dwelling / not-departed / arrived cleanly)
  let summaryLast: CitizenJourneyDTO["journey"]["lastStation"] = null;
  let summaryNext: CitizenJourneyDTO["journey"]["nextStation"] = null;
  if (chosen.status === "RUNNING") {
    const legIdx = timings.findIndex((lg) => elapsed >= lg.enter && elapsed < lg.exit);
    if (legIdx >= 0) {
      summaryLast = { code: stations[legIdx].code, name: stations[legIdx].name, note: "passed" };
      const nx = stations[legIdx + 1];
      summaryNext = nx
        ? { code: nx.code, name: nx.name, etaMin: Math.max(0, Math.round(timings[legIdx].exit - elapsed)), note: "approaching" }
        : null;
    } else {
      const nextLeg = timings.findIndex((lg) => elapsed < lg.enter);
      const d = nextLeg >= 0 ? nextLeg : timings.length - 1;
      summaryLast = { code: stations[d].code, name: stations[d].name, note: "at platform" };
      const nx = stations[d + 1];
      summaryNext =
        nx && nextLeg >= 0
          ? { code: nx.code, name: nx.name, etaMin: Math.max(0, Math.round(timings[nextLeg].exit - elapsed)), note: "approaching" }
          : null;
    }
  } else if (chosen.status === "ARRIVED") {
    const fin = stations[stations.length - 1];
    summaryLast = { code: fin.code, name: fin.name, note: "arrived" };
  } else {
    summaryLast = { code: stations[0].code, name: stations[0].name, note: "at origin" };
    const nx = stations[1];
    summaryNext = nx ? { code: nx.code, name: nx.name, etaMin: null, note: "first stop" } : null;
  }

  // does the roster continue beyond the Delhi-NCR demo grid?
  const lastGridCode = timings.length ? timings[timings.length - 1].to : t.origin;
  const beyondGrid = t.dest !== lastGridCode ? { destCode: t.dest, destName: stationName(t.dest) } : null;

  /* ---- maintenance impact from live planning data ---- */
  const [segRows, jobRows, planRows, assetRows, defectRows, settingRows] = await Promise.all([
    db.select().from(segments),
    db.select().from(jobs),
    db.select().from(plans).orderBy(desc(plans.id)),
    db.select().from(assets),
    db.select().from(defects),
    db.select().from(settings),
  ]);
  const segByCode = new Map(segRows.map((s) => [s.code, s]));
  const segById = new Map(segRows.map((s) => [s.id, s]));
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const defectById = new Map(defectRows.map((d) => [d.id, d]));
  const routeSegIds = new Set(t.legs.map((l) => segByCode.get(l.seg)?.id).filter((x): x is number => x != null));
  const fogMode = settingRows.find((r) => r.key === "fogMode")?.value === "true";

  const reasons: CitizenImpactReasonDTO[] = [];
  const notes: string[] = [];

  // 1) active / allotted field work on the route
  for (const j of jobRows) {
    if (!routeSegIds.has(j.segmentId)) continue;
    const seg = segById.get(j.segmentId);
    if (!seg) continue;
    const windows = passageBySeg.get(seg.code) ?? [];
    if (j.status === "IN_PROGRESS") {
      const overlaps =
        j.windowStart == null || j.windowEnd == null || windows.length === 0
          ? true
          : anyRunOverlaps(windows, j.windowStart, j.windowEnd);
      reasons.push({
        kind: "active-work",
        section: sectionLabel(seg),
        sectionCode: seg.code,
        corridor: CORRIDOR_NAMES[seg.corridor] ?? seg.corridor,
        when: "Now",
        windowLabel: j.windowStart != null && j.windowEnd != null ? `${fmtMin(j.windowStart)}–${fmtMin(j.windowEnd)}` : "in progress",
        overlapsPassage: overlaps,
        departments: [j.department],
        text: overlaps
          ? `${deptWord([j.department])} maintenance work is currently in progress on the ${sectionLabel(seg)} section, around this train's scheduled passing time (${firstPassage(seg.code)}).`
          : `${deptWord([j.department])} maintenance work is in progress on the ${sectionLabel(seg)} section — at a different time than this train's scheduled passing (${firstPassage(seg.code)}).`,
      });
    } else if (j.status === "ALLOTTED") {
      const overlaps =
        j.windowStart != null && j.windowEnd != null && windows.length > 0
          ? anyRunOverlaps(windows, j.windowStart, j.windowEnd)
          : true;
      reasons.push({
        kind: "field-job",
        section: sectionLabel(seg),
        sectionCode: seg.code,
        corridor: CORRIDOR_NAMES[seg.corridor] ?? seg.corridor,
        when: "Scheduled",
        windowLabel: j.windowStart != null && j.windowEnd != null ? `${fmtMin(j.windowStart)}–${fmtMin(j.windowEnd)}` : "to be announced",
        overlapsPassage: overlaps,
        departments: [j.department],
        text: overlaps
          ? `${deptWord([j.department])} maintenance is scheduled on the ${sectionLabel(seg)} section, close to this train's passing time.`
          : `${deptWord([j.department])} maintenance is scheduled on the ${sectionLabel(seg)} section — outside this train's scheduled passing time.`,
      });
    }
  }

  // 2) planned blocks from the latest plan of each horizon
  const latestByHorizon = new Map<string, (typeof planRows)[number]>();
  for (const p of planRows) if (!latestByHorizon.has(p.horizon)) latestByHorizon.set(p.horizon, p);
  const planById = new Map(planRows.map((p) => [p.id, p]));
  const planIds = [...latestByHorizon.values()].map((p) => p.id);
  const blockRows = planIds.length ? await db.select().from(blockItems).where(inArray(blockItems.planId, planIds)) : [];
  for (const b of blockRows) {
    if (!routeSegIds.has(b.segmentId)) continue;
    const seg = segById.get(b.segmentId);
    const plan = planById.get(b.planId);
    if (!seg || !plan) continue;
    const windows = passageBySeg.get(seg.code) ?? [];
    const blockDate = new Date(plan.createdAt.getTime() + b.day * 86_400_000);
    const delta = daysFromToday(blockDate);
    const when = whenLabel(delta, blockDate);
    const windowLabel = `${fmtMin(b.startMin)}–${fmtMin(b.endMin)}`;
    const maxSeverity = Math.max(0, ...b.defectIds.map((id) => defectById.get(id)?.severity ?? 0));
    if (delta < 0) {
      notes.push(`Maintenance planned on the ${sectionLabel(seg)} section (${windowLabel}) has already been completed.`);
      continue;
    }
    const overlaps = windows.length > 0 ? anyRunOverlaps(windows, b.startMin, b.endMin) : true;
    reasons.push({
      kind: "planned-block",
      section: sectionLabel(seg),
      sectionCode: seg.code,
      corridor: CORRIDOR_NAMES[seg.corridor] ?? seg.corridor,
      when,
      windowLabel,
      overlapsPassage: overlaps,
      departments: b.departments,
      maxSeverity: maxSeverity || undefined,
      isSuperBlock: b.isSuperBlock,
      text: overlaps
        ? `${deptWord(b.departments)} maintenance is planned on the ${sectionLabel(seg)} section ${when.toLowerCase() === "today" ? "today" : `on ${when}`} (${windowLabel}), overlapping this train's scheduled passing time.`
        : `${deptWord(b.departments)} maintenance is planned on the ${sectionLabel(seg)} section on ${when} (${windowLabel}) — outside this train's scheduled passing time (${firstPassage(seg.code)}).`,
    });
  }

  // 3) unscheduled safety-watch defects on the route (severity >= 8, still open)
  for (const d of defectRows) {
    if (d.status !== "open") continue;
    const seg = segById.get(assetById.get(d.assetId)?.segmentId ?? -1);
    if (!seg || !routeSegIds.has(seg.id) || d.severity < 8) continue;
    if (d.severity >= 9) {
      reasons.push({
        kind: "safety-watch",
        section: sectionLabel(seg),
        sectionCode: seg.code,
        corridor: CORRIDOR_NAMES[seg.corridor] ?? seg.corridor,
        when: "Under watch",
        windowLabel: "being scheduled",
        overlapsPassage: false,
        departments: [d.department],
        maxSeverity: d.severity,
        text: `A safety-critical ${DEPT_WORDS[d.department] ?? "railway"} defect on the ${sectionLabel(seg)} section is under priority monitoring — maintenance is being scheduled.`,
      });
    } else {
      notes.push(`A ${DEPT_WORDS[d.department] ?? "railway"} defect on the ${sectionLabel(seg)} section is being monitored.`);
    }
  }

  // 4) corridor-wide restrictions (prototype settings)
  if (fogMode) {
    notes.push("Fog protocols are active across the network — enhanced safety precautions are in effect.");
  }

  /* ---- classify ---- */
  const redReasons = reasons.filter(
    (r) =>
      (r.kind === "active-work" && r.overlapsPassage) ||
      (r.kind === "planned-block" && r.overlapsPassage && ((r.maxSeverity ?? 0) >= 9 || (r.departments?.length ?? 0) >= 3))
  );
  const yellowReasons = reasons.filter((r) => !redReasons.includes(r));
  const level: "GREEN" | "YELLOW" | "RED" = redReasons.length > 0 ? "RED" : yellowReasons.length > 0 ? "YELLOW" : "GREEN";
  const hasTimeOverlap = yellowReasons.some((r) => r.overlapsPassage) || redReasons.length > 0;
  const statusLabel =
    level === "RED"
      ? "High Operational Impact"
      : level === "YELLOW"
        ? hasTimeOverlap
          ? "Minor Operational Impact"
          : "Maintenance Window Nearby"
        : "Running Normally";

  const headline =
    level === "RED"
      ? "High-impact maintenance activity may affect this journey."
      : level === "YELLOW"
        ? "Maintenance activity is planned on part of your route."
        : "No significant maintenance impact expected.";
  const advice =
    level === "RED"
      ? "Railway operations teams are prioritizing safety while minimizing disruption."
      : level === "YELLOW"
        ? "Minor operational adjustments may occur."
        : "";

  /* ---- verified KPIs from the latest strategic plan (never hardcoded) ---- */
  const strategic = latestByHorizon.get("WEEKLY") ?? latestByHorizon.get("MONTHLY") ?? null;
  const k = strategic?.kpis ?? null;
  const kpis = k
    ? {
        horizon: strategic!.horizon,
        generatedAt: strategic!.createdAt.toISOString(),
        blocksOptimized: k.blocks ?? null,
        activitiesCoordinated: k.defectsCleared ?? null,
        combinedWindows: k.superBlocks ?? null,
        downtimeReductionPct: k.reductionPct ?? null,
        downtimeBaselineH: k.downtimeBaselineH ?? null,
        downtimeOptimizedH: k.downtimeOptimizedH ?? null,
      }
    : null;

  return {
    train: {
      number: t.number,
      name: t.name,
      kind: t.kind,
      origin: t.origin,
      originName: stationName(t.origin),
      dest: t.dest,
      destName: stationName(t.dest),
      departs: fmtMin(t.depMin),
      runsPerDay: t.runs,
      priority: t.priority,
    },
    journey: {
      status: chosen.status,
      statusLabel,
      progressPct,
      lastStation: summaryLast,
      nextStation: summaryNext,
      stations,
      beyondGrid,
    },
    impact: { level, statusLabel, headline, advice, reasons, notes, whatWeDo: WHAT_WE_DO },
    kpis,
    disclaimers: [
      "Prototype Data — demo railway operations dataset for the Delhi NCR grid.",
      "Not connected to live Indian Railways systems (NTES / COA / FOIS). Indicative times and maintenance plans only.",
      "Designed so approved train-enquiry data providers could be connected later without changing this view.",
    ],
  };
}
