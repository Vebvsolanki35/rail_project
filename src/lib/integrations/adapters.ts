/**
 * DATA INTEGRATION HUB — SOURCE ADAPTERS  (Phase 1)
 *
 * ============================ DATA HONESTY ============================
 * Real TMS / SMMS / TDMS / COA / FOIS / TIMETABLE / IMD operational data is
 * NOT publicly available to this prototype, and no authorised integration
 * exists. Every adapter below therefore runs in DEMO transport mode and is
 * labelled `simulated: true` — the UI renders "SIMULATED / DEMO DATA" straight
 * from that flag so the label can never drift from the truth.
 *
 * The adapter CONTRACT, however, is the production one: `pull()` returns the
 * exact payload shape the departmental endpoint would return, `normalize()`
 * maps it into `NormalizedRecord`, and the hub persists both. Replacing a demo
 * transport with an authorised production connector means implementing
 * `Transport` for that system and flipping `simulated` to false — no change to
 * the normaliser, the hub, the optimiser or the UI.
 * ======================================================================
 */
import { db } from "@/db";
import { assets, defects, segments } from "@/db/schema";
import { mulberry32, SEGMENTS, STATIONS, TRAINS } from "@/lib/engine/network";

/** Normalized shape every source resolves to before it is persisted. */
export interface NormalizedRecord {
  system: FeedSystem;
  sourceRef: string;
  entity: "DEFECT" | "ASSET" | "OHE" | "CORRIDOR" | "RAKE" | "TIMETABLE" | "WEATHER";
  sectionHint: string;
  segmentId: number | null;
  assetId: number | null;
  department: string;
  severity: number;
  quantity: number;
  observedAt: string;
  payload: Record<string, unknown>;
  /** Validation outcome — bad records are recorded, never silently dropped. */
  issues: string[];
}

export type FeedSystem = "TMS" | "SMMS" | "TDMS" | "COA" | "FOIS" | "TIMETABLE" | "IMD";

export interface FeedContract {
  system: FeedSystem;
  domain: string;
  /** Documented production endpoint. Not called in demo transport mode. */
  endpoint: string;
  method: "REST/JSON" | "KAFKA" | "SCADA-POLL" | "FILE-EXCHANGE";
  contractVersion: string;
  frequencySec: number;
  /** Rows this contract yields per cycle, before validation. */
  expectedRecords: number;
  schema: Record<string, string>;
}

export const FEED_CONTRACTS: FeedContract[] = [
  {
    system: "TMS",
    domain: "Track Management — defects, USFD readings, TRC geometry",
    endpoint: "https://tms.icf.intranet/api/v1/defects?division=DLI",
    method: "REST/JSON",
    contractVersion: "tms-defects.v3",
    frequencySec: 300,
    expectedRecords: 47,
    schema: { defect_id: "uuid", km_from: "float", km_to: "float", type: "enum", severity: "int 1-10", detected_at: "iso8601" },
  },
  {
    system: "TDMS",
    domain: "Traction Distribution — OHE tension, mast health, SCADA events",
    endpoint: "https://tdms.remmlot.intranet/api/v2/ohe/alerts",
    method: "SCADA-POLL",
    contractVersion: "tdms-ohe.v2",
    frequencySec: 120,
    expectedRecords: 38,
    schema: { mast_no: "string", tension_kn: "float", spark_events_24h: "int", insulator_cond: "enum", ts: "iso8601" },
  },
  {
    system: "SMMS",
    domain: "Signal & Telecom — RDPMS diagnostics, point machines, track circuits",
    endpoint: "https://smms.intranet/rdpms/api/v1/status",
    method: "KAFKA",
    contractVersion: "smms-rdpms.v4",
    frequencySec: 60,
    expectedRecords: 52,
    schema: { asset_uid: "string", kind: "enum(POINT,TC,SIGNAL,AXLE)", health: "float 0-100", flicker_count: "int", ts: "iso8601" },
  },
  {
    system: "COA",
    domain: "Control Office — block corridors, live train graph, corridor availability",
    endpoint: "https://coa.nr.intranet/api/v1/corridor/dli",
    method: "REST/JSON",
    contractVersion: "coa-corridor.v5",
    frequencySec: 30,
    expectedRecords: 23,
    schema: { section: "string", state: "enum(GREEN,YELLOW,RED)", next_vacuum_min: "int", active_tsr: "array" },
  },
  {
    system: "FOIS",
    domain: "Freight Operations — rakes, tonnage, Control-Office goods-train forecast",
    endpoint: "https://fois.intranet/api/v1/rakes?zone=NR&horizon=24h",
    method: "REST/JSON",
    contractVersion: "fois-rakes.v2",
    frequencySec: 600,
    expectedRecords: 14,
    schema: { rake_id: "string", tonnage_t: "int", path: "string[]", eta_min: "int", priority: "int" },
  },
  {
    system: "TIMETABLE",
    domain: "Timetable — working timetable, train paths and section occupancy envelopes",
    endpoint: "https://timetable.intranet/api/v1/working/2026",
    method: "FILE-EXCHANGE",
    contractVersion: "wtt-2026.1",
    frequencySec: 86400,
    expectedRecords: 14,
    schema: { train_no: "string", name: "string", dep_min: "int", legs: "string[]", runs_per_day: "int" },
  },
  {
    system: "IMD",
    domain: "Weather — visibility, fog probability, temperature for fog physics",
    endpoint: "https://mausam.imd.gov.in/api/nowcast/delhi-ncr",
    method: "REST/JSON",
    contractVersion: "imd-nowcast.v1",
    frequencySec: 900,
    expectedRecords: 1,
    schema: { visibility_m: "int", fog_prob: "float", humidity: "int", temp_c: "float" },
  },
];

export function contractFor(system: string): FeedContract | null {
  return FEED_CONTRACTS.find((c) => c.system === system.toUpperCase()) ?? null;
}

/* ------------------------------------------------------------------ */
/*  Transport                                                          */
/* ------------------------------------------------------------------ */

/** Production connectors implement this against the departmental endpoint. */
export interface Transport {
  simulated: boolean;
  pull(contract: FeedContract, ctx: AdapterContext): Promise<RawRecord[]>;
}

export interface AdapterContext {
  /** Stable cycle seed — makes an ingestion cycle reproducible. */
  seed: number;
  now: Date;
  fogMode: boolean;
  segByCode: Map<string, { id: number; code: string; corridor: string; fromCode: string; toCode: string; dailyTrains: number; criticality: number }>;
  /** Live defect rows, so TMS/TDMS/SMMS records reference real work. */
  openDefects: { id: number; defectCode: string; title: string; department: string; severity: number; durationMin: number; assetId: number; segmentCode: string; lifecycleStatus: string }[];
}

export type RawRecord = Record<string, unknown>;

/**
 * DEMO TRANSPORT — deterministic synthetic payloads.
 *
 * Records are derived from the seeded network and the live defect register, so
 * the hub's counts move with the real state of the division instead of being a
 * fixed decorative number. A small number of structurally-broken records are
 * injected on purpose: they exercise the data-quality monitor (Phase 17) and
 * prove that bad input is quarantined rather than silently discarded.
 */
class DemoTransport implements Transport {
  simulated = true;

  async pull(contract: FeedContract, ctx: AdapterContext): Promise<RawRecord[]> {
    const rng = mulberry32(ctx.seed + contract.system.length * 7919);
    const segs = [...ctx.segByCode.values()];
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
    const out: RawRecord[] = [];
    const iso = (offsetMin: number) => new Date(ctx.now.getTime() - offsetMin * 60_000).toISOString();

    switch (contract.system) {
      case "TMS": {
        for (const d of ctx.openDefects.filter((x) => x.department === "ENG")) {
          out.push({
            defect_id: `TMS-${d.defectCode || d.id}`,
            km_from: Math.round((3 + rng() * 120) * 10) / 10,
            km_to: Math.round((5 + rng() * 130) * 10) / 10,
            type: d.severity >= 8 ? "RAIL_CRACK" : pick(["TWIST", "BALLAST", "WELD_CRACK", "SLEEPER"]),
            severity: d.severity,
            section: d.segmentCode,
            detected_at: iso(Math.floor(rng() * 200)),
            __link: { defectId: d.id, defectCode: d.defectCode },
          });
        }
        // USFD / geometry rows with no defect behind them yet (pure track readings)
        for (let i = 0; i < Math.max(0, contract.expectedRecords - out.length - 3); i++) {
          const s = pick(segs);
          out.push({
            defect_id: `TMS-SURVEY-${1000 + i}`,
            km_from: Math.round(rng() * 140 * 10) / 10,
            km_to: null,
            type: "TRC_GEOMETRY",
            severity: 1 + Math.floor(rng() * 3),
            section: s.code,
            detected_at: iso(Math.floor(rng() * 400)),
          });
        }
        // Deliberate integrity faults (see transport doc comment)
        out.push({ defect_id: "TMS-BROKEN-01", km_from: 12.4, km_to: 12.9, type: "RAIL_CRACK", severity: null, section: "NZM-ANVT", detected_at: iso(30) });
        out.push({ defect_id: "TMS-BROKEN-02", km_from: null, km_to: 44.1, type: "TWIST", severity: 7, section: "UNKNOWN-SECTION", detected_at: iso(90) });
        // duplicate of an already-emitted row (same natural key)
        if (out.length > 1) out.push({ ...out[0], __duplicateOf: out[0].defect_id });
        return out;
      }

      case "TDMS": {
        for (const d of ctx.openDefects.filter((x) => x.department === "TRD")) {
          out.push({
            mast_no: `M-${d.segmentCode}-${100 + d.id % 900}`,
            tension_kn: Math.round((9 + rng() * 6) * 10) / 10,
            spark_events_24h: Math.floor(rng() * 9),
            insulator_cond: d.severity >= 8 ? pick(["CRACKED", "CRAZED"]) : "OK",
            section: d.segmentCode,
            severity: d.severity,
            ts: iso(Math.floor(rng() * 120)),
            __link: { defectId: d.id, defectCode: d.defectCode },
          });
        }
        for (let i = 0; i < Math.max(0, contract.expectedRecords - out.length - 1); i++) {
          const s = pick(segs);
          out.push({
            mast_no: `M-${s.code}-${200 + i}`,
            tension_kn: Math.round((8 + rng() * 8) * 10) / 10,
            spark_events_24h: Math.floor(rng() * 4),
            insulator_cond: "OK",
            section: s.code,
            ts: iso(Math.floor(rng() * 300)),
          });
        }
        out.push({ mast_no: "M-BAD-01", tension_kn: null, spark_events_24h: 2, insulator_cond: "OK", section: "GZB-TKD", ts: iso(10) });
        return out;
      }

      case "SMMS": {
        for (const d of ctx.openDefects.filter((x) => x.department === "SNT")) {
          out.push({
            asset_uid: `SMMS-${d.defectCode || d.id}`,
            kind: pick(["POINT", "TC", "SIGNAL", "AXLE"]),
            health: Math.max(20, 100 - d.severity * 6 - Math.floor(rng() * 8)),
            flicker_count: Math.floor(rng() * 14),
            section: d.segmentCode,
            severity: d.severity,
            ts: iso(Math.floor(rng() * 90)),
            __link: { defectId: d.id, defectCode: d.defectCode },
          });
        }
        for (let i = 0; i < Math.max(0, contract.expectedRecords - out.length - 2); i++) {
          const s = pick(segs);
          out.push({
            asset_uid: `SMMS-${s.code}-${300 + i}`,
            kind: pick(["POINT", "TC", "SIGNAL", "AXLE"]),
            health: Math.round(72 + rng() * 26),
            flicker_count: Math.floor(rng() * 4),
            section: s.code,
            ts: iso(Math.floor(rng() * 600)),
          });
        }
        out.push({ asset_uid: "SMMS-BAD-01", kind: "POINT", health: 140, flicker_count: 0, section: "NDLS-NZM", ts: iso(5) }); // health out of range
        out.push({ asset_uid: "SMMS-STALE-01", kind: "TC", health: 81, flicker_count: 0, section: "NDLS-NZM", ts: new Date(ctx.now.getTime() - 26 * 3600_000).toISOString() }); // stale
        return out;
      }

      case "COA": {
        for (const s of segs) {
          const load = s.dailyTrains / 300;
          out.push({
            section: s.code,
            state: s.dailyTrains > 240 ? "RED" : s.dailyTrains > 160 ? "YELLOW" : "GREEN",
            next_vacuum_min: Math.round(30 + rng() * 150),
            active_tsr: rng() > 0.82 ? [{ km: Math.round(rng() * 120), speed_kph: pick([30, 50, 75]) }] : [],
            occupancy_pct: Math.round(load * 1000) / 10,
            corridor: s.corridor,
            __segmentId: s.id,
          });
        }
        // duplicate corridor row (same section twice in one cycle)
        if (out.length > 0) out.push({ ...out[0] });
        return out;
      }

      case "FOIS": {
        const rakes = ["DFCL-9001", "BOXN-4412", "BOXNHL-2211", "BCN-8890", "BOXNS-1102"];
        for (let i = 0; i < contract.expectedRecords; i++) {
          const s = pick(segs.filter((x) => x.dailyTrains < 300));
          const heavy = i === 0;
          out.push({
            rake_id: rakes[i % rakes.length] + (i >= rakes.length ? `-${i}` : ""),
            tonnage_t: heavy ? 10200 : Math.round(2400 + rng() * 4200),
            path: [s.fromCode, s.toCode],
            section: s.code,
            eta_min: Math.round(rng() * 1440),
            priority: heavy ? 1 : 2 + Math.floor(rng() * 3),
            is_surge: rng() < 0.18,
            confidence: Math.round((0.62 + rng() * 0.34) * 100) / 100,
            __segmentId: s.id,
          });
        }
        out.push({ rake_id: "BROKEN-RAKE", tonnage_t: null, path: [], section: "NO-SUCH-SECTION", eta_min: -12, priority: 9 }); // impossible ETA + unknown section
        return out;
      }

      case "TIMETABLE": {
        for (const t of TRAINS) {
          out.push({
            train_no: t.number,
            name: t.name,
            kind: t.kind,
            dep_min: t.depMin,
            runs_per_day: t.runs,
            priority: t.priority,
            legs: t.legs.map((l) => l.seg),
            __segments: t.legs.map((l) => l.seg),
          });
        }
        return out;
      }

      case "IMD": {
        const month = ctx.now.getMonth();
        const fogSeason = month >= 10 || month <= 1;
        const visibility = ctx.fogMode ? 35 : fogSeason ? 260 : 3100;
        out.push({
          station: "DELHI-NCR",
          visibility_m: visibility,
          fog_prob: ctx.fogMode ? 0.94 : fogSeason ? 0.41 : 0.06,
          humidity: ctx.fogMode ? 97 : fogSeason ? 88 : 52,
          temp_c: ctx.fogMode ? 7 : fogSeason ? 12 : 29,
          rain_mm: rng() < 0.2 ? Math.round(rng() * 9 * 10) / 10 : 0,
          observed_at: ctx.now.toISOString(),
        });
        return out;
      }
    }
    return out;
  }
}

export const TRANSPORTS: Record<string, Transport> = FEED_CONTRACTS.reduce((acc, c) => {
  acc[c.system] = new DemoTransport();
  return acc;
}, {} as Record<string, Transport>);

/* ------------------------------------------------------------------ */
/*  Normalisation — raw payload → NormalizedRecord (with issues)        */
/* ------------------------------------------------------------------ */

const STALE_SEC = 12 * 3600;

export function normalize(contract: FeedContract, raw: RawRecord, ctx: AdapterContext, seen: Set<string>): NormalizedRecord | null {
  const issues: string[] = [];
  const seg = (code: unknown) => {
    if (typeof code !== "string") return null;
    for (const s of ctx.segByCode.values()) {
      if (s.code === code || s.fromCode === code || s.toCode === code) return s;
    }
    return null;
  };
  const num = (v: unknown, min?: number, max?: number, field = "") => {
    if (v === null || v === undefined || v === "") {
      issues.push(`missing field: ${field}`);
      return null;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      issues.push(`invalid number: ${field}`);
      return null;
    }
    if (min !== undefined && n < min) issues.push(`${field} below range (${n} < ${min})`);
    if (max !== undefined && n > max) issues.push(`${field} above range (${n} > ${max})`);
    return n;
  };

  const base = { system: contract.system, issues, observedAt: ctx.now.toISOString() } as Pick<NormalizedRecord, "system" | "issues" | "observedAt">;

  switch (contract.system) {
    case "TMS": {
      const se = seg(raw.section);
      const severity = num(raw.severity, 1, 10, "severity");
      const kmFrom = num(raw.km_from, 0, 140, "km_from");
      if (!se) issues.push(`unknown section: ${String(raw.section ?? "—")}`);
      const link = raw.__link as { defectId: number; defectCode: string } | undefined;
      const ref = `TMS:${String(raw.defect_id)}`;
      if (seen.has(ref)) issues.push("duplicate record in the same cycle");
      seen.add(ref);
      return {
        ...base,
        sourceRef: String(raw.defect_id),
        entity: "DEFECT",
        sectionHint: se?.code ?? String(raw.section ?? ""),
        segmentId: se?.id ?? null,
        assetId: null,
        department: "ENG",
        severity: severity ?? 0,
        quantity: kmFrom ?? 0,
        payload: { ...raw, linkedDefectId: link?.defectId ?? null, defectCode: link?.defectCode ?? null, kind: "track" },
        issues,
      };
    }
    case "TDMS": {
      const se = seg(raw.section);
      const tension = num(raw.tension_kn, 6, 16, "tension_kn");
      if (!se) issues.push(`unknown section: ${String(raw.section ?? "—")}`);
      const link = raw.__link as { defectId: number } | undefined;
      const ref = `TDMS:${String(raw.mast_no)}`;
      if (seen.has(ref)) issues.push("duplicate record in the same cycle");
      seen.add(ref);
      return {
        ...base,
        sourceRef: String(raw.mast_no),
        entity: "OHE",
        sectionHint: se?.code ?? String(raw.section ?? ""),
        segmentId: se?.id ?? null,
        assetId: null,
        department: "TRD",
        severity: raw.insulator_cond === "OK" ? 2 : 7,
        quantity: tension ?? 0,
        payload: { ...raw, linkedDefectId: link?.defectId ?? null, kind: "ohe" },
        issues,
      };
    }
    case "SMMS": {
      const se = seg(raw.section);
      const health = num(raw.health, 0, 100, "health");
      const ts = typeof raw.ts === "string" ? new Date(raw.ts).getTime() : NaN;
      if (Number.isFinite(ts) && (ctx.now.getTime() - ts) / 1000 > STALE_SEC) issues.push("stale record: older than 12 h");
      if (!se) issues.push(`unknown section: ${String(raw.section ?? "—")}`);
      const link = raw.__link as { defectId: number } | undefined;
      const ref = `SMMS:${String(raw.asset_uid)}`;
      if (seen.has(ref)) issues.push("duplicate record in the same cycle");
      seen.add(ref);
      return {
        ...base,
        sourceRef: String(raw.asset_uid),
        entity: "ASSET",
        sectionHint: se?.code ?? String(raw.section ?? ""),
        segmentId: se?.id ?? null,
        assetId: null,
        department: "SNT",
        severity: health === null ? 0 : Math.max(1, Math.round((100 - health) / 10)),
        quantity: health ?? 0,
        payload: { ...raw, linkedDefectId: link?.defectId ?? null, kind: "signal" },
        issues,
      };
    }
    case "COA": {
      const se = seg(raw.section);
      if (!se) issues.push(`unknown section: ${String(raw.section ?? "—")}`);
      const ref = `COA:${String(raw.section)}`;
      if (seen.has(ref)) issues.push("duplicate record in the same cycle");
      seen.add(ref);
      const vac = num(raw.next_vacuum_min, 0, 600, "next_vacuum_min");
      return {
        ...base,
        sourceRef: String(raw.section),
        entity: "CORRIDOR",
        sectionHint: se?.code ?? String(raw.section ?? ""),
        segmentId: se?.id ?? null,
        assetId: null,
        department: "OPS",
        severity: raw.state === "RED" ? 8 : raw.state === "YELLOW" ? 5 : 2,
        quantity: vac ?? 0,
        payload: { ...raw },
        issues,
      };
    }
    case "FOIS": {
      const se = seg(raw.section);
      const tons = num(raw.tonnage_t, 100, 15000, "tonnage_t");
      const eta = num(raw.eta_min, 0, 1440, "eta_min");
      if (!se) issues.push(`unknown section: ${String(raw.section ?? "—")}`);
      const ref = `FOIS:${String(raw.rake_id)}`;
      if (seen.has(ref)) issues.push("duplicate record in the same cycle");
      seen.add(ref);
      return {
        ...base,
        sourceRef: String(raw.rake_id),
        entity: "RAKE",
        sectionHint: se?.code ?? String(raw.section ?? ""),
        segmentId: se?.id ?? null,
        assetId: null,
        department: "OPS",
        severity: Number(raw.priority) <= 1 ? 8 : 4,
        quantity: tons ?? 0,
        payload: { ...raw, etaMin: eta ?? null, isSurge: !!raw.is_surge },
        issues,
      };
    }
    case "TIMETABLE": {
      const ref = `TT:${String(raw.train_no)}`;
      if (seen.has(ref)) issues.push("duplicate record in the same cycle");
      seen.add(ref);
      const dep = num(raw.dep_min, 0, 1439, "dep_min");
      return {
        ...base,
        sourceRef: String(raw.train_no),
        entity: "TIMETABLE",
        sectionHint: "",
        segmentId: null,
        assetId: null,
        department: "OPS",
        severity: Number(raw.priority ?? 5),
        quantity: Number(raw.runs_per_day ?? 1),
        payload: { ...raw, depMin: dep },
        issues,
      };
    }
    case "IMD": {
      const vis = num(raw.visibility_m, 20, 8000, "visibility_m");
      if (vis !== null && vis < 200) issues.push(`low visibility advisory: ${vis} m — fog restrictions apply`);
      return {
        ...base,
        sourceRef: "IMD:DELHI-NCR",
        entity: "WEATHER",
        sectionHint: "",
        segmentId: null,
        assetId: null,
        department: "OPS",
        severity: vis !== null && vis < 200 ? 7 : 2,
        quantity: vis ?? 0,
        payload: { ...raw },
        issues,
      };
    }
  }
  return null;
}

/** USFD-style section survey rows carry no defect link — the hub still stores them. */
export async function loadAdapterContext(seed: number, fogMode: boolean): Promise<AdapterContext> {
  const [segRows, defectRows, assetRows] = await Promise.all([
    db.select().from(segments),
    db.select().from(defects),
    db.select().from(assets),
  ]);
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const segById = new Map(segRows.map((s) => [s.id, s]));
  return {
    seed,
    now: new Date(),
    fogMode,
    segByCode: new Map(segRows.map((s) => [s.code, { id: s.id, code: s.code, corridor: s.corridor, fromCode: s.fromCode, toCode: s.toCode, dailyTrains: s.dailyTrains, criticality: s.criticality }])),
    openDefects: defectRows
      .filter((d) => d.status !== "closed")
      .map((d) => ({
        id: d.id,
        defectCode: d.defectCode,
        title: d.title,
        department: d.department,
        severity: d.severity,
        durationMin: d.durationMin,
        assetId: d.assetId,
        segmentCode: segById.get(assetById.get(d.assetId)?.segmentId ?? -1)?.code ?? "",
        lifecycleStatus: d.lifecycleStatus,
      })),
  };
}

/** Reference data the hub can show without running a cycle. */
export function networkReference() {
  return { segments: SEGMENTS.length, stations: STATIONS.length, trains: TRAINS.length };
}

export const __testing = { STALE_SEC };
