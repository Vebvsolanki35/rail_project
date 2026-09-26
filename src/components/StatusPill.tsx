import type { ReactNode } from "react";
import { AlertTriangle, Bot, CheckCircle2, CircleDashed, Info, Loader2, ShieldAlert } from "lucide-react";

/**
 * RAIL RAKSHAK — STATUS SYSTEM
 *
 * One vocabulary for the whole platform. Colour is NEVER the only signal:
 * every pill carries an icon and a text label (accessibility requirement).
 *
 *   success  Operational · Approved · Completed · Verified · Available · Clear
 *   warning  Pending · Under Review · Maintenance Due · Awaiting Approval
 *   critical Conflict · Blocked · Safety Issue · Critical Defect · Failure
 *   info     AI Recommendation · Simulation · Scheduled · Under Analysis
 */
export type StatusTone = "success" | "warning" | "critical" | "info" | "ai" | "neutral";
export type StatusMotion = "none" | "pulse" | "spin";

const TONE: Record<StatusTone, { color: string; bg: string; border: string }> = {
  success: { color: "var(--color-mint)", bg: "color-mix(in srgb, var(--color-mint) 10%, transparent)", border: "color-mix(in srgb, var(--color-mint) 38%, transparent)" },
  warning: { color: "var(--color-saffron)", bg: "color-mix(in srgb, var(--color-saffron) 11%, transparent)", border: "color-mix(in srgb, var(--color-saffron) 40%, transparent)" },
  critical: { color: "var(--color-signal)", bg: "color-mix(in srgb, var(--color-signal) 11%, transparent)", border: "color-mix(in srgb, var(--color-signal) 42%, transparent)" },
  info: { color: "var(--color-cyan)", bg: "color-mix(in srgb, var(--color-cyan) 10%, transparent)", border: "color-mix(in srgb, var(--color-cyan) 36%, transparent)" },
  ai: { color: "var(--color-violet)", bg: "color-mix(in srgb, var(--color-violet) 10%, transparent)", border: "color-mix(in srgb, var(--color-violet) 36%, transparent)" },
  neutral: { color: "var(--color-dim)", bg: "color-mix(in srgb, var(--color-dim) 8%, transparent)", border: "var(--color-edge)" },
};

const ICON: Record<StatusTone, typeof Info> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: ShieldAlert,
  info: Info,
  ai: Bot,
  neutral: CircleDashed,
};

/** Keyword → tone map so raw engine strings render with the official palette. */
const KEYWORDS: [RegExp, StatusTone][] = [
  [/^(operational|approved|completed|verified|available|clear|clearance granted|closed|accepted|released|active|running normally|on time)/i, "success"],
  [/(critical|conflict|blocked|safety issue|failure|failed|reject|overdue|emergency|suspend|breach|denied|vip)/i, "critical"],
  [/(pending|awaiting|review|due|proposed|maintenance required|held|warning|escalat|under analysis|partial)/i, "warning"],
  [/(ai |recommend|simulat|optimis|optimiz|advisory|suggest)/i, "ai"],
  [/(scheduled|planned|info|new|reported|allotted|assigned|in progress|in_progress)/i, "info"],
];

export function toneForStatus(text: string | null | undefined, fallback: StatusTone = "neutral"): StatusTone {
  if (!text) return fallback;
  for (const [re, tone] of KEYWORDS) if (re.test(text)) return tone;
  return fallback;
}

export default function StatusPill({
  label,
  tone,
  icon,
  motion = "none",
  title,
  className = "",
}: {
  label: ReactNode;
  /** Explicit tone; when omitted the tone is inferred from the label text. */
  tone?: StatusTone;
  icon?: ReactNode;
  motion?: StatusMotion;
  title?: string;
  className?: string;
}) {
  const resolved = tone ?? toneForStatus(typeof label === "string" ? label : "", "neutral");
  const t = TONE[resolved];
  const Icon = ICON[resolved];
  const Motion = motion === "spin" ? Loader2 : null;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-[2px] text-[10.5px] font-semibold uppercase tracking-wide ${className}`}
      style={{ color: t.color, background: t.bg, borderColor: t.border }}
    >
      {Motion ? (
        <Motion size={11} className="animate-spin" aria-hidden />
      ) : motion === "pulse" ? (
        <span className="anim-blink" aria-hidden>
          {icon ?? <Icon size={11} />}
        </span>
      ) : (
        <span aria-hidden>{icon ?? <Icon size={11} />}</span>
      )}
      <span>{label}</span>
    </span>
  );
}

/** Small square badge for counters (KPI headers, nav). */
export function CountBadge({ value, tone = "critical" }: { value: number | string; tone?: StatusTone }) {
  const t = TONE[tone];
  return (
    <span
      className="inline-flex min-w-[18px] items-center justify-center rounded-[3px] px-1 py-[1px] font-mono text-[10px] font-bold"
      style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}` }}
    >
      {value}
    </span>
  );
}
