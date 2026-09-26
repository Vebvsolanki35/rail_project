"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Clock, Server } from "lucide-react";
import StatusPill, { type StatusTone } from "./StatusPill";
import { useLang } from "@/lib/lang";

/**
 * MODULE HEADER — the government-portal "department title bar".
 *
 * Every operational page answers, above the fold:
 *   WHERE AM I?          module code + breadcrumb trail
 *   WHAT IS HAPPENING?   title + description
 *   WHAT IS THE STATUS?  workflow state chips + system status
 *   WHEN?                last-refresh timestamp (server-rendered page)
 *   WHAT CAN I DO?       actions slot (buttons passed by the page)
 *
 * The header resolves its strings through the shared English/Hindi dictionary,
 * so page titles follow the language selector without duplicating any data.
 */
export default function PageHeader({
  module,
  title,
  titleKey,
  subtitle,
  subtitleKey,
  crumbs = [],
  state,
  stateTone,
  actions,
  reference,
  showClock = true,
  children,
}: {
  /** Reference code, e.g. "OPS-CC" (see MODULE_CODES in src/lib/navigation.ts). */
  module?: string;
  title: string;
  /** Optional dictionary key; when set and the UI language is Hindi, it wins. */
  titleKey?: string;
  subtitle?: string;
  subtitleKey?: string;
  /** Breadcrumb trail, current page last (no href). */
  crumbs?: { label: string; href?: string }[];
  /** Current workflow state, e.g. "Awaiting Approval". */
  state?: string;
  stateTone?: StatusTone;
  /** Reference ID shown in the metadata row (plan id, work order no., etc.). */
  reference?: ReactNode;
  actions?: ReactNode;
  showClock?: boolean;
  children?: ReactNode;
}) {
  const { lang, t } = useLang();
  const heading = lang === "hi" && titleKey ? t(titleKey) : title;
  const sub = lang === "hi" && subtitleKey ? t(subtitleKey) : subtitle;

  const stamp = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <header className="border border-edge bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge bg-abyss px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {module && (
              <span className="rounded-[3px] border border-primary/30 bg-primary/[0.06] px-1.5 py-[1px] font-mono text-[10px] font-bold tracking-wider text-primary">
                {module}
              </span>
            )}
            <nav aria-label="Breadcrumb" className="crumb">
              <Link href="/command">Home</Link>
              {crumbs.map((c) => (
                <span key={c.label} className="flex items-center gap-2">
                  <ChevronRight size={11} className="sep" aria-hidden />
                  {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="cur">{c.label}</span>}
                </span>
              ))}
              {crumbs.length === 0 && (
                <span className="flex items-center gap-2">
                  <ChevronRight size={11} className="sep" aria-hidden />
                  <span className="cur">{heading}</span>
                </span>
              )}
            </nav>
          </div>
          <h1 className="mt-1.5 text-[17px] font-bold leading-tight tracking-tight text-ink">{heading}</h1>
          {sub && <p className="mt-0.5 max-w-3xl text-[12px] leading-relaxed text-dim">{sub}</p>}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-[11px] text-dim">
        {state && <StatusPill label={state} tone={stateTone} motion="pulse" />}
        {reference && (
          <span className="flex items-center gap-1.5">
            <span className="uppercase tracking-wide text-faint">Ref</span>
            <span className="font-mono text-[11px] font-semibold text-ink">{reference}</span>
          </span>
        )}
        {showClock && (
          <span className="flex items-center gap-1.5">
            <Clock size={11} className="text-faint" aria-hidden />
            <span className="uppercase tracking-wide text-faint">Updated</span>
            <span className="font-mono text-ink">{stamp} IST</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Server size={11} className="text-faint" aria-hidden />
          <span className="uppercase tracking-wide text-faint">System</span>
          <span className="font-semibold text-mint">OPERATIONAL</span>
        </span>
        {children}
      </div>
    </header>
  );
}
