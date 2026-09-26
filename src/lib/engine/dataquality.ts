/**
 * DATA QUALITY MONITORING (Phase 17).
 *
 * The monitor runs against the REAL tables — ingest records, the defect
 * register, the asset register and the segment geometry — and reports what is
 * actually wrong:
 *
 *   missing fields · duplicates · stale records · invalid assets ·
 *   invalid coordinates · conflicting source records · schema mismatches
 *
 * Nothing is discarded: every finding names the record, the field and the
 * reason. Where a fix is unambiguous (a defect with no human reference code),
 * the monitor offers a one-click repair that is itself recorded in the audit
 * trail.
 */
import { db } from "@/db";
import { assets, defects, ingestRecords, segments, stations, usageLedger } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { recordAudit } from "./audittrail";
import { FEED_CONTRACTS } from "@/lib/integrations/adapters";

export type QualityCategory =
  | "MISSING_FIELD"
  | "DUPLICATE"
  | "STALE_RECORD"
  | "INVALID_ASSET"
  | "INVALID_COORDINATE"
  | "CONFLICTING_SOURCE"
  | "SCHEMA_MISMATCH"
  | "ORPHAN_REFERENCE";

export interface QualityFinding {
  id: string;
  category: QualityCategory;
  severity: "critical" | "warning" | "info";
  system: string;
  entity: string;
  recordRef: string;
  field: string;
  detail: string;
  repair?: { label: string; action: string; payload: Record<string, unknown> } | null;
}

export interface QualityReport {
  generatedAt: string;
  score: number;
  totals: { findings: number; critical: number; warning: number; info: number };
  byCategory: { category: QualityCategory; label: string; n: number }[];
  bySystem: { system: string; findings: number; valid: number; invalid: number; integrityPct: number }[];
  findings: QualityFinding[];
  checked: { ingestRecords: number; defects: number; assets: number; segments: number; stations: number; contracts: number };
  note: string;
}

const CATEGORY_LABEL: Record<QualityCategory, string> = {
  MISSING_FIELD: "Missing fields",
  DUPLICATE: "Duplicates",
  STALE_RECORD: "Stale records",
  INVALID_ASSET: "Invalid assets",
  INVALID_COORDINATE: "Invalid coordinates",
  CONFLICTING_SOURCE: "Conflicting source records",
  SCHEMA_MISMATCH: "Schema mismatches",
  ORPHAN_REFERENCE: "Orphan references",
};

/** Great-circle distance in km (haversine) — used to validate station geometry. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

export async function qualityReport(findingLimit = 120): Promise<QualityReport> {
  const [records, defectRows, assetRows, segRows, stationRows] = await Promise.all([
    db.select().from(ingestRecords),
    db.select().from(defects),
    db.select().from(assets),
    db.select().from(segments),
    db.select().from(stations),
  ]);

  const findings: QualityFinding[] = [];
  let fid = 0;
  const push = (f: Omit<QualityFinding, "id">) => findings.push({ id: `Q${++fid}`, ...f });

  /* ---------- 1. Ingest-record level checks (adapter-declared issues) ---------- */
  for (const r of records) {
    for (const issue of r.issues ?? []) {
      const category: QualityCategory = issue.startsWith("duplicate")
        ? "DUPLICATE"
        : issue.startsWith("stale")
          ? "STALE_RECORD"
          : issue.startsWith("unknown section")
            ? "ORPHAN_REFERENCE"
            : issue.startsWith("missing field")
              ? "MISSING_FIELD"
              : issue.includes("range")
                ? "SCHEMA_MISMATCH"
                : "MISSING_FIELD";
      push({
        category,
        severity: category === "DUPLICATE" ? "warning" : category === "STALE_RECORD" ? "warning" : "critical",
        system: r.system,
        entity: r.entity,
        recordRef: r.sourceRef,
        field: issue.split(":")[1]?.trim() ?? issue,
        detail: `${r.system} · ${r.entity} · ${r.sourceRef} — ${issue}`,
      });
    }
    if (r.status === "INVALID" && (r.issues ?? []).length === 0) {
      push({
        category: "SCHEMA_MISMATCH",
        severity: "critical",
        system: r.system,
        entity: r.entity,
        recordRef: r.sourceRef,
        field: "—",
        detail: `${r.system} record ${r.sourceRef} was rejected by validation but carried no issue detail — adapter contract violation`,
      });
    }
  }

  /* ---------- 2. Conflicting source records (same section, same department, overlapping severity) ---------- */
  const confKey = new Map<string, typeof records>();
  for (const r of records) {
    if (!r.sectionHint || r.status !== "VALID") continue;
    const key = `${r.sectionHint}:${r.department}`;
    const list = confKey.get(key) ?? [];
    list.push(r);
    confKey.set(key, list);
  }
  for (const [key, list] of confKey) {
    const refs = new Set(list.map((r) => r.sourceRef));
    if (list.length > 6 && refs.size === list.length) {
      push({
        category: "CONFLICTING_SOURCE",
        severity: "info",
        system: [...new Set(list.map((r) => r.system))].join("+"),
        entity: list[0].entity,
        recordRef: key,
        field: "severity",
        detail: `${list.length} independent valid records reference ${key} — sources agree on the section but not on the task list; verify before planning.`,
      });
    }
  }

  /* ---------- 3. Defect register integrity ---------- */
  const codes = new Map<string, number>();
  for (const d of defectRows) {
    if (!d.defectCode) {
      push({
        category: "MISSING_FIELD",
        severity: "critical",
        system: d.sourceSystem,
        entity: "DEFECT",
        recordRef: `#${d.id}`,
        field: "defect_code",
        detail: `Defect #${d.id} (${d.title.slice(0, 50)}) has no human reference code — it cannot be referenced in a block request or authorization.`,
        repair: { label: "Assign reference code", action: "backfill_defect_code", payload: { defectId: d.id } },
      });
    } else {
      codes.set(d.defectCode, (codes.get(d.defectCode) ?? 0) + 1);
    }
    if (!d.durationMin || d.durationMin <= 0) {
      push({
        category: "SCHEMA_MISMATCH",
        severity: "critical",
        system: d.sourceSystem,
        entity: "DEFECT",
        recordRef: d.defectCode || `#${d.id}`,
        field: "duration_min",
        detail: `Defect ${d.defectCode || `#${d.id}`} carries a non-positive work duration (${d.durationMin} min) — the optimizer cannot place it.`,
      });
    }
    if (d.severity < 1 || d.severity > 10) {
      push({
        category: "SCHEMA_MISMATCH",
        severity: "critical",
        system: d.sourceSystem,
        entity: "DEFECT",
        recordRef: d.defectCode || `#${d.id}`,
        field: "severity",
        detail: `Severity ${d.severity} is outside the declared 1–10 contract range.`,
      });
    }
  }
  for (const [code, n] of codes) {
    if (n > 1) {
      push({
        category: "DUPLICATE",
        severity: "critical",
        system: "register",
        entity: "DEFECT",
        recordRef: code,
        field: "defect_code",
        detail: `${n} defects share the reference code ${code} — codes must be unique across the division.`,
      });
    }
  }

  /* ---------- 4. Asset + geometry integrity ---------- */
  const segById = new Map(segRows.map((s) => [s.id, s]));
  const assetIds = new Set(assetRows.map((a) => a.id));
  for (const d of defectRows) {
    if (!assetIds.has(d.assetId)) {
      push({
        category: "INVALID_ASSET",
        severity: "critical",
        system: d.sourceSystem,
        entity: "DEFECT",
        recordRef: d.defectCode || `#${d.id}`,
        field: "asset_id",
        detail: `Defect references asset ${d.assetId}, which does not exist in the asset register (orphan row).`,
      });
    }
  }
  for (const s of stationRows) {
    const latOk = s.lat >= 6 && s.lat <= 37.5; // Indian subcontinent envelope
    const lngOk = s.lng >= 68 && s.lng <= 97.5;
    if (!latOk || !lngOk) {
      push({
        category: "INVALID_COORDINATE",
        severity: "critical",
        system: "network",
        entity: "STATION",
        recordRef: s.code,
        field: "lat/lng",
        detail: `Station ${s.code} (${s.name}) sits at ${s.lat}, ${s.lng} — outside the Indian Railways operating envelope.`,
      });
    }
  }
  for (const s of segRows) {
    const from = stationRows.find((x) => x.code === s.fromCode);
    const to = stationRows.find((x) => x.code === s.toCode);
    if (!from || !to) {
      push({
        category: "ORPHAN_REFERENCE",
        severity: "critical",
        system: "network",
        entity: "SEGMENT",
        recordRef: s.code,
        field: "from/to",
        detail: `Section ${s.code} references an unknown station code (${!from ? s.fromCode : s.toCode}).`,
      });
      continue;
    }
    const geo = haversineKm(from, to);
    if (Math.abs(geo - s.lengthKm) > Math.max(15, s.lengthKm * 0.6)) {
      push({
        category: "INVALID_COORDINATE",
        severity: "warning",
        system: "network",
        entity: "SEGMENT",
        recordRef: s.code,
        field: "length_km",
        detail: `Section ${s.code} declares ${s.lengthKm} km but its station geometry measures ${geo} km — geometry and route length disagree.`,
      });
    }
  }
  void segById;

  /* ---------- 5. Stale register (defects never touched) ---------- */
  const staleCut = Date.now() - 45 * 24 * 3600_000;
  const staleDefects = defectRows.filter((d) => d.detectedAt.getTime() < staleCut && d.status === "open" && d.lifecycleStatus === "REPORTED");
  for (const d of staleDefects.slice(0, 20)) {
    push({
      category: "STALE_RECORD",
      severity: "warning",
      system: d.sourceSystem,
      entity: "DEFECT",
      recordRef: d.defectCode || `#${d.id}`,
      field: "detected_at",
      detail: `Defect reported on ${d.detectedAt.toISOString().slice(0, 10)} is still in REPORTED — no one has reviewed it for ${Math.round((Date.now() - d.detectedAt.getTime()) / 86_400_000)} days.`,
    });
  }

  /* ---------- 6. Schema-mismatch check against the published contract -------- */
  for (const c of FEED_CONTRACTS) {
    const fields = Object.keys(c.schema);
    const sysRecords = records.filter((r) => r.system === c.system && r.status !== "DUPLICATE");
    if (sysRecords.length === 0) continue;
    const sample = sysRecords[0].payload ?? {};
    const missing = fields.filter((f) => !(f in sample));
    if (missing.length > 0) {
      push({
        category: "SCHEMA_MISMATCH",
        severity: "warning",
        system: c.system,
        entity: "CONTRACT",
        recordRef: c.contractVersion,
        field: missing.join(", "),
        detail: `${c.system} payload is missing declared contract field(s): ${missing.join(", ")} — the payload does not match ${c.contractVersion}.`,
      });
    }
  }

  const findingsSorted = findings.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
  const critical = findingsSorted.filter((f) => f.severity === "critical").length;
  const warning = findingsSorted.filter((f) => f.severity === "warning").length;
  const info = findingsSorted.filter((f) => f.severity === "info").length;

  const bySystem = FEED_CONTRACTS.map((c) => {
    const sys = records.filter((r) => r.system === c.system);
    const bad = sys.filter((r) => r.status !== "VALID").length;
    return {
      system: c.system,
      findings: findingsSorted.filter((f) => f.system === c.system || f.system.includes(c.system)).length,
      valid: sys.length - bad,
      invalid: bad,
      integrityPct: sys.length ? Math.round(((sys.length - bad) / sys.length) * 1000) / 10 : 0,
    };
  });

  const score = Math.max(0, Math.min(100, Math.round(100 - (critical * 2.5 + warning * 0.8 + info * 0.2))));

  return {
    generatedAt: new Date().toISOString(),
    score,
    totals: { findings: findingsSorted.length, critical, warning, info },
    /* Every monitored category is reported, including those that are currently
       clean (n = 0) — a quality desk that hides an unmonitored check cannot be
       audited, and "we checked and found nothing" is information too. */
    byCategory: (Object.keys(CATEGORY_LABEL) as QualityCategory[]).map((c) => ({
      category: c,
      label: CATEGORY_LABEL[c],
      n: findingsSorted.filter((f) => f.category === c).length,
    })),
    bySystem,
    findings: findingsSorted.slice(0, findingLimit),
    checked: {
      ingestRecords: records.length,
      defects: defectRows.length,
      assets: assetRows.length,
      segments: segRows.length,
      stations: stationRows.length,
      contracts: FEED_CONTRACTS.length,
    },
    note: "Findings are computed from the live tables on every load. Invalid records are quarantined in the integration hub and retained here — nothing is silently discarded.",
  };
}

/** Persist a snapshot so trends survive a page reload. */
export async function snapshotQuality() {
  const report = await qualityReport(40);
  await db.insert(usageLedger).values({
    kind: "QUALITY_SNAPSHOT",
    entity: "register",
    metrics: {
      score: report.score,
      findings: report.totals.findings,
      critical: report.totals.critical,
      warning: report.totals.warning,
      info: report.totals.info,
      ingestRecords: report.checked.ingestRecords,
    },
    data: { byCategory: report.byCategory, bySystem: report.bySystem } as unknown as Record<string, unknown>,
    note: `Data-quality snapshot — score ${report.score}, ${report.totals.findings} finding(s)`,
  });
  return report;
}

export async function qualityTrend(limit = 90) {
  const rows = await db.select().from(usageLedger).where(eq(usageLedger.kind, "QUALITY_SNAPSHOT")).orderBy(sql`at`).limit(limit);
  return rows.map((r) => ({ at: r.at.toISOString(), score: r.metrics.score ?? 0, findings: r.metrics.findings ?? 0, critical: r.metrics.critical ?? 0 }));
}

/**
 * Repair actions the monitor offers. Each one is narrow, reversible in
 * principle, and written to the audit trail with before/after values.
 */
export async function applyRepair(action: string, payload: Record<string, unknown>, actor: { name: string; role: string }) {
  if (action === "backfill_defect_code") {
    const id = Number(payload.defectId);
    const [d] = await db.select().from(defects).where(eq(defects.id, id));
    if (!d) throw new Error(`defect ${id} not found`);
    if (d.defectCode) throw new Error(`defect ${id} already carries ${d.defectCode}`);
    const [asset] = await db.select().from(assets).where(eq(assets.id, d.assetId));
    const [seg] = asset ? await db.select().from(segments).where(eq(segments.id, asset.segmentId)) : [];
    const year = new Date(d.detectedAt).getFullYear();
    const code = `DEF-${seg?.code ?? "DIVN"}-${year}-${String(id).padStart(3, "0")}`;
    await db.update(defects).set({ defectCode: code }).where(eq(defects.id, id));
    await recordAudit({
      actorName: actor.name,
      actorRole: actor.role,
      action: "MODIFIED",
      entity: "DEFECT",
      entityRef: `#${id}`,
      oldValue: { defectCode: "" },
      newValue: { defectCode: code },
      reason: "Data-quality repair: human reference code assigned to a legacy record",
      severity: "warn",
    });
    return { ok: true, defectId: id, defectCode: code };
  }
  throw new Error(`unknown repair action '${action}'`);
}
