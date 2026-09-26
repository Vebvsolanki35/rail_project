/**
 * Rakshak Patrol category catalogue — PURE (no DB, no server imports) so the
 * field handset can render it client-side while the server intake path
 * (fieldreport.ts) validates against the very same list.
 */

export const PATROL_CATEGORIES = [
  { key: "rail-crack", label: "Rail Crack / Weld Failure", department: "ENG", severity: 9, durationMin: 90, icon: "⚠", hint: "Safety-critical: immediate block or speed restriction." },
  { key: "track-joint", label: "Track Joint / Fastening", department: "ENG", severity: 6, durationMin: 60, icon: "🛠", hint: "Joint gap, loose fastenings, corrosion cluster." },
  { key: "fouling", label: "Fouling / Alignment", department: "ENG", severity: 7, durationMin: 75, icon: "📐", hint: "Ballast fouling, twist, gauge irregularity." },
  { key: "ohe-spark", label: "OHE Spark / Flashover", department: "TRD", severity: 8, durationMin: 70, icon: "⚡", hint: "Needs a power block — traction section must be isolated." },
  { key: "ohe-wire", label: "OHE Wire Sag / Breakage", department: "TRD", severity: 9, durationMin: 110, icon: "🔌", hint: "Severe: can stop electric traction entirely." },
  { key: "signal-fail", label: "Signal Failure / Point Motor", department: "SNT", severity: 8, durationMin: 65, icon: "🚦", hint: "Signal blanking, point obstruction, relay fault." },
  { key: "cable-theft", label: "Cable Theft / Damage", department: "SNT", severity: 7, durationMin: 80, icon: "🧵", hint: "Report immediately — theft cases need RPF intimation." },
  { key: "level-crossing", label: "Level Crossing Gate Fault", department: "SNT", severity: 7, durationMin: 55, icon: "🚧", hint: "Boom failure or interlocking fault at an LC gate." },
  { key: "waterlogging", label: "Waterlogging / Drainage", department: "ENG", severity: 5, durationMin: 60, icon: "💧", hint: "Standing water, blocked drain, bank erosion." },
  { key: "bridge-structure", label: "Bridge / Structure Damage", department: "ENG", severity: 8, durationMin: 120, icon: "🌉", hint: "Girder, bearing or pier damage — report with photos." },
] as const;

export type PatrolCategoryKey = (typeof PATROL_CATEGORIES)[number]["key"];

export function categoryMeta(key: string) {
  return PATROL_CATEGORIES.find((c) => c.key === key) ?? PATROL_CATEGORIES[1];
}

/**
 * Default rectification deadline by severity (days) — the permit-to-work
 * convention the urgency engine reads from `defects.dueInDays`.
 */
export function defaultDueDays(severity: number): number {
  if (severity >= 9) return 0; // safety-critical: act today
  if (severity >= 8) return 1;
  if (severity >= 7) return 3;
  if (severity >= 6) return 7;
  if (severity >= 4) return 14;
  return 30;
}
