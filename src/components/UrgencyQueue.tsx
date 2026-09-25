"use client";

/**
 * Ranked urgency queue. Ordering is urgency-first, then by the optimizer's
 * sort key (criticality × urgency boost). Each row shows WHY it sits where it
 * does: urgency index, ×boost and the deadline.
 */
import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { DueChip, RecurrenceChip, UrgencyChip } from "./DefectBadges";

export interface UrgencyQueueRow {
  id: number;
  defectCode: string;
  title: string;
  segmentCode: string;
  department: string;
  severity: number;
  dueInDays: number;
  urgencyClass: string;
  urgencyScore: number;
  boost: number;
  sortKey: number;
  aiScore: number;
  priority: string;
  recurrenceBand: string;
  lifecycleStatus: string;
}

export default function UrgencyQueue({ items, limit = 12 }: { items: UrgencyQueueRow[]; limit?: number }) {
  const rows = items.slice(0, limit);
  if (rows.length === 0) {
    return <p className="rounded-xl border border-edge/70 bg-panel/50 p-4 text-xs text-dim">No open defects in the queue.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-edge/70">
      <table className="w-full text-left text-xs">
        <thead className="bg-hull/70 text-[10px] uppercase tracking-wide text-faint">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Defect</th>
            <th className="px-3 py-2">Urgency</th>
            <th className="px-3 py-2">Deadline</th>
            <th className="px-3 py-2">Severity</th>
            <th className="px-3 py-2">Boost</th>
            <th className="px-3 py-2 text-right">Sort key</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-edge/50 bg-panel/40">
          {rows.map((r, i) => (
            <tr key={r.id} className="align-middle hover:bg-hull/40">
              <td className="px-3 py-2 font-mono text-[10px] text-faint">{i + 1}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-amber-400">{r.defectCode}</span>
                  {r.urgencyClass === "EMERGENCY" && <Flame size={12} className="text-red-400" />}
                </div>
                <div className="max-w-[280px] truncate text-[11px] text-dim">
                  {r.title} · <span className="text-faint">{r.segmentCode}</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <UrgencyChip cls={r.urgencyClass} score={r.urgencyScore} />
                <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-edge/70">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500"
                    style={{ width: `${Math.max(4, Math.min(100, r.urgencyScore))}%` }}
                  />
                </div>
              </td>
              <td className="px-3 py-2">
                <DueChip dueInDays={r.dueInDays} />
                <div className="mt-1">
                  <RecurrenceChip band={r.recurrenceBand as "NONE"} occurrences={0} />
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-ink">{r.severity}/10</td>
              <td className="px-3 py-2 font-mono text-amber-300">×{r.boost.toFixed(2)}</td>
              <td className="px-3 py-2 text-right font-mono text-ink">{r.sortKey.toFixed(1)}</td>
              <td className="px-3 py-2 text-right">
                <Link href={`/defects/${r.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:underline">
                  Open <ArrowRight size={11} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
