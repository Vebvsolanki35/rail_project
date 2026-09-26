/**
 * Asset Availability KPI — transparent calculation from planning data.
 *
 * Directly demonstrates the Problem Statement #26027 objective:
 * "Maximize asset availability while minimizing maintenance downtime".
 *
 * FORMULA
 * --------
 *   Asset Availability (%) =
 *       ((Total Available Time − Planned Maintenance Downtime) / Total Available Time) × 100
 *
 *   Total Available Time  = number of monitored fixed assets × planning-horizon minutes
 *   Optimized Downtime    = Σ over planned blocks:  block duration (min) × assets on that section
 *   Baseline Downtime     = Σ over scheduled defects: (defect duration + 40 min standalone
 *                           setup/mobilization) × assets on that defect's section
 *
 * MODEL ASSUMPTIONS (documented, prototype-honest)
 * ------------------------------------------------
 * 1. A maintenance block on a section makes that section's fixed infrastructure
 *    (track / OHE / signalling assets — the `assets` table) unavailable for the
 *    block's duration. This is conservative: in reality some assets on a section
 *    stay serviceable during another department's block.
 * 2. The manual/BDMS baseline assumes every defect is fixed in its OWN standalone
 *    block with 40 min setup overhead (the same convention the optimizer uses for
 *    its `downtimeBaselineH` KPI). The AI plan instead bundles many defects into
 *    shared windows (super-blocks), which is where the availability gain comes from.
 * 3. Only defects actually scheduled into the plan are counted, in BOTH the baseline
 *    and the optimized figure, so the comparison is apples-to-apples.
 * 4. Availability is a planning measure over the horizon — it is NOT a claim about
 *    real operational asset availability (prototype dataset).
 */

export interface AvailabilityInputs {
  /** Planned blocks: section id, window, and the defect ids bundled inside. */
  blocks: { segmentId: number; startMin: number; endMin: number; defectIds: number[] }[];
  /** All monitored assets (id → section id). */
  assets: { id: number; segmentId: number }[];
  /** Defects referenced by the blocks: id → duration + severity + section. */
  defects: { id: number; durationMin: number; severity: number; segmentId: number }[];
  /** Planning horizon length in minutes (e.g. 7×1440 weekly, 28×1440 monthly, 240 rolling). */
  horizonMin: number;
}

export interface AvailabilityResult {
  totalAssets: number;
  horizonMin: number;
  totalAvailableAssetMin: number;
  baselineDowntimeAssetMin: number;
  optimizedDowntimeAssetMin: number;
  baselinePct: number;
  optimizedPct: number;
  improvementPts: number;
  safetyCriticalCovered: number;
}

/** Standalone-block setup overhead used by the manual baseline (minutes). */
const BASELINE_SETUP_MIN = 40;
/** Severity threshold considered safety-critical (matches optimizer urgency band). */
const SAFETY_CRITICAL_SEVERITY = 8;

export function computeAvailability(inp: AvailabilityInputs): AvailabilityResult {
  const assetsPerSegment = new Map<number, number>();
  for (const a of inp.assets) assetsPerSegment.set(a.segmentId, (assetsPerSegment.get(a.segmentId) ?? 0) + 1);
  const defectById = new Map(inp.defects.map((d) => [d.id, d]));
  const assetsOn = (segmentId: number) => assetsPerSegment.get(segmentId) ?? 0;

  const totalAssets = inp.assets.length;
  const totalAvailableAssetMin = totalAssets * inp.horizonMin;

  // Optimized: every planned block denies its section's assets for the block duration.
  let optimizedDowntimeAssetMin = 0;
  for (const b of inp.blocks) {
    optimizedDowntimeAssetMin += Math.max(0, b.endMin - b.startMin) * assetsOn(b.segmentId);
  }

  // Baseline: the same defects, each in its own standalone block (+ setup overhead).
  const scheduledDefectIds = new Set(inp.blocks.flatMap((b) => b.defectIds));
  let baselineDowntimeAssetMin = 0;
  let safetyCriticalCovered = 0;
  for (const id of scheduledDefectIds) {
    const d = defectById.get(id);
    if (!d) continue;
    baselineDowntimeAssetMin += (d.durationMin + BASELINE_SETUP_MIN) * assetsOn(d.segmentId);
    if (d.severity >= SAFETY_CRITICAL_SEVERITY) safetyCriticalCovered += 1;
  }

  const denom = Math.max(totalAvailableAssetMin, 1);
  const baselinePct = Math.round(Math.max(0, (1 - baselineDowntimeAssetMin / denom) * 100) * 10) / 10;
  const optimizedPct = Math.round(Math.max(0, (1 - optimizedDowntimeAssetMin / denom) * 100) * 10) / 10;
  const improvementPts = Math.round((optimizedPct - baselinePct) * 10) / 10;

  return {
    totalAssets,
    horizonMin: inp.horizonMin,
    totalAvailableAssetMin,
    baselineDowntimeAssetMin,
    optimizedDowntimeAssetMin,
    baselinePct,
    optimizedPct,
    improvementPts,
    safetyCriticalCovered,
  };
}
