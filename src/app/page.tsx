"use client";

/**
 * RAIL RAKSHAK — PORTAL HOME (landing surface)
 *
 * A formal government-style portal front page rather than a marketing page:
 *
 *   1. utility strip ....... node identity · accessibility · language · day/night
 *   2. masthead ............ system name, tagline, entry actions
 *   3. hero ................ the live Delhi-NCR network schematic (real engine
 *                            data) beside the system statement
 *   4. module directory .... the six functional departments of the platform
 *   5. problem statement ... why the system exists (existing content, restated
 *                            in a portal register)
 *   6. architecture ........ numbered data → model → plan → work pipeline
 *   7. engines ............. the six engines, as a compact register
 *   8. operating reality ... constraints, planning horizons, benchmarks
 *   9. authority & notice .. AI advisory role, human authority, prototype disclosure
 *
 * Live data comes from the same engine modules the operations desks use
 * (`src/lib/engine/network.ts`, `livetrains.ts`), so the home page cannot drift
 * from the rest of the platform. No live departmental feed is contacted.
 */
import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  CloudFog,
  Cpu,
  Database,
  FileCheck2,
  Fingerprint,
  GitBranch,
  HardHat,
  KeyRound,
  LayoutGrid,
  Languages,
  Moon,
  Radio,
  ShieldCheck,
  ShieldHalf,
  Siren,
  Sliders,
  Sun,
  Timer,
  TrafficCone,
  TrainFront,
  Users,
  Waves,
  Wrench,
  Zap,
} from "lucide-react";
import RailMap from "@/components/RailMap";
import StatusPill from "@/components/StatusPill";
import { SEGMENTS, STATIONS, project } from "@/lib/engine/network";
import { getLiveTrains } from "@/lib/engine/livetrains";
import type { SegmentDTO, StationDTO } from "@/lib/engine/types";
import { useTheme } from "@/lib/theme";
import { useLang } from "@/lib/lang";

const stDTO: StationDTO[] = STATIONS.map((s, i) => {
  const p = project(s.lat, s.lng);
  return { id: i + 1, code: s.code, name: s.name, kind: s.kind, x: p.x, y: p.y, lat: s.lat, lng: s.lng, dailyTrains: s.dailyTrains, vipZone: s.vipZone };
});
const sgDTO: SegmentDTO[] = SEGMENTS.map((s, i) => ({
  id: i + 1,
  code: s.code,
  fromCode: s.from,
  toCode: s.to,
  corridor: s.corridor,
  lengthKm: s.lengthKm,
  isBridge: !!s.isBridge,
  isLevelCrossing: !!s.isLevelCrossing,
  dailyTrains: s.dailyTrains,
  criticality: s.criticality,
}));

const ENGINE_ICONS = [Fingerprint, Boxes, BrainCircuit, GitBranch, Waves, FileCheck2];
const CONSTRAINT_ICONS = [CloudFog, ShieldHalf, Waves, TrainFront, Zap, TrafficCone];
const STAGE_ICONS = [Database, Fingerprint, BrainCircuit, Sliders];

/** The six functional departments of the platform (portal directory). */
const MODULES = [
  {
    n: "01",
    code: "OPS-CC",
    name: "Operations Command",
    icon: LayoutGrid,
    purpose: "Divisional control-room view of the live grid: train positions, block occupancy, the urgency queue and the published plan.",
    routes: [
      { href: "/command", label: "Command Centre", access: "DRM · Control · Station Master" },
      { href: "/network", label: "Network Status", access: "Operations desks" },
      { href: "/station", label: "Station Desk", access: "Station Master" },
    ],
  },
  {
    n: "02",
    code: "AIP-BLK",
    name: "AI Planning",
    icon: BrainCircuit,
    purpose: "Optimiser, super-block bundling, strategy comparison and what-if simulation — always advisory to a human decision.",
    routes: [
      { href: "/planner", label: "AI Block Planner", access: "DRM · Control" },
      { href: "/superblocks", label: "Super Block Intelligence", access: "DRM · Control · Inspector" },
      { href: "/compare", label: "Strategy Comparison", access: "DRM · Control · Inspector" },
      { href: "/simulation", label: "What-If Simulation", access: "DRM · Control" },
      { href: "/replan", label: "Dynamic Re-Planning", access: "DRM · Control" },
    ],
  },
  {
    n: "03",
    code: "MTN-DEF",
    name: "Maintenance",
    icon: Wrench,
    purpose: "Eleven-stage defect lifecycle and the formal work-order record, from patrol report to validated closure.",
    routes: [
      { href: "/defects", label: "Defect Management", access: "DRM · Control · Station Master · Inspector" },
      { href: "/jobs", label: "Work Orders & Jobs", access: "Karmi · Inspector · DRM" },
    ],
  },
  {
    n: "04",
    code: "FLD-INS",
    name: "Field Operations",
    icon: HardHat,
    purpose: "Gang allotment, sanction windows, GPS-stamped before/after evidence and inspector sign-off — plus the login-free patrol handset.",
    routes: [
      { href: "/field", label: "Field Dashboard", access: "Inspector · DRM · Karmi" },
      { href: "/patrol", label: "Patrol Handset", access: "Open — no sign-in" },
    ],
  },
  {
    n: "05",
    code: "SAF-PTW",
    name: "Safety & Permits",
    icon: ShieldCheck,
    purpose: "Permit-to-work register, evidence compliance per occupancy and the combined block safety work order.",
    routes: [
      { href: "/safety", label: "Safety & Permits", access: "DRM · Control · Inspector · Station Master" },
      { href: "/audit", label: "Approvals & Audit Trail", access: "DRM · Control · Station Master" },
    ],
  },
  {
    n: "06",
    code: "PAX-TV",
    name: "Passenger Services",
    icon: Users,
    purpose: "Citizen journey view: where the train is now, expected delay and whether planned maintenance affects the journey.",
    routes: [{ href: "/trains", label: "Citizen Train View", access: "Open — no sign-in" }],
  },
];

export default function Landing() {
  const trains = useMemo(() => getLiveTrains(), []);
  const { theme, toggle } = useTheme();
  const { lang, setLang, t } = useLang();

  const METRICS: [string, string, string, string][] = [
    [t("m.1"), "0", "5–10 per month", t("m.1.note")],
    [t("m.2"), "74.8%", "< 10% (legacy)", t("m.2.note")],
    [t("m.3"), "↓ 42%", "Manual baseline", t("m.3.note")],
    [t("m.4"), "~7.2 min", "28–45 min", t("m.4.note")],
    [t("m.5"), "< 60 sec", "4–6 hours", t("m.5.note")],
    [t("m.6"), "< 1 sec", "4–6 hours", t("m.6.note")],
    [t("m.7"), "0% leakage", "Paper sign-offs", t("m.7.note")],
  ];

  const running = trains.filter((t) => t.status === "RUNNING").length;
  const corridors = [...new Set(SEGMENTS.map((s) => s.corridor))];

  return (
    <div className="min-h-screen bg-abyss text-ink">
      <a href="#portal-main" className="skip-link">
        Skip to main content
      </a>

      {/* ══════════ UTILITY STRIP ══════════ */}
      <div className="border-b border-edge bg-primary on-accent">
        <div className="mx-auto flex h-8 max-w-[1400px] items-center justify-between gap-3 px-4">
          <p className="truncate text-[11px] text-on-accent/90">
            <span className="font-semibold">Rail Rakshak</span>
            <span className="mx-1.5 text-on-accent/40">·</span>
            Indian Railways Block Orchestration System
            <span className="mx-1.5 hidden text-on-accent/40 sm:inline">·</span>
            <span className="hidden sm:inline">Node NR-DELHI-03 — Delhi Division</span>
          </p>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-[11px] text-on-accent/85 md:flex">
              <ShieldCheck size={12} aria-hidden /> Accessibility: keyboard-first, text status labels, reduced-motion aware
            </span>
            <label className="flex items-center gap-1 rounded-[3px] px-1.5 py-1 text-[11px] text-on-accent/90 hover:bg-on-accent/10">
              <Languages size={12} aria-hidden />
              <span className="sr-only">Interface language</span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value === "hi" ? "hi" : "en")}
                className="cursor-pointer bg-transparent text-[11px] text-on-accent outline-none [&>option]:text-ink"
                aria-label="Interface language"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </label>
            <button
              onClick={toggle}
              className="flex items-center gap-1 rounded-[3px] px-1.5 py-1 text-[11px] text-on-accent/90 hover:bg-on-accent/10"
              aria-label={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
            >
              {theme === "dark" ? <Sun size={12} aria-hidden /> : <Moon size={12} aria-hidden />}
              <span className="hidden sm:inline">{theme === "dark" ? "Day" : "Night"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════ MASTHEAD ══════════ */}
      <header className="border-b border-edge bg-hull">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-primary on-accent">
              <TrainFront size={23} strokeWidth={2.2} aria-hidden />
            </span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-[17px] font-extrabold leading-none tracking-tight text-ink">
                RAIL RAKSHAK
                <span className="rounded-[3px] border border-saffron/40 bg-saffron/[0.07] px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wider text-saffron">
                  Prototype
                </span>
              </p>
              <p className="mt-1 text-[11.5px] font-medium text-dim">{t("app.tagline")} · {t("app.northern")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="Portal operational" tone="success" className="hidden sm:inline-flex" />
            <Link href="/login" className="btn btn-primary">
              <KeyRound size={13} aria-hidden /> Officer / Karmi sign-in
            </Link>
          </div>
        </div>
      </header>

      <main id="portal-main">
        {/* ══════════ HERO ══════════ */}
        <section className="border-b border-edge bg-panel">
          <div className="mx-auto grid max-w-[1400px] gap-0 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,620px)] lg:gap-6 lg:py-8">
            <div className="flex flex-col justify-center">
              <p className="flex flex-wrap items-center gap-2">
                <StatusPill label={t("hero.badge")} tone="info" />
                <StatusPill label="AI advisory · human authority" tone="ai" />
              </p>

              <h1 className="mt-3 text-[26px] font-extrabold uppercase leading-[1.15] tracking-tight text-ink sm:text-[32px]">
                RAIL RAKSHAK
                <span className="mt-1 block text-[14px] font-bold uppercase tracking-[0.06em] text-primary sm:text-[15px]">
                  AI-Powered Railway Operations &amp; Maintenance Management System
                </span>
              </h1>

              <p className="mt-3 max-w-2xl border-l-2 border-saffron pl-3 text-[13.5px] font-semibold leading-relaxed text-ink">
                Intelligent planning. Safer operations. Higher asset availability.
              </p>

              <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-dim">{t("problem.desc")}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href="/login" className="btn btn-primary">
                  Enter operations portal <ArrowRight size={13} aria-hidden />
                </Link>
                <Link href="/trains" className="btn">
                  <Users size={13} aria-hidden /> Citizen train view
                </Link>
                <Link href="/patrol" className="btn">
                  <Radio size={13} aria-hidden /> Patrol handset
                </Link>
              </div>

              <dl className="mt-5 grid gap-x-4 gap-y-2 border-t border-edge pt-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Sections monitored", String(SEGMENTS.length)],
                  ["Stations in grid", String(STATIONS.length)],
                  ["Corridors", String(corridors.length)],
                  ["Trains in tracking window", `${running} running / ${trains.length}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-faint">{k}</dt>
                    <dd className="mt-0.5 font-mono text-lg font-bold leading-none text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Railway network visual — the real schematic, not decorative art */}
            <div className="mt-5 lg:mt-0">
              <div className="border border-edge bg-panel">
                <div className="panel-hd">
                  <span className="flex items-center gap-2">
                    <Radio size={12} className="text-mint" aria-hidden /> Delhi-NCR divisional schematic
                  </span>
                  <StatusPill label="Display panel" tone="neutral" />
                </div>
                <div className="map-canvas gridlines p-2">
                  <RailMap stations={stDTO} segments={sgDTO} blockedSegmentIds={[]} fog={false} vip={false} liveTrains={trains} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge px-3 py-2 text-[10.5px] text-dim">
                  <span>{corridors.join(" · ")}</span>
                  <Link href="/trains" className="btn-link ml-auto">
                    Open the citizen journey view
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════ MODULE DIRECTORY ══════════ */}
        <section className="border-b border-edge bg-abyss">
          <div className="mx-auto max-w-[1400px] px-4 py-6">
            <header className="dept-bar">
              <h2 className="text-[14px] font-bold uppercase tracking-wide">Functional directory</h2>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
                six departments · {(MODULES.reduce((n, m) => n + m.routes.length, 0))} modules
              </span>
            </header>
            <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-dim">
              Every module below is a working desk backed by the same engine. Access is decided by the account you sign in with — the desk you are
              entitled to is the desk the system opens. Public services need no sign-in.
            </p>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {MODULES.map((m) => (
                <article key={m.code} className="flex flex-col border border-edge bg-panel">
                  <div className="flex items-start gap-2.5 border-b border-edge bg-abyss px-3 py-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-primary/25 bg-primary/[0.06] text-primary">
                      <m.icon size={16} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-faint">{m.n}</span>
                        <span className="rounded-[3px] border border-primary/25 px-1 py-[1px] font-mono text-[9.5px] font-bold text-primary">{m.code}</span>
                      </p>
                      <h3 className="mt-0.5 text-[13px] font-bold leading-tight text-ink">{m.name}</h3>
                    </div>
                  </div>
                  <p className="flex-1 px-3 py-2 text-[11.5px] leading-relaxed text-dim">{m.purpose}</p>
                  <ul className="divide-y divide-edge border-t border-edge">
                    {m.routes.map((r) => (
                      <li key={r.href}>
                        <Link href={r.href} className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-primary/[0.04]">
                          <span className="text-[11.5px] font-semibold text-primary">{r.label}</span>
                          <span className="shrink-0 text-right text-[10px] text-faint">{r.access}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ PROBLEM STATEMENT ══════════ */}
        <section className="border-b border-edge bg-panel">
          <div className="mx-auto max-w-[1400px] px-4 py-6">
            <header className="dept-bar">
              <h2 className="text-[14px] font-bold uppercase tracking-wide">{t("problem.h2")}</h2>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{t("problem.tag")}</span>
            </header>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <article key={n} className="border border-edge bg-panel px-3 py-2.5">
                  <p className="font-mono text-[10.5px] font-bold text-faint">{String(n).padStart(2, "0")}</p>
                  <h3 className="mt-1 text-[12.5px] font-bold text-ink">{t(`problem.${n}.title`)}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-dim">{t(`problem.${n}.desc`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════ ARCHITECTURE PIPELINE ══════════ */}
        <section className="border-b border-edge bg-abyss">
          <div className="mx-auto max-w-[1400px] px-4 py-6">
            <header className="dept-bar">
              <h2 className="text-[14px] font-bold uppercase tracking-wide">{t("arch.h2")}</h2>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{t("arch.tag")}</span>
            </header>
            <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-dim">{t("arch.desc")}</p>

            <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((n, i) => {
                const Icon = STAGE_ICONS[i];
                return (
                  <li key={n} className="border border-edge bg-panel">
                    <div className="flex items-center justify-between border-b border-edge px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-[2px] bg-primary font-mono text-[10px] font-bold on-accent">
                          {n}
                        </span>
                        <span className="text-[12px] font-bold text-ink">{t(`arch.s${n}.name`)}</span>
                      </span>
                      <Icon size={15} className="text-primary" aria-hidden />
                    </div>
                    <ul className="space-y-1 px-3 py-2">
                      {[1, 2, 3, 4].map((p) => (
                        <li key={p} className="flex items-start gap-1.5 text-[11px] leading-snug text-dim">
                          <CheckCircle2 size={11} className="mt-[2px] shrink-0 text-mint" aria-hidden />
                          <span>{t(`arch.s${n}.p${p}`)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="border-t border-edge px-3 py-1.5 font-mono text-[10px] text-faint">{t(`arch.s${n}`)}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ══════════ ENGINE REGISTER ══════════ */}
        <section className="border-b border-edge bg-panel">
          <div className="mx-auto max-w-[1400px] px-4 py-6">
            <header className="dept-bar">
              <h2 className="text-[14px] font-bold uppercase tracking-wide">{t("engines.h2")}</h2>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{t("engines.tag")}</span>
            </header>
            <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-dim">{t("engines.desc")}</p>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((n, i) => {
                const Icon = ENGINE_ICONS[i];
                return (
                  <article key={n} className="flex flex-col border border-edge bg-panel">
                    <div className="flex items-start justify-between gap-2 border-b border-edge px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-[3px] border border-primary/25 bg-primary/[0.06] text-primary">
                          <Icon size={14} aria-hidden />
                        </span>
                        <span className="text-[12.5px] font-bold text-ink">{t(`eng.${n}.title`)}</span>
                      </span>
                      <StatusPill label={t(`eng.${n}.tag`)} tone="info" />
                    </div>
                    <div className="flex-1 px-3 py-2">
                      <p className="font-mono text-[10px] text-faint">{t(`eng.${n}.tech`)}</p>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-dim">{t(`eng.${n}.desc`)}</p>
                    </div>
                    <p className="flex items-center gap-1.5 border-t border-edge px-3 py-1.5 text-[11px] font-semibold text-mint">
                      <BadgeCheck size={12} aria-hidden /> {t(`eng.${n}.highlight`)}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══════════ OPERATING REALITY ══════════ */}
        <section className="border-b border-edge bg-abyss">
          <div className="mx-auto max-w-[1400px] px-4 py-6">
            <header className="dept-bar">
              <h2 className="text-[14px] font-bold uppercase tracking-wide">Operating conditions modelled</h2>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">
                {new Date().getFullYear()} · Delhi Division
              </span>
            </header>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((n, i) => {
                const Icon = CONSTRAINT_ICONS[i];
                return (
                  <article key={n} className="flex items-start gap-2.5 border border-edge bg-panel px-3 py-2.5">
                    <span className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border border-saffron/30 bg-saffron/[0.07] text-saffron">
                      <Icon size={14} aria-hidden />
                    </span>
                    <div>
                      <p className="text-[12px] font-bold text-ink">{t(`const.${n}`)}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-dim">{t(`const.${n}.sub`)}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Benchmarks */}
            <header className="dept-bar mt-5">
              <h2 className="text-[14px] font-bold uppercase tracking-wide">{t("bench.h2")}</h2>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">{t("bench.tag")}</span>
            </header>
            <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-dim">{t("bench.desc")}</p>

            <div className="gov-table-wrap mt-3">
              <table className="gov-table">
                <caption className="sr-only">Platform metrics against the manual baseline</caption>
                <thead>
                  <tr>
                    <th className="sr">Sr</th>
                    <th>{t("bench.col.metric")}</th>
                    <th>{t("bench.col.old")}</th>
                    <th>{t("bench.col.ours")}</th>
                    <th>{t("bench.col.why")}</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map(([metric, ours, old, note], i) => (
                    <tr key={metric}>
                      <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                      <td className="text-[11.5px] font-semibold text-ink">{metric}</td>
                      <td className="whitespace-nowrap text-[11px] text-dim">{old}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-[11.5px] font-bold text-mint">{ours}</span>
                      </td>
                      <td className="text-[11px] text-dim">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">
              Figures are targets and measured prototype results for the seeded Delhi-NCR dataset, reported here as engineering claims with their
              basis — not as audited departmental statistics.
            </p>
          </div>
        </section>

        {/* ══════════ AUTHORITY & NOTICE ══════════ */}
        <section className="bg-panel">
          <div className="mx-auto grid max-w-[1400px] gap-3 px-4 py-6 lg:grid-cols-3">
            <article className="border border-edge bg-panel px-3 py-3 lg:col-span-2">
              <header className="dept-bar">
                <h2 className="text-[13px] font-bold uppercase tracking-wide">Decision authority &amp; accountability</h2>
              </header>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="border border-edge px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                    <BrainCircuit size={13} className="text-violet" aria-hidden /> The assistant recommends
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-dim">
                    The optimiser drafts occupancies, scores feasibility and states its reasoning and measured impact. Every AI output on the platform is
                    labelled a recommendation.
                  </p>
                </div>
                <div className="border border-edge px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                    <ShieldCheck size={13} className="text-primary" aria-hidden /> The officer decides
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-dim">
                    Approval, rejection and override are reserved for the divisional desk and are recorded with actor, reason and timestamp. No block is
                    published without a human decision.
                  </p>
                </div>
                <div className="border border-edge px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                    <Timer size={13} className="text-saffron" aria-hidden /> Traceable by design
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-dim">
                    Defect stage changes, plan versions, permits and field evidence are appended to an audit trail that is never rewritten.
                  </p>
                </div>
                <div className="border border-edge px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink">
                    <Cpu size={13} className="text-cyan" aria-hidden /> Honest about data
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-dim">
                    This evaluation build runs on a seeded prototype dataset over real Delhi-NCR geography. Departmental interfaces are documented
                    contracts; no live railway system is contacted.
                  </p>
                </div>
              </div>
            </article>

            <aside className="border border-saffron/40 bg-saffron/[0.06] px-3 py-3">
              <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-saffron">
                <Siren size={13} aria-hidden /> Prototype notice
              </p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-dim">
                Rail Rakshak is an independent Smart India Hackathon evaluation prototype (problem statement #26027). It is{" "}
                <strong className="text-ink">not an official Government of India or Indian Railways website</strong>, uses no Government emblem or railway
                logo, and must not be relied upon for real train operation.
              </p>
              <p className="mt-2 text-[11px] text-faint">
                Branding, palette and layout are original to this project.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/login" className="btn btn-primary btn-sm">
                  <KeyRound size={12} aria-hidden /> Sign in
                </Link>
                <Link href="/trains" className="btn btn-sm">
                  <TrainFront size={12} aria-hidden /> Train status
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge bg-hull">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-dim">
          <p>
            <span className="font-semibold text-ink">RAIL RAKSHAK</span> · {t("app.footer.node")}
          </p>
          <p className="text-faint">{t("app.footer.sih")} · Prototype evaluation build — not an official Government of India website</p>
        </div>
      </footer>
    </div>
  );
}
