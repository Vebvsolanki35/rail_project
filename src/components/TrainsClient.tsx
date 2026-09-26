"use client";

/**
 * Citizen Train View — public passenger page for /trains.
 *
 * Distinct from the internal operations dashboards: no role gate, no
 * operational controls — just journey status and an honest, prototype-data
 * explanation of how Rail Rakshak's maintenance planning affects a journey.
 * All data comes from the existing /api/trains endpoints (demo dataset).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronLeft,
  CircleDot,
  Clock3,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrainFront,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import type { CitizenJourneyDTO, CitizenSearchResultDTO } from "@/lib/engine/types";

const KIND_LABELS: Record<string, string> = {
  RAJDHANI: "Rajdhani Class",
  VANDE_BHARAT: "Vande Bharat",
  SHATABDI: "Shatabdi Express",
  EXPRESS: "Express",
  PASSENGER: "Passenger / EMU",
  DFC_FREIGHT: "Freight (DFC)",
  RAPIDX: "Namo Bharat (RRTS)",
};

const STATUS_STYLES: Record<string, { chip: string; dot: string }> = {
  "Running Normally": { chip: "border-mint/40 bg-mint/10 text-mint", dot: "bg-mint" },
  "Maintenance Window Nearby": { chip: "border-amber/40 bg-amber/10 text-amber", dot: "bg-amber" },
  "Minor Operational Impact": { chip: "border-saffron/40 bg-saffron/10 text-saffron", dot: "bg-saffron" },
  "High Operational Impact": { chip: "border-signal/40 bg-signal/10 text-signal", dot: "bg-signal" },
};

const LEVEL_STYLES: Record<string, { banner: string; text: string; bar: string }> = {
  GREEN: { banner: "border-mint/40 bg-mint/10", text: "text-mint", bar: "bg-mint" },
  YELLOW: { banner: "border-amber/40 bg-amber/10", text: "text-amber", bar: "bg-amber" },
  RED: { banner: "border-signal/40 bg-signal/10", text: "text-signal", bar: "bg-signal" },
};

const REASON_KIND_LABELS: Record<string, string> = {
  "active-work": "Active work",
  "field-job": "Scheduled work",
  "planned-block": "Planned block",
  "safety-watch": "Safety watch",
};

const QUICK_PICKS: { number: string; label: string }[] = [
  { number: "12951", label: "Mumbai Rajdhani" },
  { number: "22439", label: "Vande Bharat" },
  { number: "12301", label: "Howrah Rajdhani" },
  { number: "NB-101", label: "Namo Bharat RRTS" },
];


export default function TrainsClient() {
  const [mode, setMode] = useState<"number" | "name">("number");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CitizenSearchResultDTO[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [journey, setJourney] = useState<CitizenJourneyDTO | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [blankHint, setBlankHint] = useState(false);
  const [offline, setOffline] = useState(false);

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    setSearched(true);
    setJourney(null);
    setSelectedNumber(null);
    if (!trimmed) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/trains?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("search failed");
      const d = await res.json();
      setResults(d.results ?? []);
      setOffline(false);
    } catch {
      setResults([]);
      setOffline(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadJourney = useCallback(async (number: string) => {
    setDetailBusy(true);
    try {
      const res = await fetch(`/api/trains/${encodeURIComponent(number)}`, { cache: "no-store" });
      if (!res.ok) {
        setJourney(null);
        return;
      }
      const d: CitizenJourneyDTO = await res.json();
      setJourney(d);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setDetailBusy(false);
    }
  }, []);

  const pick = useCallback(
    (number: string) => {
      setSelectedNumber(number);
      void loadJourney(number);
    },
    [loadJourney]
  );

  // gentle auto-refresh of the selected journey (prototype clock)
  useEffect(() => {
    if (!selectedNumber) return;
    const id = setInterval(() => {
      void loadJourney(selectedNumber);
    }, 45_000);
    return () => clearInterval(id);
  }, [selectedNumber, loadJourney]);

  const st = journey ? STATUS_STYLES[journey.journey.statusLabel] ?? STATUS_STYLES["Running Normally"] : null;
  const lv = journey ? LEVEL_STYLES[journey.impact.level] : null;

  return (
    <div className="min-h-screen bg-abyss text-ink">
      {/* ============ HEADER — public service chrome ============ */}
      <div className="tricolor" aria-hidden />
      <div className="border-b border-edge bg-primary on-accent">
        <div className="mx-auto flex h-8 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <p className="truncate text-[11px] text-on-accent/90">
            <span className="font-semibold">RAIL RAKSHAK</span>
            <span className="mx-1.5 text-on-accent/40">·</span>
            Passenger services — open to all, no sign-in
          </p>
          <span className="hidden text-[11px] text-on-accent/85 sm:block">Journey status &amp; maintenance impact</span>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-edge bg-hull">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-primary on-accent">
              <TrainFront size={21} strokeWidth={2.2} aria-hidden />
            </span>
            <span>
              <span className="block text-[15px] font-extrabold tracking-tight text-ink">RAIL RAKSHAK</span>
              <span className="block text-[11px] font-medium text-dim">Citizen Train View — journey status &amp; maintenance impact</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-amber/40 bg-amber/10 px-2 py-1 text-[10.5px] font-semibold text-amber">
              <Info size={12} aria-hidden /> Prototype data
            </span>
            <Link href="/login" className="hidden items-center gap-1.5 rounded-[3px] border border-edge bg-panel px-2.5 py-1.5 text-[11.5px] font-medium text-dim hover:border-primary hover:text-primary sm:flex">
              <Users size={13} aria-hidden /> Railway staff
            </Link>
          </div>
        </div>
        <nav aria-label="Breadcrumb" className="crumb mx-auto max-w-5xl px-4 pb-1.5 sm:px-6">
          <Link href="/">Portal home</Link>
          <span className="flex items-center gap-2">
            <span className="sep">›</span>
            <span className="cur">Citizen Train View</span>
          </span>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* ============ SEARCH HERO ============ */}
        <section className="py-10 sm:py-14">
          <div className="anim-rise text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3.5 py-1 text-xs font-semibold text-primary">
              <Sparkles size={13} /> For Passengers
            </span>
            <h1 className="mx-auto mt-4 max-w-3xl border-b border-edge pb-2 text-[20px] font-bold tracking-tight text-ink sm:text-[22px]">
              Passenger journey &amp; maintenance impact
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-[12.5px] leading-relaxed text-dim sm:text-[13.5px]">
              Search a train by number or name to see where it is now, the expected delay and whether planned engineering work on the section affects
              your journey. Impact levels — None, Low, Moderate or High — are derived from the same maintenance plan the control office works to.
            </p>
          </div>

          {/* Search card */}
          <div className="anim-rise mx-auto mt-8 max-w-2xl">
            <div className="rounded-[4px] border border-edge bg-panel p-4 shadow-sm sm:p-5">
              {/* mode toggle */}
              <div className="flex gap-1.5 rounded-[4px] border border-edge bg-abyss p-1" role="tablist" aria-label="Search mode">
                {(["number", "name"] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-[3px] px-3 py-2 text-xs font-semibold transition ${
                      mode === m ? "bg-primary on-accent shadow-sm" : "text-dim hover:text-ink"
                    }`}
                  >
                    {m === "number" ? "Search by Train Number" : "Search by Train Name"}
                  </button>
                ))}
              </div>

              <form
                className="mt-3.5 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!q.trim()) setBlankHint(true);
                  else setBlankHint(false);
                  void runSearch(q);
                }}
              >
                <div className="relative flex-1">
                  <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setBlankHint(false);
                    }}
                    inputMode={mode === "number" ? "text" : "text"}
                    placeholder={mode === "number" ? "Enter train number (e.g. 12951)" : "Enter train name (e.g. Rajdhani, Vande Bharat)"}
                    aria-label="Train number or train name"
                    className="w-full rounded-[4px] border border-edge bg-abyss py-3 pr-3 pl-10 text-sm text-ink outline-none placeholder:text-faint focus:border-primary/50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-[4px] bg-primary px-6 py-3 text-sm font-semibold on-accent shadow-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  Search
                </button>
              </form>

              {blankHint && (
                <p className="mt-2.5 text-xs text-amber">Please type a train number or train name to search.</p>
              )}

              {/* quick picks (existing demo roster) */}
              {!searched && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold tracking-wider text-faint uppercase">Try a train from the demo dataset</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_PICKS.map((p) => (
                      <button
                        key={p.number}
                        onClick={() => {
                          setQ(p.number);
                          setBlankHint(false);
                          pick(p.number);
                        }}
                        className="rounded-full border border-edge bg-abyss px-3 py-1.5 text-[11px] font-medium text-dim transition hover:border-primary/40 hover:text-primary"
                      >
                        <span className="font-mono">{p.number}</span> · {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* search results */}
              {searched && results && results.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {results.map((r) => (
                    <li key={r.number}>
                      <button
                        onClick={() => pick(r.number)}
                        className={`flex w-full items-center gap-3 rounded-[4px] border p-3 text-left transition ${
                          selectedNumber === r.number
                            ? "border-primary/50 bg-primary/5"
                            : "border-edge bg-abyss hover:border-primary/30"
                        }`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-primary/10 text-primary">
                          <TrainFront size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">
                            <span className="font-mono">{r.number}</span> · {r.name}
                          </span>
                          <span className="block truncate text-[11px] text-dim">
                            {r.originName} → {r.destName} · departs {r.departs} · {r.stationsOnRoute} stops in view
                          </span>
                        </span>
                        <ArrowRight size={15} className="shrink-0 text-faint" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {searched && results && results.length === 0 && (
                <div className="mt-4 rounded-[4px] border border-edge bg-abyss p-4 text-center">
                  <Search size={18} className="mx-auto text-faint" />
                  <p className="mt-2 text-sm font-semibold text-ink">No train found in the current prototype dataset.</p>
                  <p className="mt-1 text-xs text-dim">
                    Try a number like 12951 or 22439, or a name like “Rajdhani”, “Vande Bharat” or “Namo Bharat”.
                  </p>
                </div>
              )}

              {offline && (
                <p className="mt-3 text-xs text-signal">
                  Could not reach the prototype service. Please retry in a moment.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ============ TRAIN DETAIL ============ */}
        {journey && st && lv && (
          <section className="pb-6">
            {detailBusy && (
              <div className="mb-2 flex items-center justify-center gap-2 text-xs text-dim">
                <Loader2 size={13} className="animate-spin" /> Updating journey status…
              </div>
            )}

            {/* ---- Status card ---- */}
            <div className="anim-rise overflow-hidden rounded-[4px] border border-edge bg-panel shadow-sm">
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold tracking-wider text-faint uppercase">
                    {KIND_LABELS[journey.train.kind] ?? journey.train.kind} · {journey.train.runsPerDay > 1 ? `${journey.train.runsPerDay} services/day` : "Daily service"}
                  </p>
                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                    {journey.train.name}
                  </h2>
                  <p className="mt-1 text-sm text-dim">
                    <span className="font-mono font-semibold text-ink">{journey.train.number}</span> · {journey.train.originName} →{" "}
                    {journey.train.destName} · Scheduled departure {journey.train.departs}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold ${st.chip}`}>
                    <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                    {journey.journey.statusLabel}
                  </span>
                  <span className="text-[11px] font-medium text-dim">
                    {journey.journey.status === "RUNNING"
                      ? "Currently on the move (prototype clock)"
                      : journey.journey.status === "SCHEDULED"
                        ? "Yet to depart from origin"
                        : "This service has completed its run"}
                  </span>
                </div>
              </div>

              {/* journey facts */}
              <div className="grid grid-cols-1 gap-px border-t border-edge bg-edge sm:grid-cols-3">
                <div className="bg-panel p-4">
                  <p className="text-[10.5px] font-semibold tracking-wider text-faint uppercase">Current / Last Known Station</p>
                  <p className="mt-1 text-sm font-bold text-ink">{journey.journey.lastStation?.name ?? "—"}</p>
                  <p className="text-[11px] text-dim">
                    {journey.journey.lastStation?.note === "passed"
                      ? `Passed ${journey.journey.lastStation.name}`
                      : journey.journey.lastStation?.note === "at platform"
                        ? "Train currently at this station"
                        : journey.journey.lastStation?.note === "arrived"
                          ? "Journey completed here"
                          : journey.journey.lastStation
                            ? "Awaiting departure"
                            : "—"}
                  </p>
                </div>
                <div className="bg-panel p-4">
                  <p className="text-[10.5px] font-semibold tracking-wider text-faint uppercase">Next Station</p>
                  <p className="mt-1 text-sm font-bold text-ink">{journey.journey.nextStation?.name ?? "Final stop"}</p>
                  <p className="text-[11px] text-dim">
                    {journey.journey.nextStation?.etaMin != null
                      ? `Expected in ~${journey.journey.nextStation.etaMin} min`
                      : journey.journey.nextStation
                        ? "Approaching"
                        : "Destination reached"}
                  </p>
                </div>
                <div className="bg-panel p-4">
                  <p className="text-[10.5px] font-semibold tracking-wider text-faint uppercase">Journey Progress</p>
                  <p className="mt-1 font-mono text-sm font-bold text-ink">{journey.journey.progressPct}%</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-abyss">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${journey.journey.progressPct}%` }} />
                  </div>
                </div>
              </div>

              {/* ---- Route progress track ---- */}
              <div className="border-t border-edge p-5 sm:p-6">
                <p className="text-[10.5px] font-semibold tracking-wider text-faint uppercase">Route Progress (Delhi NCR grid)</p>
                <div className="mt-4 overflow-x-auto pb-1">
                  <div className="relative min-w-[560px] pb-2">
                    {/* track */}
                    <div className="absolute top-[7px] right-2 left-2 h-0.5 rounded-[2px] bg-edge" />
                    <div
                      className="absolute top-[7px] left-2 h-0.5 rounded-[2px] bg-primary transition-all"
                      style={{ width: `calc((100% - 16px) * ${journey.journey.progressPct / 100})` }}
                    />
                    <div className="relative flex justify-between">
                      {journey.journey.stations.map((s) => {
                        const isCurrent = s.state === "current";
                        const isPassed = s.state === "passed";
                        return (
                          <div key={`${s.code}-${s.seq}`} className="flex w-16 flex-col items-center text-center">
                            <span
                              className={`z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                                isCurrent
                                  ? "border-primary bg-primary ring-4 ring-primary/20"
                                  : isPassed
                                    ? "border-primary bg-primary/30"
                                    : "border-edge bg-panel"
                              }`}
                            >
                              {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                            <span className={`mt-2 max-w-full truncate text-[10px] font-semibold ${isCurrent ? "text-primary" : isPassed ? "text-dim" : "text-faint"}`}>
                              {s.name}
                            </span>
                            <span className="font-mono text-[9px] text-faint">{s.timeLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* train marker */}
                    <span
                      className="absolute -top-1.5 z-20 text-primary transition-all"
                      style={{ left: `calc(8px + (100% - 16px) * ${journey.journey.progressPct / 100})`, transform: "translateX(-50%)" }}
                      aria-hidden
                    >
                      <TrainFront size={16} />
                    </span>
                  </div>
                </div>
                {journey.journey.beyondGrid && (
                  <p className="mt-2 text-[11px] text-faint">
                    This service continues to {journey.journey.beyondGrid.destName} — beyond the Delhi NCR prototype grid shown here.
                  </p>
                )}
              </div>

              {/* ---- Route timeline ---- */}
              <div className="border-t border-edge p-5 sm:p-6">
                <p className="text-[10.5px] font-semibold tracking-wider text-faint uppercase">Route Timeline</p>
                <ol className="mt-4 space-y-0">
                  {journey.journey.stations.map((s, i) => (
                    <li key={`${s.code}-row-${s.seq}`} className="relative flex gap-3.5 pb-5 last:pb-0">
                      {/* connector */}
                      {i < journey.journey.stations.length - 1 && (
                        <span
                          className={`absolute top-5 left-[9px] h-full w-0.5 ${
                            s.state === "passed" ? "bg-primary/40" : "bg-edge"
                          }`}
                        />
                      )}
                      {/* marker */}
                      <span
                        className={`z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          s.state === "current"
                            ? "border-primary bg-primary on-accent"
                            : s.state === "passed"
                              ? "border-primary/40 bg-primary/15 text-primary"
                              : "border-edge bg-panel text-faint"
                        }`}
                      >
                        {s.state === "passed" ? (
                          <Check size={11} strokeWidth={3} />
                        ) : s.state === "current" ? (
                          <CircleDot size={11} />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full border border-current" />
                        )}
                      </span>
                      {/* content */}
                      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold ${s.state === "current" ? "text-primary" : s.state === "passed" ? "text-ink" : "text-dim"}`}>
                            {s.name}
                            {s.state === "current" && s.note ? <span className="ml-2 text-[11px] font-medium text-primary/80">{s.note}</span> : null}
                          </p>
                          <p className="text-[11px] text-faint">
                            Station {s.seq} of {journey.journey.stations.length} · {s.code}
                          </p>
                        </div>
                        <span className={`font-mono text-xs ${s.state === "current" ? "font-bold text-primary" : "text-dim"}`}>{s.timeLabel}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* ---- Maintenance impact card ---- */}
            <div className="anim-rise mt-6 overflow-hidden rounded-[4px] border border-edge bg-panel shadow-sm">
              <div className={`border-b px-5 py-4 sm:px-6 ${lv.banner}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-ink">How Maintenance May Affect Your Journey</h3>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${lv.text} border-current`}>
                    <span className={`h-2 w-2 rounded-full ${lv.bar}`} /> {journey.impact.level}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{journey.impact.headline}</p>
                {journey.impact.advice && <p className="mt-0.5 text-xs text-dim">{journey.impact.advice}</p>}
              </div>

              <div className="p-5 sm:p-6">
                {journey.impact.reasons.length === 0 ? (
                  <p className="flex items-start gap-2 text-sm text-dim">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-mint" />
                    No maintenance activity is currently planned on this train&apos;s route in the prototype dataset.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {journey.impact.reasons.map((r, i) => (
                      <li key={i} className="rounded-[4px] border border-edge bg-abyss p-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-edge bg-panel px-2 py-0.5 text-[10px] font-bold tracking-wide text-dim uppercase">
                            {r.kind === "active-work" ? <Wrench size={10} /> : r.kind === "safety-watch" ? <TriangleAlert size={10} /> : <CalendarClock size={10} />}
                            {REASON_KIND_LABELS[r.kind] ?? r.kind}
                          </span>
                          <span className="text-[11px] font-semibold text-ink">
                            {r.section}
                            {r.isSuperBlock && <span className="ml-1.5 rounded-[2px] bg-violet/10 px-1.5 py-0.5 text-[9.5px] font-bold text-violet">COMBINED WINDOW</span>}
                          </span>
                          <span className="font-mono text-[11px] text-dim">
                            {r.when} · {r.windowLabel}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-dim">{r.text}</p>
                        {r.maxSeverity != null && (
                          <p className="mt-1.5 text-[10.5px] text-faint">
                            Priority rating: {r.maxSeverity}/10 · {r.departments.join(" + ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {journey.impact.notes.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-edge pt-4">
                    {journey.impact.notes.map((n, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-faint">
                        <Info size={12} className="mt-0.5 shrink-0" />
                        {n}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-5 rounded-[4px] border border-primary/25 bg-primary/5 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
                    <Sparkles size={13} /> What Rail Rakshak is Doing
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-dim">{journey.impact.whatWeDo}</p>
                </div>
              </div>
            </div>

            {/* refresh + disclaimer */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => selectedNumber && void loadJourney(selectedNumber)}
                disabled={detailBusy}
                className="inline-flex items-center gap-1.5 rounded-[3px] border border-edge bg-panel px-3.5 py-2 text-xs font-semibold text-dim transition hover:text-ink disabled:opacity-50"
              >
                <RefreshCw size={13} className={detailBusy ? "animate-spin" : ""} /> Refresh status
              </button>
              <p className="text-[11px] text-faint">
                Maintenance impact is derived from prototype planning data — not from live train running status.
              </p>
            </div>
          </section>
        )}

        {/* ============ WHY AI HELPS ============ */}
        <section className="border-t border-edge py-12">
          <div className="anim-rise text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">How AI Helps Reduce Disruption</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-dim">
              Behind every smooth journey is careful coordination. Here is what the planning system does for you.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: Clock3,
                title: "Smart Maintenance Timing",
                text: "The system identifies suitable maintenance windows to reduce interference with train movement.",
              },
              {
                icon: Layers,
                title: "Combined Maintenance Work",
                text: "Multiple railway departments can coordinate work in a single planned window instead of creating repeated disruptions.",
              },
              {
                icon: ShieldCheck,
                title: "Safety First",
                text: "Safety-critical defects receive higher priority.",
              },
              {
                icon: Activity,
                title: "Better Infrastructure Availability",
                text: "Efficient planning helps keep more railway infrastructure available for train operations.",
              },
            ].map((c, i) => (
              <div key={c.title} className="anim-rise rounded-[4px] border border-edge bg-panel p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-primary/20 bg-primary/10 text-primary">
                  <c.icon size={18} />
                </span>
                <h3 className="mt-3.5 text-base font-bold text-ink">{c.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-dim">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ============ RAIL RAKSHAK IMPACT (existing computed KPIs only) ============ */}
        <section className="border-t border-edge py-12">
          <div className="anim-rise text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Rail Rakshak Impact</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-dim">
              Measured by the system&apos;s own planning engine on the Delhi NCR demo grid.
            </p>
          </div>

          {journey?.kpis ? (
            <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Blocks Optimized", value: journey.kpis.blocksOptimized, sub: "in the latest plan" },
                { label: "Maintenance Activities Coordinated", value: journey.kpis.activitiesCoordinated, sub: "defects cleared by the plan" },
                { label: "Combined Work Windows", value: journey.kpis.combinedWindows, sub: "multi-department super-blocks" },
                {
                  label: "Infrastructure Downtime Reduced",
                  value: journey.kpis.downtimeReductionPct != null ? `${journey.kpis.downtimeReductionPct}%` : null,
                  sub:
                    journey.kpis.downtimeBaselineH != null && journey.kpis.downtimeOptimizedH != null
                      ? `${journey.kpis.downtimeBaselineH}h → ${journey.kpis.downtimeOptimizedH}h`
                      : "vs manual baseline",
                },
              ].map((m, i) => (
                <div key={m.label} className="anim-rise rounded-[4px] border border-edge bg-panel p-4 text-center sm:p-5">
                  <p className="font-mono text-2xl font-bold text-primary sm:text-3xl">{m.value ?? "—"}</p>
                  <p className="mt-1.5 text-xs font-semibold text-ink">{m.label}</p>
                  <p className="mt-0.5 text-[10.5px] text-faint">{m.sub}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="anim-rise mx-auto mt-8 max-w-md rounded-[4px] border border-edge bg-panel p-4 text-center text-xs text-dim">
              Maintenance impact metrics will appear here once the operations team generates a maintenance plan in this
              prototype. No numbers are shown without a computed plan behind them.
            </p>
          )}
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-edge bg-hull">
        <div className="tricolor opacity-60" />
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-3 text-[11px] text-faint sm:flex-row sm:items-center">
            <p className="max-w-xl leading-relaxed">
              <span className="font-semibold text-amber">Prototype Data.</span> This citizen view uses the Rail Rakshak demo
              railway operations dataset for the Delhi NCR grid. It is not connected to live Indian Railways enquiry systems
              and must not be used for actual travel planning.
            </p>
            <span className="flex shrink-0 items-center gap-3">
              <Link href="/" className="inline-flex items-center gap-1 font-medium text-dim hover:text-ink">
                <ChevronLeft size={12} /> Overview
              </Link>
              <Link href="/login" className="inline-flex items-center gap-1 font-medium text-dim hover:text-ink">
                Railway Staff <ArrowRight size={12} />
              </Link>
            </span>
          </div>
          <p className="mt-3 text-[10.5px] text-faint">
            Rail Rakshak · Smart India Hackathon 2026 · Problem Statement #26027 · Ministry of Railways
          </p>
        </div>
      </footer>
    </div>
  );
}
