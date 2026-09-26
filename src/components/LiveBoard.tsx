import { ArrowRight } from "lucide-react";
import { fmtMin } from "@/lib/engine/network";
import type { LiveTrainDTO } from "@/lib/engine/types";

const KIND_COLOR: Record<string, string> = {
  RAJDHANI: "#f59e0b",
  VANDE_BHARAT: "#10b981",
  SHATABDI: "#10b981",
  EXPRESS: "#38bdf8",
  PASSENGER: "#c084fc",
  DFC_FREIGHT: "#f43f5e",
  RAPIDX: "#06b6d4",
};

export default function LiveBoard({ trains }: { trains: LiveTrainDTO[] }) {
  const sorted = [...trains].sort((a, b) => {
    const rank = (s: string) => (s === "RUNNING" ? 0 : s === "SCHEDULED" ? 1 : 2);
    return rank(a.status) - rank(b.status) || a.schDep - b.schDep;
  });

  return (
    <div className="max-h-72 overflow-y-auto divide-y divide-edge/60">
      {sorted.length === 0 && (
        <p className="p-6 text-center text-xs text-dim">No trains in tracking window</p>
      )}
      {sorted.map((t, i) => {
        const col = KIND_COLOR[t.kind] ?? "#94a3b8";
        return (
          <div key={t.number + i} className="flex items-center gap-3 p-3 hover:bg-primary/[0.03] transition">
            <span className="font-mono text-xs font-bold shrink-0" style={{ color: col }}>
              {t.number}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">{t.name}</p>
              <p className="flex items-center gap-1 text-[11px] text-dim">
                {t.from} <ArrowRight size={10} className="text-faint" /> {t.to} · Sch {fmtMin(t.schDep)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {t.status === "RUNNING" ? (
                <>
                  <p className="text-xs font-bold text-mint font-mono">
                    @{t.segCode?.replace("XR:", "")} → {t.nextStation}
                  </p>
                  <p className={`text-[10.5px] font-mono ${t.delayMin > 8 ? "text-signal font-semibold" : "text-dim"}`}>
                    {t.delayMin === 0 ? "Right Time" : `+${t.delayMin}m delay`} · {t.progressPct}%
                  </p>
                </>
              ) : t.status === "SCHEDULED" ? (
                <span className="rounded-[2px] bg-panel px-2 py-0.5 text-[10px] font-semibold text-dim border border-edge">
                  Scheduled
                </span>
              ) : (
                <span className="rounded-[2px] bg-panel px-2 py-0.5 text-[10px] text-faint">
                  Arrived
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
