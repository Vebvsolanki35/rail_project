/**
 * AI criticality scoring — shared by the optimizer, the dashboard state and
 * the Smart Defect Lifecycle. Extracted verbatim from optimizer.ts so the
 * lifecycle module can reuse the SAME trained model without circular imports.
 * (optimizer.ts re-exports these; existing imports keep working.)
 */
import { predictRisk } from "./ml";

export function riskFor(
  d: { severity: number; overdueDays: number },
  assetHealth: number,
  seg: { criticality: number; dailyTrains: number; isBridge: boolean },
  fogSeason: boolean
): number {
  return predictRisk({
    severity: d.severity,
    overdueDays: d.overdueDays,
    assetHealth,
    dailyTrains: seg.dailyTrains,
    criticality: seg.criticality,
    isBridge: seg.isBridge,
    fogSeason,
  });
}

export function scoreDefect(
  d: { severity: number; overdueDays: number; inspectionMode: string },
  seg: { criticality: number; dailyTrains: number; isBridge: boolean },
  ctx: { fogMode: boolean; assetHealth: number }
): number {
  const prob = riskFor(d, ctx.assetHealth, seg, ctx.fogMode);
  let score =
    0.3 * d.severity * 10 +
    0.3 * prob * 100 +
    0.12 * Math.min(d.overdueDays / 30, 1) * 100 +
    0.16 * seg.criticality * 10 +
    0.12 * Math.min(seg.dailyTrains / 4, 100);
  if (seg.isBridge) score *= 1.22; // Yamuna bridge = single point of failure
  if (ctx.fogMode && d.inspectionMode === "physical") score *= 0.35; // auto-defer physical work in fog
  return Math.round(score * 10) / 10;
}
