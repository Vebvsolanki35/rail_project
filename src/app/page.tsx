"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
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
  Languages,
  Layers,
  Moon,
  Radar,
  Radio,
  ShieldCheck,
  ShieldHalf,
  Siren,
  Sliders,
  Sparkles,
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
  id: i + 1, code: s.code, fromCode: s.from, toCode: s.to, corridor: s.corridor, lengthKm: s.lengthKm,
  isBridge: !!s.isBridge, isLevelCrossing: !!s.isLevelCrossing, dailyTrains: s.dailyTrains, criticality: s.criticality,
}));

const ENGINE_ICONS = [Fingerprint, Boxes, BrainCircuit, GitBranch, Waves, FileCheck2];
const CONSTRAINT_ICONS = [CloudFog, ShieldHalf, Waves, TrainFront, Zap, TrafficCone];
const STAGE_ICONS = [Database, Fingerprint, BrainCircuit, Sliders];
const STAGE_COLORS = ["#0369a1", "#15803d", "#b45309", "#7c3aed"];

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
});

export default function Landing() {
  const trains = useMemo(() => getLiveTrains(), []);
  const { theme, toggle } = useTheme();
  const { lang, setLang, t } = useLang();

  const METRICS_TRANSLATED: [string, string, string, string][] = [
    [t("m.1"), "0", "5–10 per month", t("m.1.note")],
    [t("m.2"), "74.8%", "< 10% (legacy)", t("m.2.note")],
    [t("m.3"), "↓ 42%", "Manual baseline", t("m.3.note")],
    [t("m.4"), "~7.2 min", "28–45 min", t("m.4.note")],
    [t("m.5"), "< 60 sec", "4–6 hours", t("m.5.note")],
    [t("m.6"), "< 1 sec", "4–6 hours", t("m.6.note")],
    [t("m.7"), "0% leakage", "Paper sign-offs", t("m.7.note")],
  ];

  return (
    <div className="min-h-screen bg-abyss text-ink">
      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-30 border-b border-edge bg-hull">
        <div className="tricolor" />
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white font-bold shadow-sm">
              <TrainFront size={20} strokeWidth={2.2} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-ink">{t("app.name")}</span>
                <span className="hidden rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline-block">
                  {t("app.northern")}
                </span>
              </div>
              <p className="text-[11px] text-dim">{t("app.tagline")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Day/Night Toggle */}
            <button
              onClick={toggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel text-dim hover:text-ink transition"
              title={theme === "dark" ? "Day Mode" : "Night Mode"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Hindi/English Toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-xs font-medium text-dim hover:text-ink transition"
            >
              <Languages size={14} />
              <span>{lang === "en" ? "हिन्दी" : "English"}</span>
            </button>

            <span className="hidden items-center gap-1.5 rounded-full border border-edge bg-panel px-3 py-1 text-xs font-medium text-dim md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 anim-blink" />
              {t("grid.live")}
            </span>
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              <KeyRound size={13} /> {t("btn.signin.desks")}
            </Link>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden border-b border-edge py-16 sm:py-24">
        {/* Background rail network map */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.15] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_40%,#000_70%,transparent_100%)]">
          <RailMap stations={stDTO} segments={sgDTO} liveTrains={trains} />
        </div>

        <div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8">
          <motion.div {...fade(0)} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3.5 py-1 text-xs font-semibold text-primary">
            <Sparkles size={13} />
            <span>{t("hero.badge")}</span>
          </motion.div>

          <motion.h1 {...fade(0.08)} className="mt-6 text-4xl font-extrabold tracking-tight text-ink sm:text-6xl sm:leading-[1.08]">
            {t("hero.h1.line1")} <br className="hidden sm:inline" />
            <span className="text-primary">
              {t("hero.h1.line2")}
            </span>
          </motion.h1>

          <motion.p {...fade(0.14)} className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-dim sm:text-lg">
            {t("hero.desc")}
          </motion.p>

          <motion.div {...fade(0.2)} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
            >
              <Radar size={16} /> {t("btn.open.command")} <ArrowRight size={15} />
            </Link>
            <Link
              href="/simulation"
              className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-6 py-3.5 text-sm font-semibold text-ink shadow-sm transition hover:bg-abyss"
            >
              <Siren size={16} className="text-red-500" /> {t("btn.test.crisis")}
            </Link>
            <Link
              href="/trains"
              className="flex items-center gap-2 rounded-xl border border-mint/40 bg-mint/10 px-6 py-3.5 text-sm font-semibold text-mint shadow-sm transition hover:bg-mint/15"
            >
              <Users size={16} /> {t("btn.citizen")}
            </Link>
          </motion.div>

          {/* Key Facts Strip */}
          <motion.div {...fade(0.26)} className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { valKey: "stat.sections.val", labelKey: "stat.sections.label", subKey: "stat.sections.sub" },
              { valKey: "stat.trains.val", labelKey: "stat.trains.label", subKey: "stat.trains.sub" },
              { valKey: "stat.roles.val", labelKey: "stat.roles.label", subKey: "stat.roles.sub" },
              { valKey: "stat.downtime.val", labelKey: "stat.downtime.label", subKey: "stat.downtime.sub" },
            ].map((stat, i) => (
              <div key={i} className="rounded-xl border border-edge bg-panel p-4 text-left">
                <p className="text-2xl font-bold tracking-tight text-primary font-mono">{t(stat.valKey)}</p>
                <p className="mt-1 text-xs font-semibold text-ink">{t(stat.labelKey)}</p>
                <p className="mt-0.5 text-[11px] text-faint">{t(stat.subKey)}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ================= THE PROBLEM ================= */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <motion.div {...fade(0)}>
          <span className="text-xs font-semibold tracking-wider text-red-600 uppercase dark:text-red-400">{t("problem.tag")}</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t("problem.h2")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim">
            {t("problem.desc")}
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((num, i) => (
            <motion.div key={num} {...fade(0.06 * i)} className="panel p-5">
              <span className="font-mono text-xs font-bold text-primary/70">{String(num).padStart(2, "0")}</span>
              <h3 className="mt-2 text-base font-bold text-ink">{t(`problem.${num}.title`)}</h3>
              <p className="mt-2 text-xs leading-relaxed text-dim">{t(`problem.${num}.desc`)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ================= ARCHITECTURE PIPELINE ================= */}
      <section className="border-y border-edge bg-hull/50 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <motion.div {...fade(0)}>
            <span className="text-xs font-semibold tracking-wider text-cyan uppercase dark:text-cyan">{t("arch.tag")}</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {t("arch.h2")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim">
              {t("arch.desc")}
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((num, i) => {
              const Icon = STAGE_ICONS[i];
              const color = STAGE_COLORS[i];
              return (
                <motion.div key={num} {...fade(0.08 * i)} className="panel p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-medium text-faint">{t(`arch.s${num}`)}</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}12`, color }}>
                      <Icon size={16} />
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-ink">{t(`arch.s${num}.name`)}</h3>
                  <ul className="mt-3 space-y-2 text-xs text-dim">
                    {[1, 2, 3, 4].map((pIdx) => (
                      <li key={pIdx} className="flex items-start gap-2">
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                        <span>{t(`arch.s${num}.p${pIdx}`)}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= ENGINES / FEATURES ================= */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <motion.div {...fade(0)}>
          <span className="text-xs font-semibold tracking-wider text-green-700 uppercase dark:text-green-400">{t("engines.tag")}</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t("engines.h2")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim">
            {t("engines.desc")}
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((num, i) => {
            const Icon = ENGINE_ICONS[i];
            return (
              <motion.div key={num} {...fade(0.06 * (i % 3))} className="panel p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
                      <Icon size={18} />
                    </span>
                    <span className="rounded-full border border-edge bg-abyss px-2.5 py-0.5 text-[10.5px] font-medium text-dim">
                      {t(`eng.${num}.tag`)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-ink">{t(`eng.${num}.title`)}</h3>
                  <p className="mt-0.5 text-[11px] font-mono text-faint">{t(`eng.${num}.tech`)}</p>
                  <p className="mt-2.5 text-xs leading-relaxed text-dim">{t(`eng.${num}.desc`)}</p>
                </div>
                <div className="mt-4 border-t border-edge pt-3">
                  <span className="text-[11px] font-semibold text-green-700 dark:text-green-400">{t(`eng.${num}.highlight`)}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Constraints Grid */}
        <div className="mt-12">
          <p className="text-xs font-semibold tracking-wider text-faint uppercase">{t("constraints.tag")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((num, i) => {
              const Icon = CONSTRAINT_ICONS[i];
              return (
                <motion.div key={num} {...fade(0.04 * (i % 3))} className="flex items-start gap-3 rounded-xl border border-edge bg-panel p-3.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon size={15} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-ink">{t(`const.${num}`)}</p>
                    <p className="mt-0.5 text-[11px] text-dim">{t(`const.${num}.sub`)}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= PLANNING HORIZONS ================= */}
      <section className="border-y border-edge bg-hull/50 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <motion.div {...fade(0)}>
            <span className="text-xs font-semibold tracking-wider text-cyan uppercase">{t("horizons.tag")}</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {t("horizons.h2")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim">
              {t("horizons.desc")}
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: "T+4h", num: 1 },
              { k: "7 Days", num: 2 },
              { k: "28 Days", num: 3 },
              { k: "< 60s", num: 4 },
            ].map((h, i) => (
              <motion.div key={h.k} {...fade(0.07 * i)} className="panel p-5 relative overflow-hidden">
                <p className="font-mono text-2xl font-bold text-primary">{h.k}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{t(`hz.${h.num}.badge`)}</p>
                <h3 className="mt-2 text-sm font-bold text-ink">{t(`hz.${h.num}.title`)}</h3>
                <p className="mt-2 text-xs leading-relaxed text-dim">{t(`hz.${h.num}.desc`)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= BENCHMARKS & METRICS ================= */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <motion.div {...fade(0)}>
          <span className="text-xs font-semibold tracking-wider text-primary uppercase">{t("bench.tag")}</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t("bench.h2")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-dim">
            {t("bench.desc")}
          </p>
        </motion.div>

        <motion.div {...fade(0.1)} className="panel mt-8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-edge bg-abyss text-[11px] font-semibold text-dim uppercase tracking-wider">
                  <th className="px-5 py-3.5">{t("bench.col.metric")}</th>
                  <th className="px-5 py-3.5 text-green-700 dark:text-green-400">{t("bench.col.ours")}</th>
                  <th className="px-5 py-3.5 text-faint">{t("bench.col.old")}</th>
                  <th className="hidden px-5 py-3.5 text-dim md:table-cell">{t("bench.col.why")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {METRICS_TRANSLATED.map(([m, target, base, note], i) => (
                  <tr key={m} className={`hover:bg-primary/[0.02] ${i % 2 === 1 ? "bg-abyss/50" : ""}`}>
                    <td className="px-5 py-3.5 font-medium text-ink">{m}</td>
                    <td className="px-5 py-3.5 font-mono font-bold text-green-700 dark:text-green-400">{target}</td>
                    <td className="px-5 py-3.5 font-mono text-faint">{base}</td>
                    <td className="hidden px-5 py-3.5 text-dim md:table-cell">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </section>

      {/* ================= CTA ================= */}
      <section className="border-t border-edge bg-hull/60 py-20 text-center">
        <div className="mx-auto max-w-2xl px-5">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
            <TrainFront size={24} />
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t("cta.h2")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-dim">
            {t("cta.desc")}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-xs font-semibold text-white shadow-md transition hover:opacity-90"
            >
              <KeyRound size={14} /> {t("btn.open.desks")}
            </Link>
            <Link
              href="/patrol"
              className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-6 py-3.5 text-xs font-semibold text-ink transition hover:bg-abyss"
            >
              <HardHat size={14} className="text-primary" /> {t("btn.gangman.app")} <ArrowRight size={14} />
            </Link>
            <Link
              href="/trains"
              className="flex items-center gap-2 rounded-xl border border-mint/40 bg-mint/10 px-6 py-3.5 text-xs font-semibold text-mint transition hover:bg-mint/15"
            >
              <Users size={14} /> {t("btn.citizen")} <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-edge bg-abyss py-6">
        <div className="tricolor mb-6 opacity-60" />
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-xs text-faint sm:flex-row sm:px-8">
          <p>{t("app.footer")}</p>
          <p>{t("app.footer.sih")}</p>
        </div>
      </footer>
    </div>
  );
}
