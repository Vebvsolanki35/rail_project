/**
 * INGESTION HUB (Phase 1) — run a contract cycle, normalise, persist, grade.
 *
 * One cycle = transport pull → normalise → validate → persist `ingest_records`
 * + one `feed_syncs` row carrying the integrity proof (records, valid/invalid,
 * duplicates, checksum, duration, freshness).
 *
 * Invalid rows are QUARANTINED, never dropped: they stay in `ingest_records`
 * with status INVALID and a machine-readable issue list, and they surface in
 * Data Quality (Phase 17).
 */
import { db } from "@/db";
import { feedSyncs, ingestRecords } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  FEED_CONTRACTS,
  TRANSPORTS,
  contractFor,
  loadAdapterContext,
  normalize,
  type FeedContract,
  type FeedSystem,
  type NormalizedRecord,
} from "@/lib/integrations/adapters";
import { getSettings } from "@/lib/engine/state";
import { recordAudit } from "@/lib/engine/audittrail";

export interface CycleResult {
  system: FeedSystem;
  domain: string;
  endpoint: string;
  transport: string;
  contractVersion: string;
  simulated: true;
  state: "CONNECTED" | "DEGRADED" | "STALE" | "DISCONNECTED";
  records: number;
  valid: number;
  invalid: number;
  duplicates: number;
  durationMs: number;
  checksum: string;
  freshnessSec: number;
  issues: { ref: string; issues: string[] }[];
  syncedAt: string;
}

/** FNV-1a over the payload — an integrity proof of what was actually read. */
export function checksumOf(rows: unknown[]): string {
  const s = JSON.stringify(rows);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a:${h.toString(16).padStart(8, "0")}`;
}

export function gradeState(valid: number, records: number, freshnessSec: number, freq: number): CycleResult["state"] {
  if (records === 0) return "DISCONNECTED";
  const invalidShare = records === 0 ? 0 : (records - valid) / records;
  if (invalidShare > 0.25) return "DEGRADED";
  if (freshnessSec > freq * 6) return "STALE";
  if (invalidShare > 0.08) return "DEGRADED";
  return "CONNECTED";
}

/** Run one ingestion cycle for a single system. */
export async function runCycle(system: string): Promise<CycleResult> {
  const contract = contractFor(system);
  if (!contract) throw new Error(`unknown system '${system}'`);
  const settings = await getSettings();
  const seed = Math.floor(Date.now() / 60_000); // stable within a minute
  const ctx = await loadAdapterContext(seed, settings.fogMode);
  const transport = TRANSPORTS[contract.system];

  const t0 = Date.now();
  const raw = await transport.pull(contract, ctx);
  const durationMs = Math.max(1, Date.now() - t0);

  const seen = new Set<string>();
  const normalized: NormalizedRecord[] = [];
  for (const r of raw) {
    const n = normalize(contract, r, ctx, seen);
    if (n) normalized.push(n);
  }
  const duplicates = normalized.filter((n) => n.issues.some((i) => i.startsWith("duplicate"))).length;
  const invalid = normalized.filter((n) => n.issues.some((i) => !i.startsWith("low visibility"))).length;
  const hardInvalid = normalized.filter((n) => n.issues.some((i) => !i.startsWith("low visibility") && !i.startsWith("stale"))).length;
  const valid = normalized.length - invalid;
  const checksum = checksumOf(raw);
  const freshnessSec = Math.round((Date.now() - ctx.now.getTime()) / 1000);
  const state = gradeState(valid, normalized.length, freshnessSec, contract.frequencySec);

  const [sync] = await db
    .insert(feedSyncs)
    .values({
      system: contract.system,
      domain: contract.domain,
      endpoint: contract.endpoint,
      transport: contract.method,
      contractVersion: contract.contractVersion,
      state,
      simulated: true,
      records: normalized.length,
      validRecords: valid,
      invalidRecords: invalid,
      quarantined: hardInvalid,
      duplicates,
      durationMs,
      checksum,
      freshnessSec,
    })
    .returning();

  if (normalized.length > 0) {
    await db.insert(ingestRecords).values(
      normalized.map((n) => ({
        syncId: sync.id,
        system: n.system,
        sourceRef: n.sourceRef,
        entity: n.entity,
        sectionHint: n.sectionHint,
        segmentId: n.segmentId,
        assetId: n.assetId,
        department: n.department,
        severity: n.severity,
        quantity: n.quantity,
        payload: n.payload,
        status: n.issues.some((i) => i.startsWith("duplicate"))
          ? "DUPLICATE"
          : n.issues.some((i) => i.startsWith("stale"))
            ? "QUARANTINED"
            : n.issues.length > 0 && !n.issues.some((i) => i.startsWith("low visibility"))
              ? "INVALID"
              : "VALID",
        issues: n.issues,
        observedAt: new Date(n.observedAt),
      }))
    );
  }

  await recordAudit({
    actorName: "Integration Hub",
    actorRole: "SYSTEM",
    action: "FEED_SYNC",
    entity: "FEED",
    entityRef: contract.system,
    newValue: { valid, invalid, duplicates, state, checksum },
    reason: `${contract.contractVersion} cycle — ${valid}/${normalized.length} records valid`,
    severity: state === "CONNECTED" ? "info" : state === "STALE" ? "warn" : "warn",
  });

  return {
    system: contract.system,
    domain: contract.domain,
    endpoint: contract.endpoint,
    transport: contract.method,
    contractVersion: contract.contractVersion,
    simulated: true,
    state,
    records: normalized.length,
    valid,
    invalid,
    duplicates,
    durationMs,
    checksum,
    freshnessSec,
    issues: normalized.filter((n) => n.issues.length > 0).map((n) => ({ ref: n.sourceRef, issues: n.issues })),
    syncedAt: sync.syncedAt.toISOString(),
  };
}

/** Run every contract — the "sync all feeds" action. */
export async function runAllCycles(): Promise<CycleResult[]> {
  const out: CycleResult[] = [];
  for (const c of FEED_CONTRACTS) out.push(await runCycle(c.system));
  return out;
}

/** Latest cycle per system + the contract metadata the hub renders. */
export interface FeedStatus {
  system: FeedSystem;
  domain: string;
  endpoint: string;
  transport: string;
  contractVersion: string;
  frequencySec: number;
  schema: Record<string, string>;
  simulated: boolean;
  lastSync: string | null;
  ageSec: number | null;
  state: CycleResult["state"];
  records: number;
  valid: number;
  invalid: number;
  duplicates: number;
  quarantined: number;
  durationMs: number;
  checksum: string;
  freshness: string;
}

export function freshnessLabel(ageSec: number | null, freq: number): string {
  if (ageSec === null) return "never synced";
  if (ageSec < 60) return `${ageSec}s ago`;
  if (ageSec < 3600) return `${Math.round(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.round(ageSec / 3600)}h ago`;
  void freq;
  return `${Math.round(ageSec / 86400)}d ago`;
}

export async function feedStatus(): Promise<FeedStatus[]> {
  const rows = await db.select().from(feedSyncs).orderBy(desc(feedSyncs.syncedAt)).limit(400);
  const latest = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!latest.has(r.system)) latest.set(r.system, r);
  const now = Date.now();
  return FEED_CONTRACTS.map((c) => {
    const r = latest.get(c.system);
    const ageSec = r ? Math.round((now - r.syncedAt.getTime()) / 1000) : null;
    return {
      system: c.system,
      domain: c.domain,
      endpoint: c.endpoint,
      transport: c.method,
      contractVersion: c.contractVersion,
      frequencySec: c.frequencySec,
      schema: c.schema,
      simulated: true,
      lastSync: r ? r.syncedAt.toISOString() : null,
      ageSec,
      state: r ? (gradeState(r.validRecords, r.records, ageSec ?? 0, c.frequencySec) as CycleResult["state"]) : "DISCONNECTED",
      records: r?.records ?? 0,
      valid: r?.validRecords ?? 0,
      invalid: r?.invalidRecords ?? 0,
      duplicates: r?.duplicates ?? 0,
      quarantined: r?.quarantined ?? 0,
      durationMs: r?.durationMs ?? 0,
      checksum: r?.checksum ?? "",
      freshness: freshnessLabel(ageSec, c.frequencySec),
    };
  });
}

/** Synced records for a system — the hub's record inspector. */
export async function recordsFor(system: string, limit = 60, status?: string) {
  const rows = await db
    .select()
    .from(ingestRecords)
    .where(status ? and(eq(ingestRecords.system, system.toUpperCase()), eq(ingestRecords.status, status)) : eq(ingestRecords.system, system.toUpperCase()))
    .orderBy(desc(ingestRecords.ingestedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    system: r.system,
    sourceRef: r.sourceRef,
    entity: r.entity,
    section: r.sectionHint,
    department: r.department,
    severity: r.severity,
    quantity: r.quantity,
    status: r.status,
    issues: r.issues,
    payload: r.payload,
    observedAt: r.observedAt.toISOString(),
  }));
}

/** Fleet totals for the hub header. */
export async function hubSummary() {
  const rows = await db
    .select({
      system: ingestRecords.system,
      n: sql<number>`count(*)::int`,
      valid: sql<number>`count(*) filter (where status = 'VALID')::int`,
      invalid: sql<number>`count(*) filter (where status = 'INVALID')::int`,
      dup: sql<number>`count(*) filter (where status = 'DUPLICATE')::int`,
      quarantined: sql<number>`count(*) filter (where status = 'QUARANTINED')::int`,
    })
    .from(ingestRecords)
    .groupBy(ingestRecords.system);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const valid = rows.reduce((s, r) => s + r.valid, 0);
  const freshness = await feedStatus();
  return {
    systems: rows.length,
    contracts: FEED_CONTRACTS.length,
    records: total,
    valid,
    invalid: total - valid,
    integrityPct: total ? Math.round((valid / total) * 1000) / 10 : 0,
    simulated: true,
    connected: freshness.filter((f) => f.state === "CONNECTED").length,
    degraded: freshness.filter((f) => f.state !== "CONNECTED" && f.state !== "DISCONNECTED").length,
    disconnected: freshness.filter((f) => f.state === "DISCONNECTED").length,
    perSystem: rows,
  };
}

/** Records ingested in the last N minutes — ingestion throughput read-model. */
export async function recentThroughput(minutes = 30) {
  const since = new Date(Date.now() - minutes * 60_000);
  const rows = await db
    .select({ system: ingestRecords.system, n: sql<number>`count(*)::int` })
    .from(ingestRecords)
    .where(gte(ingestRecords.ingestedAt, since))
    .groupBy(ingestRecords.system);
  const syncs = await db.select().from(feedSyncs).where(gte(feedSyncs.syncedAt, since));
  return {
    windowMin: minutes,
    records: rows.reduce((s, r) => s + r.n, 0),
    cycles: syncs.length,
    avgDurationMs: syncs.length ? Math.round(syncs.reduce((s, x) => s + x.durationMs, 0) / syncs.length) : 0,
    perSystem: rows,
  };
}

export { FEED_CONTRACTS };
export type { FeedContract };
