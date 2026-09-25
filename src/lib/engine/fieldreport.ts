/**
 * RAKSHAK PATROL + FIELD REPORT → defect intake (POST /api/defects/report).
 *
 * The gangman/patroller handset is deliberately login-free (see /patrol): the
 * field worker taps a category, the app stamps GPS + photo, and the defect lands
 * in the lifecycle at REPORTED with a stable DEF-<SECTION>-<YEAR>-<SEQ> id.
 *
 * The category catalogue lives in ./patrolCatalog (pure, client-safe) so the
 * handset and this intake path can never drift apart.
 */
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { assets, defects, events, segments, stations } from "@/db/schema";
import { detectRecurrence, allocateDefectCode } from "./defectlifecycle";
import { STAGE_CONFIG } from "./lifecycleStages";
import { classifyUrgency } from "./urgency";
import { categoryMeta, defaultDueDays } from "./patrolCatalog";

/* Re-exported for API consumers (see /api/defects/report). */
export { PATROL_CATEGORIES, categoryMeta, defaultDueDays } from "./patrolCatalog";
export type { PatrolCategoryKey } from "./patrolCatalog";

export interface FieldReportInput {
  category: string;
  segmentCode?: string;
  segmentId?: number;
  title?: string;
  note?: string;
  severity?: number;
  durationMin?: number;
  department?: string;
  photo?: string;
  gps?: string;
  reporterName?: string;
  reporterMobile?: string;
  needsPowerBlock?: boolean;
  needsLineBlock?: boolean;
  inspectionMode?: "physical" | "remote" | "either";
  dueInDays?: number;
}

export interface FieldReportResult {
  defectId: number;
  defectCode: string;
  segmentCode: string;
  segmentId: number;
  title: string;
  department: string;
  severity: number;
  durationMin: number;
  dueInDays: number;
  stage: string;
  stageLabel: string;
  happening: string;
  next: string;
  responsible: string;
  urgencyClass: string;
  recurrence: { occurrences: number; band: string; escalated: boolean };
  possibleDuplicate: { id: number; defectCode: string; title: string; ageDays: number } | null;
  message: string;
}

export async function reportFieldDefect(input: FieldReportInput): Promise<FieldReportResult> {
  const meta = categoryMeta(input.category);
  const severity = Math.max(1, Math.min(10, input.severity ?? meta.severity));
  const durationMin = Math.max(15, input.durationMin ?? meta.durationMin);
  const department = input.department ?? meta.department;

  // Resolve the section: explicit id, else code, else the section nearest the
  // stamped GPS fix (string-compare the first coordinate for a stable pick).
  let seg = input.segmentId ? (await db.select().from(segments).where(eq(segments.id, input.segmentId)))[0] : undefined;
  if (!seg && input.segmentCode) {
    seg = (await db.select().from(segments).where(eq(segments.code, input.segmentCode)))[0];
  }
  if (!seg) {
    const all = await db.select().from(segments);
    if (all.length === 0) throw new Error("no sections in dataset");
    if (input.gps) {
      // Nearest-section pick: compare the GPS fix against each section's midpoint
      // (derived from its two stations' real coordinates).
      const stationRows = await db.select().from(stations);
      const stationByCode = new Map(stationRows.map((s) => [s.code, s]));
      const lat = Number(input.gps.split(",")[0]);
      const lng = Number(input.gps.split(",")[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        const midpoint = (s: (typeof all)[number]) => {
          const a = stationByCode.get(s.fromCode);
          const b = stationByCode.get(s.toCode);
          return a && b ? { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 } : null;
        };
        const nearest = all
          .map((s) => {
            const m = midpoint(s);
            return { s, d: m ? Math.hypot(m.lat - lat, m.lng - lng) : Number.MAX_VALUE };
          })
          .sort((a, b) => a.d - b.d)[0];
        if (nearest && nearest.d !== Number.MAX_VALUE) seg = nearest.s;
      }
    }
    seg = seg ?? all[0];
  }

  // Asset for that section + department (falls back to any asset on the section).
  const segAssets = await db.select().from(assets).where(eq(assets.segmentId, seg.id));
  const asset = segAssets.find((a) => a.department === department) ?? segAssets[0];
  if (!asset) throw new Error(`no monitored asset on section ${seg.code}`);

  const title = input.title ?? meta.label;
  const defectCode = await allocateDefectCode(seg.code);
  const dueInDays = input.dueInDays ?? defaultDueDays(severity);

  const [row] = await db
    .insert(defects)
    .values({
      assetId: asset.id,
      department,
      sourceSystem: "RAKSHAK-PATROL",
      title,
      severity,
      overdueDays: 0,
      durationMin,
      needsLineBlock: input.needsLineBlock ?? true,
      needsPowerBlock: input.needsPowerBlock ?? department === "TRD",
      inspectionMode: input.inspectionMode ?? "physical",
      status: "open",
      defectCode,
      lifecycleStatus: "REPORTED",
      priority: "MEDIUM",
      dueInDays,
      detectedAt: new Date(),
    })
    .returning();

  // Rule-based recurrence detection on this asset (NOT ML).
  const recurrence = await detectRecurrence(row.id);

  // Duplicate guard: same asset + department reported in the last 7 days.
  const since = new Date(Date.now() - 7 * 86400000);
  const recent = await db
    .select()
    .from(defects)
    .where(and(eq(defects.assetId, asset.id), eq(defects.department, department), gte(defects.detectedAt, since)));
  const dup = recent
    .filter((r) => r.id !== row.id)
    .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())[0];

  const urgencyClass = classifyUrgency(dueInDays, severity);
  const cfg = STAGE_CONFIG.REPORTED;

  await db.insert(events).values({
    kind: severity >= 8 ? "critical" : "warn",
    message: `PATROL REPORT ${defectCode}: ${title} on ${seg.code} (${department}) — severity ${severity}/10, GPS ${input.gps ?? "unavailable"}${input.photo ? ", photo attached" : ""} — lifecycle ${cfg.label}`,
  });

  return {
    defectId: row.id,
    defectCode,
    segmentCode: seg.code,
    segmentId: seg.id,
    title,
    department,
    severity,
    durationMin,
    dueInDays,
    stage: "REPORTED",
    stageLabel: cfg.label,
    happening: cfg.happening,
    next: cfg.next,
    responsible: cfg.responsible,
    urgencyClass,
    recurrence,
    possibleDuplicate: dup
      ? {
          id: dup.id,
          defectCode: dup.defectCode || `#${dup.id}`,
          title: dup.title,
          ageDays: Math.round(((Date.now() - dup.detectedAt.getTime()) / 86400000) * 10) / 10,
        }
      : null,
    message: `${defectCode} registered at ${cfg.label} — ${cfg.next} (responsible: ${cfg.responsible})`,
  };
}
