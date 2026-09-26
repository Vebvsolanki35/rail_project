"use client";

/**
 * RAIL RAKSHAK — RAIL DESIGN SYSTEM PRIMITIVES
 *
 * The brief asks for a named component library. Four of those names already
 * exist in this codebase under their original names, and are NOT duplicated
 * here — they are the implementation of the rail primitive:
 *
 *   RailTable      → components/DataTable.tsx        (sorting, search, pagination)
 *   RailBadge      → components/StatusPill.tsx       (status vocabulary, icon + text)
 *   RailMap        → components/RailMap.tsx          (schematic with layers)
 *   RailPageHeader → components/PageHeader.tsx       (module header + breadcrumb)
 *   RailDrawer     → components/DetailDrawer.tsx     (side drawer)
 *
 * This file adds the primitives that were genuinely missing and that the shell
 * and Command Centre need. Every one of them is presentation-only: they take
 * values that a server page or engine already computed, and render nothing of
 * their own. No component here invents data, calls an API, or holds state
 * beyond what the caller passes in.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Info, ShieldAlert, Sparkles } from "lucide-react";

/** Tone vocabulary shared with StatusPill and the CSS primitive layer. */
export type RailTone = "critical" | "warning" | "success" | "info" | "advisory" | "neutral";

const TONE_ICON: Record<RailTone, typeof Info> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
  advisory: Sparkles,
  neutral: CircleDashed,
};

/* ─────────────────────────────────────────────────────────────────────────────
   RailPanel — a titled section of the console. Thin border, uppercase head,
   optional right-hand slot for actions or reference data.
   ───────────────────────────────────────────────────────────────────────────── */
export function RailPanel({
  title,
  subtitle,
  icon,
  actions,
  marker = false,
  dense = false,
  bodyClassName = "",
  children,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Maroon marker bar on the panel head (department sections). */
  marker?: boolean;
  dense?: boolean;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      <div className={`panel-hd ${marker ? "panel-hd-mark" : ""}`}>
        <span className="flex min-w-0 items-center gap-2">
          {icon && <span className="shrink-0 text-primary" aria-hidden>{icon}</span>}
          <span className="truncate">{title}</span>
          {subtitle && <span className="truncate text-[10px] font-medium normal-case tracking-normal text-faint">{subtitle}</span>}
        </span>
        {actions && <span className="flex shrink-0 items-center gap-1.5">{actions}</span>}
      </div>
      <div className={`min-w-0 flex-1 ${dense ? "" : "p-3"} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RailKpiCard — dense operational counter. Always clickable: a KPI that opens
   nothing is decoration, and this console is not decorative.
   ───────────────────────────────────────────────────────────────────────────── */
export function RailKpiCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  href,
  footer,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: RailTone;
  icon?: ReactNode;
  /** Every KPI drills through to the desk that owns the number. */
  href: string;
  footer?: string;
}) {
  return (
    <Link href={href} className="rail-kpi" data-tone={tone}>
      <span className="rail-kpi-label">
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </span>
      <span className="rail-kpi-value">{value}</span>
      {sub && <span className="rail-kpi-sub">{sub}</span>}
      <span className="rail-kpi-foot">
        <span>{footer ?? "Open desk"}</span>
        <ArrowRight size={11} aria-hidden />
      </span>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RailStatusBar — the compact operational strip under the masthead.
   Answers, at a glance: is the system up, how fresh is the data, and how many
   items of work are live right now.
   ───────────────────────────────────────────────────────────────────────────── */
export function RailStatusBar({
  cells,
}: {
  cells: { label: string; value: ReactNode; tone?: RailTone; hint?: string }[];
}) {
  return (
    <div className="rail-strip" role="status" aria-label="Operational status">
      {cells.map((c) => (
        <div key={c.label} className="rail-strip-cell" title={c.hint}>
          <span className="rail-strip-label">{c.label}</span>
          <span
            className={`rail-strip-value ${
              c.tone === "critical" ? "is-critical" : c.tone === "warning" ? "is-warning" : c.tone === "success" ? "is-ok" : ""
            }`}
          >
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RailTimeline — chronological operational record (events, decisions,
   lifecycle steps). One row per event, time on the left, axis in the middle.
   ───────────────────────────────────────────────────────────────────────────── */
export interface RailTimelineRow {
  id: string | number;
  at: string;
  title: string;
  tone?: RailTone;
  meta?: ReactNode;
  footer?: ReactNode;
}

export function RailTimeline({
  rows,
  empty = "No operational events recorded yet",
  className = "",
}: {
  rows: RailTimelineRow[];
  empty?: string;
  className?: string;
}) {
  if (rows.length === 0) return <RailEmptyState title={empty} />;
  return (
    <div className={`rail-timeline ${className}`}>
      {rows.map((r) => (
        <div key={r.id} className="rail-tl-row">
          <span className="rail-tl-time">{r.at}</span>
          <span className="rail-tl-axis">
            <span className="rail-tl-dot" data-tone={r.tone ?? "neutral"} />
          </span>
          <span className="rail-tl-body">
            <span className="rail-tl-title block">{r.title}</span>
            {(r.meta || r.footer) && (
              <span className="rail-tl-meta">
                {r.meta}
                {r.footer}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RailEntityLink — the linked-ID spine made visible and clickable:
     DEFECT-1024 → JOB-882 → BLOCK-441 → …
   ───────────────────────────────────────────────────────────────────────────── */
export type RailEntityKind = "defect" | "job" | "block" | "asset" | "plan" | "team" | "evidence" | "inspection" | "decision" | "issue" | "incident";

export function RailEntityLink({
  kind,
  id,
  href,
  label,
  title,
}: {
  kind: RailEntityKind;
  id?: string | number;
  /** When omitted the chip renders as plain reference text (entity has no desk yet). */
  href?: string;
  label?: string;
  title?: string;
}) {
  const text = label ?? `${kind.toUpperCase()}-${id ?? "—"}`;
  if (!href) {
    return (
      <span className="rail-link" data-kind={kind} title={title ?? `${text} (no desk linked in this phase)`}>
        {text}
      </span>
    );
  }
  return (
    <Link href={href} className="rail-link" data-kind={kind} title={title}>
      {text}
    </Link>
  );
}

/** A relationship chain: <RailChain><RailEntityLink …/>…</RailChain> */
export function RailChain({ children }: { children: ReactNode }) {
  const items = Array.isArray(children) ? children.flat().filter(Boolean) : [children];
  return (
    <span className="rail-chain">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="rail-chain-sep" aria-hidden>→</span>}
          {c}
        </span>
      ))}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RailAlert — a situation row: severity, time, location, and the action.
   ───────────────────────────────────────────────────────────────────────────── */
export function RailAlert({
  severity,
  title,
  detail,
  meta,
  action,
  icon,
}: {
  severity: RailTone;
  title: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const Icon = TONE_ICON[severity];
  return (
    <div className="rail-alert" data-tone={severity} role="group">
      <span className="mt-[1px] shrink-0" aria-hidden>
        {icon ?? <Icon size={15} className="text-current" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="rail-alert-hd">
          <span className="text-current">{severity}</span>
          {meta}
        </div>
        <p className="rail-alert-title">{title}</p>
        {detail && <p className="mt-0.5 text-[11.5px] leading-snug text-dim">{detail}</p>}
        {action && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{action}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RailFilterBar — compact pressed-state filters (map layers, registers).
   ───────────────────────────────────────────────────────────────────────────── */
export function RailFilterBar({
  items,
  className = "",
}: {
  items: { id: string; label: string; on: boolean; onToggle: () => void; dot?: string; title?: string; count?: number }[];
  className?: string;
}) {
  return (
    <div className={`rail-filter ${className}`} role="group">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          aria-pressed={it.on}
          onClick={it.onToggle}
          className="rail-chip"
          title={it.title}
        >
          {it.dot && <span className="rail-chip-dot" style={{ background: it.dot }} aria-hidden />}
          {it.label}
          {typeof it.count === "number" && (
            <span className="font-mono text-[10px] opacity-80">{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RailEmptyState / RailLoadingState — the two states every register needs and
   that were previously ad-hoc strings scattered per page.
   ───────────────────────────────────────────────────────────────────────────── */
export function RailEmptyState({ title, detail, icon }: { title: string; detail?: string; icon?: ReactNode }) {
  return (
    <div className="rail-empty">
      {icon ?? <CircleDashed size={18} aria-hidden />}
      <p className="rail-empty-title">{title}</p>
      {detail && <p className="max-w-md text-[11px] leading-snug">{detail}</p>}
    </div>
  );
}

export function RailLoadingState({ label = "Retrieving records…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-1.5 p-3" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-5 w-full" />
      ))}
    </div>
  );
}
