import { db } from "@/db";
import { stations, segments, assets, defects, events, jobs, settings } from "@/db/schema";
import { FIELD_PHOTOS, STATIONS, SEGMENTS, mulberry32, project } from "./network";
import { formatDefectCode } from "./defectlifecycle";
import { defaultDueDays } from "./fieldreport";

const ENG_TYPES = [
  "Rail head – USFD zone",
  "Point & crossing (SEJ)",
  "Ballast section",
  "Track fastening cluster",
  "Girder bridge bearing",
  "Curve realignment zone",
];
const TRD_TYPES = [
  "OHE mast & cantilever",
  "Auto-tensioning device",
  "Insulator string",
  "Section insulator",
  "Feeder line junction",
  "Neutral section",
];
const SNT_TYPES = [
  "Point machine (220V)",
  "Track circuit section",
  "Colour-light signal",
  "Axle counter",
  "LC gate interlocking",
  "Data-logger node",
];

const ENG_DEFECTS = [
  "Rail crack indication (USFD OBS)",
  "Ballast fouling beyond limit",
  "SEJ gap exceeding tolerance",
  "Sleeper spacing irregularity",
  "Weld fracture (AT weld)",
  "Track twist > 3.6 mm/m",
  "Fastening corrosion cluster",
  "Bridge bearing seize-up",
];
const TRD_DEFECTS = [
  "OHE spark reported by loco (REMMLOT)",
  "ATD creep out of range",
  "Insulator flashover marks",
  "OHE stagger beyond limit",
  "Catenary sag due to heat",
  "Feeder voltage dip events",
  "Section insulator arcing",
];
const SNT_DEFECTS = [
  "Point machine obstructions",
  "Track circuit flicker (RDPMS)",
  "Signal aspect blanking",
  "Axle counter drift",
  "LC gate boom failure",
  "Data-logger packet loss",
  "Cable insulation degradation",
];

let seeding: Promise<void> | null = null;

/** Idempotent: seeds the Delhi NCR grid when empty. Safe under concurrent requests; self-heals after a DB reset. */
export function ensureSeeded(): Promise<void> {
  if (!seeding) {
    seeding = doSeed().finally(() => {
      seeding = null;
    });
  }
  return seeding;
}

async function doSeed() {
  const existing = await db.select({ id: stations.id }).from(stations).limit(1);
  if (existing.length > 0) return;

  const rng = mulberry32(2026027);

  // ---- stations (real lat/lng, projected x/y for the map) ----
  await db.insert(stations).values(
    STATIONS.map((s) => {
      const p = project(s.lat, s.lng);
      return {
        code: s.code,
        name: s.name,
        kind: s.kind,
        x: p.x,
        y: p.y,
        lat: s.lat,
        lng: s.lng,
        dailyTrains: s.dailyTrains,
        vipZone: s.vipZone,
      };
    })
  );

  // ---- segments ----
  const segRows = await db
    .insert(segments)
    .values(
      SEGMENTS.map((s) => ({
        code: s.code,
        fromCode: s.from,
        toCode: s.to,
        corridor: s.corridor,
        lengthKm: s.lengthKm,
        isBridge: !!s.isBridge,
        isLevelCrossing: !!s.isLevelCrossing,
        dailyTrains: s.dailyTrains,
        criticality: s.criticality,
        maxSpeed: s.maxSpeed,
      }))
    )
    .returning();

  const segByCode = new Map(segRows.map((r) => [r.code, r]));

  // ---- assets ----
  const assetValues: (typeof assets.$inferInsert)[] = [];
  for (const seg of SEGMENTS) {
    if (seg.corridor === "RRTS") continue; // NCRTC assets monitored separately (EMI handshake only)
    const segRow = segByCode.get(seg.code)!;
    const n = 2 + Math.floor(rng() * 2); // 2-3 assets per segment
    for (let i = 0; i < n; i++) {
      const dept = seg.corridor === "RRTS" && i === 0 ? "SNT" : (["ENG", "TRD", "SNT"] as const)[Math.floor(rng() * 3)];
      const types = dept === "ENG" ? ENG_TYPES : dept === "TRD" ? TRD_TYPES : SNT_TYPES;
      const sys = dept === "ENG" ? (rng() > 0.5 ? "TMS" : "ITMS") : dept === "TRD" ? "TDMS" : rng() > 0.5 ? "SMMS" : "RDPMS";
      assetValues.push({
        segmentId: segRow.id,
        department: dept,
        assetType: types[Math.floor(rng() * types.length)],
        label: `${types[Math.floor(rng() * types.length)]} @ km ${(rng() * seg.lengthKm).toFixed(1)} ${seg.code}`,
        health: Math.round(35 + rng() * 60),
        sourceSystem: sys,
      });
    }
  }
  const assetRows = await db.insert(assets).values(assetValues).returning();

  // ---- defects ----
  const defectValues: (typeof defects.$inferInsert)[] = [];
  /* ---- Smart Defect Lifecycle: stable DEF-<SECTION>-<YEAR>-<SEQ> ids and a
     realistic spread of stages, deadlines, priorities and recurrence history so
     the lifecycle board, urgency queue and recurrence detector have real data. */
  const seedYear = new Date().getFullYear();
  const seqBySection = new Map<string, number>();
  const codeByAssetId = new Map(assetRows.map((a) => [a.id, segRows.find((s) => s.id === a.segmentId)?.code ?? "UNK"]));
  function lifecycleFor(assetId: number, severity: number, overdueDays: number) {
    const sectionCode = codeByAssetId.get(assetId) ?? "UNK";
    const seq = (seqBySection.get(sectionCode) ?? 0) + 1;
    seqBySection.set(sectionCode, seq);
    const stagePick = rng();
    const stage =
      stagePick < 0.3
        ? "REPORTED"
        : stagePick < 0.45
          ? "UNDER_REVIEW"
          : stagePick < 0.55
            ? "VERIFIED"
            : stagePick < 0.7
              ? "AI_PRIORITIZED"
              : stagePick < 0.8
                ? "MAINTENANCE_REQUIRED"
                : stagePick < 0.88
                  ? "PLANNING"
                  : stagePick < 0.96
                    ? "BLOCK_PLANNED"
                    : "WORK_ASSIGNED";
    const occurrencePick = rng();
    const occurrences = occurrencePick > 0.86 ? 4 : occurrencePick > 0.7 ? 3 : occurrencePick > 0.5 ? 2 : 1;
    return {
      defectCode: formatDefectCode(sectionCode, seedYear, seq),
      lifecycleStatus: stage,
      dueInDays: defaultDueDays(severity) - overdueDays,
      priority: severity >= 9 ? "CRITICAL" : severity >= 7 ? "HIGH" : severity >= 5 ? "MEDIUM" : "LOW",
      occurrences,
      recurrenceBand: occurrences >= 4 ? "HIGH" : occurrences === 3 ? "MEDIUM" : occurrences === 2 ? "LOW" : "NONE",
      detailedInspection: stagePick > 0.6 && stagePick < 0.75,
    };
  }

  for (const a of assetRows) {
    const nDef = rng() > 0.55 ? 1 + Math.floor(rng() * 2) : rng() > 0.3 ? 1 : 0;
    for (let i = 0; i < nDef; i++) {
      const pool = a.department === "ENG" ? ENG_DEFECTS : a.department === "TRD" ? TRD_DEFECTS : SNT_DEFECTS;
      const remoteOk = a.department !== "ENG" || rng() > 0.7;
      const severity = Math.min(10, Math.max(1, Math.round(2 + rng() * 8)));
      const overdueDays = Math.floor(rng() * 38);
      defectValues.push({
        assetId: a.id,
        department: a.department,
        sourceSystem: a.sourceSystem,
        title: pool[Math.floor(rng() * pool.length)],
        severity,
        overdueDays,
        durationMin: 25 + Math.floor(rng() * 95),
        needsLineBlock: rng() > 0.15,
        needsPowerBlock: a.department === "TRD" ? rng() > 0.35 : rng() > 0.8,
        inspectionMode: remoteOk ? "either" : "physical",
        failureProb72h: Math.round((severity / 12 + rng() * 0.3) * 100) / 100,
        status: "open",
        ...lifecycleFor(a.id, severity, overdueDays),
      });
    }
  }
  // Guarantee meaningful watch-items on both Yamuna bridges (single points of failure)
  const bridgeAssets = assetRows.filter((a) => {
    const code = segRows.find((s) => s.id === a.segmentId)?.code;
    return code === "NZM-ANVT" || code === "DLI-DSA";
  });
  const engBridge = bridgeAssets.filter((a) => a.department === "ENG");
  const anchor = engBridge[0] ?? bridgeAssets[0];
  if (anchor) {
    const segCode = segRows.find((s) => s.id === anchor.segmentId)!.code;
    defectValues.push(
      {
        assetId: anchor.id, department: "ENG", sourceSystem: "ITMS",
        title: `Rail crack indication — USFD OBS @ km 4.2 (Yamuna Bridge ${segCode === "NZM-ANVT" ? "#2" : "#1"})`,
        severity: 10, overdueDays: 2, durationMin: 55, needsLineBlock: true, needsPowerBlock: false,
        inspectionMode: "physical", failureProb72h: 0.96, status: "open",
        defectCode: formatDefectCode(segCode, seedYear, (seqBySection.get(segCode) ?? 0) + 1),
        lifecycleStatus: "UNDER_REVIEW", priority: "CRITICAL", dueInDays: -1,
        occurrences: 4, recurrenceBand: "HIGH", detailedInspection: true,
      },
      {
        assetId: (engBridge[1] ?? anchor).id, department: "ENG", sourceSystem: "TMS",
        title: "Girder bearing seize-up — cold-weld watch",
        severity: 8, overdueDays: 11, durationMin: 75, needsLineBlock: true, needsPowerBlock: false,
        inspectionMode: "physical", failureProb72h: 0.7, status: "open",
        defectCode: formatDefectCode(segCode, seedYear, (seqBySection.get(segCode) ?? 0) + 2),
        lifecycleStatus: "AI_PRIORITIZED", priority: "CRITICAL", dueInDays: -7,
        occurrences: 3, recurrenceBand: "MEDIUM", detailedInspection: false,
      },
      {
        assetId: anchor.id, department: "SNT", sourceSystem: "RDPMS",
        title: "Track circuit flicker on bridge approach",
        severity: 8, overdueDays: 6, durationMin: 40, needsLineBlock: false, needsPowerBlock: false,
        inspectionMode: "either", failureProb72h: 0.62, status: "open",
        defectCode: formatDefectCode(segCode, seedYear, (seqBySection.get(segCode) ?? 0) + 3),
        lifecycleStatus: "MAINTENANCE_REQUIRED", priority: "HIGH", dueInDays: 2,
        occurrences: 2, recurrenceBand: "LOW", detailedInspection: true,
      }
    );
  }
  await db.insert(defects).values(defectValues);

  // ---- field work orders (5-step lifecycle demo set) ----
  const gpsOf = (code: string, f: number) => {
    const sg = SEGMENTS.find((x) => x.code === code)!;
    const pts = sg.geo;
    const i = Math.min(pts.length - 1, Math.floor(f * pts.length));
    return `${pts[i][0].toFixed(5)}, ${pts[i][1].toFixed(5)}`;
  };
  const hrsAgo = (h: number) => new Date(Date.now() - h * 3600_000);
  const segId = (code: string) => segByCode.get(code)!.id;
  // live overrun demo: the occupied block always shows ~25 min remaining
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const liveStart = Math.max(0, nowM - 100);
  const liveEnd = nowM + 25;

  await db.insert(jobs).values([
    {
      segmentId: segId("NZM-ANVT"), department: "ENG",
      title: "Rail crack indication — USFD OBS @ km 4.2 (Yamuna Bridge #2)",
      note: "Patroller flagged 9 mm head crack near girder approach. USFD trolley confirmation required.",
      chainage: "Km 1382.4/6 NZM–ANVT", status: "PENDING",
      reportPhoto: FIELD_PHOTOS.ENG.before, reportGps: gpsOf("NZM-ANVT", 0.25), reportAt: hrsAgo(3.2),
    },
    {
      segmentId: segId("DSA-ANVT"), department: "SNT",
      title: "Signal S-42 aspect blanking intermittently",
      note: "Up main starter goes dark in rain. Suspect lens cluster + ECR relay.",
      chainage: "Km 1386.1 DSA–ANVT", status: "PENDING",
      reportPhoto: FIELD_PHOTOS.SNT.before, reportGps: gpsOf("DSA-ANVT", 0.5), reportAt: hrsAgo(5.7),
    },
    {
      segmentId: segId("NDLS-NZM"), department: "ENG",
      title: "Track twist 3.8 mm/m near Tilak Bridge curve",
      note: "TRC run flagged twist beyond SdL. Packing + gauge rectification.",
      chainage: "Km 1380.2 NDLS–NZM", status: "ALLOTTED",
      teamLeader: "ENG-G7 — Ramesh Kumar", windowStart: 30, windowEnd: 170,
      reportPhoto: FIELD_PHOTOS.ENG.before, reportGps: gpsOf("NDLS-NZM", 0.4), reportAt: hrsAgo(9),
    },
    {
      segmentId: segId("ANVT-SBB"), department: "TRD",
      title: "Insulator flashover marks — OHE mast 5/117",
      note: "REMMLOT spark events logged by 3 locos. Disc replacement sanctioned.",
      chainage: "Km 1392.1 ANVT–SBB", status: "IN_PROGRESS",
      teamLeader: "TRD-OHE5 — Dinesh Singh", windowStart: liveStart, windowEnd: liveEnd,
      reportPhoto: FIELD_PHOTOS.TRD.before, reportGps: gpsOf("ANVT-SBB", 0.55), reportAt: hrsAgo(12),
      beforePhoto: FIELD_PHOTOS.TRD.before, beforeGps: gpsOf("ANVT-SBB", 0.55), beforeAt: hrsAgo(1.4),
    },
    {
      segmentId: segId("DLI-DSA"), department: "ENG",
      title: "AT weld fracture — Old Yamuna Bridge approach",
      note: "Weld B-17 fractured. New AT weld + grinding completed inside super-block.",
      chainage: "Km 1418.2 DLI–DSA", status: "AWAITING_REVIEW", isSuperBlock: true,
      teamLeader: "ENG-ATW3 — Prakash Mishra", windowStart: 30, windowEnd: 210,
      reportPhoto: FIELD_PHOTOS.ENG.before, reportGps: gpsOf("DLI-DSA", 0.45), reportAt: hrsAgo(16),
      beforePhoto: FIELD_PHOTOS.ENG.before, beforeGps: gpsOf("DLI-DSA", 0.45), beforeAt: hrsAgo(3.1),
      afterPhoto: FIELD_PHOTOS.ENG.after, afterGps: gpsOf("DLI-DSA", 0.451), afterAt: hrsAgo(0.8),
    },
    {
      segmentId: segId("SBB-GZB"), department: "TRD",
      title: "Disc insulator string replacement — portal 7/23",
      note: "Cracked 25 kV disc replaced; creepage path restored.",
      chainage: "Km 1398.7 SBB–GZB", status: "AWAITING_REVIEW", isSuperBlock: true,
      teamLeader: "TRD-PSI2 — Farooq Ahmed", windowStart: 30, windowEnd: 210,
      reportPhoto: FIELD_PHOTOS.TRD.before, reportGps: gpsOf("SBB-GZB", 0.4), reportAt: hrsAgo(20),
      beforePhoto: FIELD_PHOTOS.TRD.before, beforeGps: gpsOf("SBB-GZB", 0.4), beforeAt: hrsAgo(3.4),
      afterPhoto: FIELD_PHOTOS.TRD.after, afterGps: gpsOf("SBB-GZB", 0.402), afterAt: hrsAgo(1.1),
    },
    {
      segmentId: segId("NZM-ANVT"), department: "SNT",
      title: "Track circuit A-18 flicker — battery link cell swap",
      note: "RDPMS logged 41 flickers in 24 h. Link cells swapped, relay QSPA1 re-seated.",
      chainage: "Km 1384.9 NZM–ANVT", status: "AWAITING_REVIEW",
      teamLeader: "SNT-TC1 — Bhupesh Kumar", windowStart: 30, windowEnd: 150,
      reportPhoto: FIELD_PHOTOS.SNT.before, reportGps: gpsOf("NZM-ANVT", 0.6), reportAt: hrsAgo(26),
      beforePhoto: FIELD_PHOTOS.SNT.before, beforeGps: gpsOf("NZM-ANVT", 0.6), beforeAt: hrsAgo(2.9),
      afterPhoto: FIELD_PHOTOS.SNT.after, afterGps: gpsOf("NZM-ANVT", 0.602), afterAt: hrsAgo(1.6),
    },
    {
      segmentId: segId("FDB-PWL"), department: "ENG",
      title: "Ballast screening km 1462–1464 (completed)",
      note: "Deep screening + tamping finished, TSR lifted.",
      chainage: "Km 1462.0–1464.0 FDB–PWL", status: "COMPLETED",
      teamLeader: "ENG-G12 — Surendra Yadav", windowStart: 35, windowEnd: 240, reviewNote: "Accepted — formation profile verified.",
      reportPhoto: FIELD_PHOTOS.ENG.before, reportGps: gpsOf("FDB-PWL", 0.5), reportAt: hrsAgo(52),
      beforePhoto: FIELD_PHOTOS.ENG.before, beforeGps: gpsOf("FDB-PWL", 0.5), beforeAt: hrsAgo(30),
      afterPhoto: FIELD_PHOTOS.ENG.after, afterGps: gpsOf("FDB-PWL", 0.502), afterAt: hrsAgo(26),
    },
  ]);

  // ---- settings ----
  await db.insert(settings).values([
    { key: "fogMode", value: "false" },
    { key: "vipAlert", value: "false" },
    { key: "dtpRedZone", value: "true" },
    { key: "planStatus", value: "PROPOSED" },
  ]);

  // ---- events ----
  await db.insert(events).values([
    { kind: "ai", message: "RAIL RAKSHAK core online — departmental feeds connected: TMS, SMMS, TDMS contracts live (NR Delhi Division)" },
    { kind: "info", message: "COA corridor availability feed synchronized — 19 IR sections + 4 NCRTC RRTS sections, Delhi NCR grid" },
    { kind: "warn", message: "ITMS reports rail crack indication @ km 4.2 NZM–ANVT (Yamuna Bridge #2) — USFD OBS watch" },
    { kind: "info", message: "NTES live feed locked: 12951 Mumbai Rajdhani, 12301 Howrah Rajdhani & 22 more trains tracked" },
    { kind: "info", message: "FOIS forecast ingested: DFCL-9001 super-heavy (10.2k T) + 2 rakes in next 24 h via TKD" },
  ]);
}
