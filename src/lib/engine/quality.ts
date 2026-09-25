/**
 * Plan Quality Score — a single, explainable composite for a generated block plan.
 *
 * Every sub-metric is a transparent normalization of values the optimizer already
 * computes (no new claims): asset availability, train delay, maintenance coverage,
 * cross-department utilization, schedule conflicts (measured from the blocks
 * themselves), and Monte-Carlo robustness. Missing metrics drop out and their
 * weight is redistributed, so the score never invents data.
 */
import type { BlockItemDTO } from "./types";

export interface QualityItem {
  key: string;
  label: string;
  /** normalized 0–100 contribution */
  pct: number;
  /** human display value, e.g. "96.4%" */
  display: string;
  /** relative weight after redistribution (0–1) */
  weight: number;
  note: string;
}

export interface PlanQualityResult {
  score: number;
  items: QualityItem[];
  vsManual: { downtimePct: number | null; availabilityPts: number | null };
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/** Overlapping same-section blocks on the same day — measured, not assumed. */
export function countBlockConflicts(blocks: BlockItemDTO[]): number {
  let conflicts = 0;
  const byKey = new Map<string, BlockItemDTO[]>();
  for (const b of blocks) {
    const key = `${b.segmentId}:${b.day}`;
    const list = byKey.get(key) ?? [];
    list.push(b);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const c = list[j];
        if (a.startMin < c.endMin && c.startMin < a.endMin) conflicts++;
      }
    }
  }
  return conflicts;
}

export function planQuality(kpis: Record<string, number> | null | undefined, blocks: BlockItemDTO[]): PlanQualityResult | null {
  if (!kpis) return null;

  const delay = kpis.avgDelayMin;
  const cleared = kpis.defectsCleared;
  const availability = kpis.assetAvailabilityPct;
  const bundling = kpis.bundlingPct;
  const resilience = kpis.resilienceScore;

  // candidates = scheduled + intentionally withheld (policy) + suspended (fog)
  const withheld = (kpis.withheldByVip ?? 0) + (kpis.suspendedByFog ?? 0);
  const candidates = (cleared ?? 0) + withheld;

  const conflicts = countBlockConflicts(blocks);
  const conflictPct = blocks.length > 1 ? (conflicts / blocks.length) * 100 : 0;

  const raw: Omit<QualityItem, "weight">[] = [];

  if (availability != null) {
    raw.push({
      key: "availability",
      label: "Asset Availability",
      pct: clamp(availability, 0, 100),
      display: `${availability.toFixed(1)}%`,
      note: "Monitored fixed assets serviceable across the horizon",
    });
  }
  if (delay != null) {
    raw.push({
      key: "trainImpact",
      label: "Train Impact",
      pct: clamp(100 - (delay / 8) * 100, 0, 100),
      display: `${delay.toFixed(1)}m avg`,
      note: "Average projected delay per affected train (target < 8 min)",
    });
  }
  if (cleared != null) {
    raw.push({
      key: "coverage",
      label: "Maintenance Coverage",
      pct: candidates > 0 ? clamp((cleared / candidates) * 100, 0, 100) : 100,
      display: `${cleared} tasks`,
      note: withheld > 0 ? `${withheld} withheld by policy (fog / VVIP)` : "Open defects scheduled into blocks",
    });
  }
  if (bundling != null) {
    raw.push({
      key: "utilization",
      label: "Resource Utilization",
      pct: clamp(bundling, 0, 100),
      display: `${Math.round(bundling)}% shared`,
      note: "Block minutes shared across departments (super-blocks)",
    });
  }
  raw.push({
    key: "conflicts",
    label: "Conflict Rate",
    pct: clamp(100 - conflictPct, 0, 100),
    display: conflicts === 0 ? "0 overlaps" : `${conflicts} overlaps`,
    note: "Same-section overlapping blocks measured from the plan",
  });
  if (resilience != null) {
    raw.push({
      key: "robustness",
      label: "Emergency Buffer",
      pct: clamp(resilience, 0, 100),
      display: `${Math.round(resilience)}/100`,
      note: "Monte Carlo robustness under 500 disruption runs",
    });
  }

  const baseWeights: Record<string, number> = {
    availability: 0.25,
    trainImpact: 0.2,
    coverage: 0.2,
    utilization: 0.12,
    conflicts: 0.1,
    robustness: 0.13,
  };
  const presentWeight = raw.reduce((s, item) => s + (baseWeights[item.key] ?? 0.1), 0);
  const items: QualityItem[] = raw.map((item) => ({
    ...item,
    weight: (baseWeights[item.key] ?? 0.1) / presentWeight,
  }));
  const score = Math.round(items.reduce((s, item) => s + item.pct * item.weight, 0));

  return {
    score,
    items,
    vsManual: {
      downtimePct: kpis.reductionPct != null ? Math.round(kpis.reductionPct) : null,
      availabilityPts: kpis.availabilityGainPts != null ? Math.round(kpis.availabilityGainPts) : null,
    },
  };
}
