"use client";

/**
 * GOVERNMENT DATA TABLE
 *
 * The register pattern used across the portal: sticky header, serial column,
 * search, sortable columns, pagination, column visibility and CSV export —
 * all keyboard-operable and announced to assistive technology.
 *
 * Fully generic: columns are declared by the caller, cells may be any ReactNode,
 * and the CSV export serialises a plain-text projection supplied by the caller
 * (so exported values never diverge from what is on screen).
 *
 *   <DataTable rows={rows} columns={cols} csvName="section-register"
 *              getKey={(r) => r.id} getCsv={(r) => [r.code, r.trains]} />
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Search, Table2 } from "lucide-react";

export type Column<T> = {
  /** Stable key used by sorting, visibility and the CSV projection. */
  key: string;
  header: string;
  /** Cell renderer. */
  cell: (row: T) => ReactNode;
  /** Plain-text projection used for CSV export and for sorting. */
  text?: (row: T) => string | number;
  /** Numeric columns render right-aligned with tabular figures. */
  align?: "left" | "right";
  className?: string;
  /** Start hidden (still user-toggleable). */
  hiddenByDefault?: boolean;
  /** Excluded from the column-visibility menu (e.g. the action column). */
  locked?: boolean;
};

export default function DataTable<T>({
  rows,
  columns,
  getKey,
  csvName = "rail-rakshak-export",
  searchPlaceholder = "Search this register…",
  pageSize: initialPageSize = 12,
  emptyMessage = "No records match the current filter.",
  showSerial = true,
  toolbarExtra,
  dense = false,
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string | number;
  csvName?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  showSerial?: boolean;
  toolbarExtra?: ReactNode;
  dense?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.key)));
  const [colsOpen, setColsOpen] = useState(false);

  const valueOf = (row: T, col: Column<T>): string | number => {
    if (col.text) return col.text(row);
    return "";
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => columns.some((c) => String(valueOf(r, c)).toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = valueOf(a, col);
      const bv = valueOf(b, col);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "en-IN", { numeric: true }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const view = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const visible = columns.filter((c) => !hidden.has(c.key));

  function toggleSort(key: string) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(0);
  }

  function exportCsv() {
    const cols = visible.filter((c) => c.key !== "actions");
    const header = (showSerial ? ["Sr"] : []).concat(cols.map((c) => c.header));
    const lines = sorted.map((r, i) =>
      (showSerial ? [String(i + 1)] : [])
        .concat(cols.map((c) => String(valueOf(r, c)).replace(/\s+/g, " ").replace(/"/g, '""')))
        .map((v) => `"${v}"`)
        .join(",")
    );
    const csv = [header.map((h) => `"${h}"`).join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-abyss px-3 py-2">
        <label className="relative flex min-w-[12rem] flex-1 items-center">
          <Search size={12} className="pointer-events-none absolute left-2 text-faint" aria-hidden />
          <span className="sr-only">Search register</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="w-full border border-edge bg-panel py-1 pl-7 pr-2 text-[11.5px] text-ink outline-none placeholder:text-faint focus:border-primary"
          />
        </label>

        <span className="text-[10.5px] text-dim">
          <span className="font-semibold text-ink">{sorted.length}</span> of {rows.length} record(s)
        </span>

        {toolbarExtra}

        <div className="relative">
          <button onClick={() => setColsOpen((v) => !v)} className="btn btn-sm" aria-expanded={colsOpen} aria-haspopup="true">
            <Columns3 size={12} aria-hidden /> Columns
          </button>
          {colsOpen && (
            <>
              <button className="fixed inset-0 z-30 cursor-default" aria-label="Close column menu" onClick={() => setColsOpen(false)} />
              <div className="absolute right-0 z-40 mt-1 w-56 border border-edge bg-panel shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]">
                <p className="border-b border-edge px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Visible columns</p>
                <ul className="max-h-64 overflow-y-auto py-1">
                  {columns
                    .filter((c) => !c.locked)
                    .map((c) => (
                      <li key={c.key}>
                        <label className="flex items-center gap-2 px-2.5 py-1 text-[11.5px] text-dim hover:bg-primary/[0.04]">
                          <input
                            type="checkbox"
                            checked={!hidden.has(c.key)}
                            onChange={() =>
                              setHidden((h) => {
                                const next = new Set(h);
                                if (next.has(c.key)) next.delete(c.key);
                                else next.add(c.key);
                                return next;
                              })
                            }
                            className="h-3.5 w-3.5"
                          />
                          {c.header}
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <button onClick={exportCsv} className="btn btn-sm">
          <Download size={12} aria-hidden /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="gov-table-wrap">
        <table className={`gov-table ${dense ? "text-[11px]" : ""}`}>
          <thead>
            <tr>
              {showSerial && <th className="sr">Sr</th>}
              {visible.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={c.align === "right" ? "num" : undefined} aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}>
                    {c.key === "actions" ? (
                      c.header
                    ) : (
                      <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-primary" title={`Sort by ${c.header}`}>
                        {c.header}
                        {active ? (
                          sort?.dir === "asc" ? (
                            <ArrowUp size={11} aria-hidden />
                          ) : (
                            <ArrowDown size={11} aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown size={11} className="text-faint" aria-hidden />
                        )}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={getKey(r)}>
                {showSerial && <td className="sr">{String(safePage * pageSize + i + 1).padStart(2, "0")}</td>}
                {visible.map((c) => (
                  <td key={c.key} className={`${c.align === "right" ? "num" : ""} ${c.className ?? ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
            {view.length === 0 && (
              <tr>
                <td colSpan={visible.length + (showSerial ? 1 : 0)} className="p-6 text-center text-[11.5px] text-faint">
                  <Table2 size={16} className="mx-auto mb-1.5 text-faint" aria-hidden />
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-3 py-2 text-[10.5px] text-dim">
        <span>
          Page {safePage + 1} of {pageCount}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="border border-edge bg-panel px-1 py-0.5 text-[10.5px] text-ink focus:border-primary focus:outline-none"
            >
              {[8, 12, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setPage(0)} disabled={safePage === 0} className="btn btn-sm">
            First
          </button>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="btn btn-sm">
            Previous
          </button>
          <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="btn btn-sm">
            Next
          </button>
          <button onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1} className="btn btn-sm">
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
