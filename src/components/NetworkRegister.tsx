"use client";

/**
 * NETWORK SECTION REGISTER
 *
 * The register half of the Network Status desk. Server-rendered data, client
 * table affordances (search, sort, pagination, column visibility, CSV export).
 * Occupancy and defect figures are computed by the page from the published
 * plan and the live defect register — nothing is duplicated here.
 */
import Link from "next/link";
import DataTable, { type Column } from "./DataTable";
import StatusPill from "./StatusPill";

export type RegisterRow = {
  id: number;
  code: string;
  fromCode: string;
  toCode: string;
  corridor: string;
  lengthKm: number;
  dailyTrains: number;
  criticality: number;
  jurisdiction: string;
  openDefects: number;
  worstDefect: { id: number; severity: number } | null;
  occupancy: string;
  occupancyTone: "success" | "warning" | "critical" | "info";
  special: string | null;
};

export default function NetworkRegister({ rows }: { rows: RegisterRow[] }) {
  const columns: Column<RegisterRow>[] = [
    {
      key: "code",
      header: "Section",
      cell: (r) => (
        <>
          <span className="font-mono text-[11.5px] font-bold text-ink">{r.code}</span>
          <span className="mt-0.5 block text-[10.5px] text-faint">
            {r.fromCode} → {r.toCode} · {r.lengthKm} km
          </span>
        </>
      ),
      text: (r) => `${r.code} ${r.fromCode} ${r.toCode}`,
    },
    {
      key: "corridor",
      header: "Corridor",
      cell: (r) => (
        <span className="text-[11px] text-dim">
          {r.corridor}
          {r.special && <span className="ml-1 font-semibold text-saffron">{r.special}</span>}
        </span>
      ),
      text: (r) => r.corridor,
    },
    { key: "jurisdiction", header: "Responsible jurisdiction", cell: (r) => <span className="text-[10.5px] text-dim">{r.jurisdiction}</span>, text: (r) => r.jurisdiction },
    { key: "dailyTrains", header: "Trains/day", align: "right", cell: (r) => r.dailyTrains, text: (r) => r.dailyTrains },
    { key: "criticality", header: "Crit.", align: "right", cell: (r) => r.criticality, text: (r) => r.criticality },
    {
      key: "openDefects",
      header: "Open defects",
      align: "right",
      cell: (r) => (r.openDefects > 0 ? <span className="font-semibold text-ink">{r.openDefects}</span> : <span className="text-faint">—</span>),
      text: (r) => r.openDefects,
    },
    {
      key: "occupancy",
      header: "Occupancy",
      cell: (r) => <StatusPill label={r.occupancy} tone={r.occupancyTone} motion={r.occupancyTone === "critical" ? "pulse" : "none"} />,
      text: (r) => r.occupancy,
    },
    {
      key: "actions",
      header: "Action",
      locked: true,
      cell: (r) =>
        r.worstDefect ? (
          <Link href={`/defects/${r.worstDefect.id}`} className="btn-link text-[11.5px] font-semibold">
            Defect {r.worstDefect.severity}/10
          </Link>
        ) : (
          <span className="text-[11px] text-faint">—</span>
        ),
    },
  ];

  return (
    <section className="panel">
      <div className="panel-hd">
        <span>Section register</span>
        <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
          {rows.length} sections · highest criticality first
        </span>
      </div>
      <DataTable<RegisterRow>
        rows={rows}
        columns={columns}
        getKey={(r) => r.id}
        csvName="rail-rakshak-section-register"
        searchPlaceholder="Search section, corridor or jurisdiction…"
        pageSize={12}
      />
    </section>
  );
}
