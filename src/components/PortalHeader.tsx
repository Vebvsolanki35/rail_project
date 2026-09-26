"use client";

/**
 * RAIL RAKSHAK — PORTAL HEADER
 *
 * Government-portal chrome for the authenticated desks:
 *   · utility strip   — operations context, accessibility, help, contact,
 *                       language, IST clock, live system-status probe
 *   · main header     — wordmark, notifications, health, role, user profile
 *   · decision bar    — DRM human-veto / plan-approval authority (preserved
 *                       verbatim from the previous TopBar: POST /api/veto)
 *
 * Everything shown is real: the clock ticks from `useNow`, the health pill is
 * a live `GET /api/health` probe, notifications are the critical/warning rows
 * of the operational event feed returned by `GET /api/state`, and the user
 * block is the signed-in session from `src/lib/auth.ts`.
 *
 * Original Rail Rakshak branding only — no Government of India emblem, no
 * Indian Railways logo, and an explicit prototype disclaimer in the utility
 * strip and the Contact/About panel.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Accessibility,
  Bell,
  BellRing,
  ChevronDown,
  CheckCircle2,
  CircleHelp,
  Clock,
  FileWarning,
  Languages,
  LifeBuoy,
  LogOut,
  Moon,
  OctagonAlert,
  ServerCog,
  ShieldCheck,
  Siren,
  Sun,
  TrainFront,
  Type,
  User,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { clearRole, DEPT_LABEL, ROLE_META, useRole } from "@/lib/role";
import { ROLE_LABEL } from "@/lib/auth";
import { useSession } from "@/lib/useSession";
import { useTheme } from "@/lib/theme";
import { useLang } from "@/lib/lang";
import { useNow } from "@/lib/useNow";
import { navForRole } from "@/lib/navigation";
import { RailStatusBar } from "./rail/RailKit";
import StatusPill from "./StatusPill";

const VETO_REASONS_KEYS = ["veto.r1", "veto.r2", "veto.r3", "veto.r4"] as const;
const VETO_ICONS = [Zap, Siren, User, FileWarning];

type Panel = "none" | "a11y" | "help" | "contact" | "notifs" | "profile";

type FeedRow = { id: number; kind: string; message: string; createdAt: string };

export default function PortalHeader() {
  const path = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { lang, setLang, t } = useLang();
  const role = useRole();
  const session = useSession();

  const nowMs = useNow(1000);
  const now = nowMs
    ? new Date(nowMs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--:--:--";
  const today = nowMs
    ? new Date(nowMs).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    : "";

  const [planStatus, setPlanStatus] = useState<string>("PROPOSED");
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [criticalDefects, setCriticalDefects] = useState(0);
  /* Numbers for the operational status strip. `null` until the first successful
     read of /api/state, so the strip never shows a fabricated zero. */
  const [ops, setOps] = useState<null | {
    openDefects: number;
    criticalDefects: number;
    degradedAssets: number;
    activeBlocks: number;
    overdue: number;
    emergency: number;
    crewsEngaged: number;
    awaitingValidation: number;
    planBlocks: number;
    updatedAt: number;
  }>(null);
  const [health, setHealth] = useState<"checking" | "operational" | "degraded">("checking");
  const [panel, setPanel] = useState<Panel>("none");
  const [unread, setUnread] = useState(0);

  const [vetoBusy, setVetoBusy] = useState(false);
  const [vetoOpen, setVetoOpen] = useState(false);
  const [vetoReason, setVetoReason] = useState<(typeof VETO_REASONS_KEYS)[number]>(VETO_REASONS_KEYS[0]);
  const [vetoNote, setVetoNote] = useState("");

  /* ── Accessibility preferences (real, persisted, applied to <html>) ── */
  const [reduceMotion, setReduceMotion] = useState(false);
  const [largeText, setLargeText] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("rr-reduce-motion", reduceMotion);
    root.classList.toggle("rr-large-text", largeText);
  }, [reduceMotion, largeText]);

  /* ── Operational feed + plan status (same endpoint the desks poll) ── */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      setPlanStatus(d.settings?.planStatus ?? "PROPOSED");
      const rows: FeedRow[] = Array.isArray(d.events) ? d.events : [];
      const signal = rows.filter((e) => e.kind === "critical" || e.kind === "warn").slice(-12);
      setFeed(signal.reverse());
      setCriticalDefects(Number(d.counts?.criticalDefects ?? 0));
      setUnread(signal.filter((e) => e.kind === "critical").length);
      setOps({
        openDefects: Number(d.counts?.openDefects ?? 0),
        criticalDefects: Number(d.counts?.criticalDefects ?? 0),
        degradedAssets: Number(d.counts?.assetsBelowHealth ?? 0),
        activeBlocks: Array.isArray(d.activeBlockSegments) ? d.activeBlockSegments.length : 0,
        overdue: Number(d.urgency?.overdue ?? d.lifecycle?.overdue ?? 0),
        emergency: Number(d.urgency?.emergency ?? d.lifecycle?.emergency ?? 0),
        /* Crews engaged = defects the field has taken up (work allotted / in hand). */
        crewsEngaged:
          Number(d.lifecycle?.counts?.WORK_ASSIGNED ?? 0) +
          Number(d.lifecycle?.counts?.WORK_STARTED ?? 0) +
          Number(d.lifecycle?.counts?.WORK_IN_PROGRESS ?? 0),
        awaitingValidation: Number(d.lifecycle?.awaitingValidation ?? 0),
        planBlocks: Array.isArray(d.latestPlan?.blocks) ? d.latestPlan.blocks.length : 0,
        updatedAt: Date.now(),
      });
    } catch {
      /* offline-tolerant: keep the last known status */
    }
  }, []);

  const probeHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setHealth(res.ok ? "operational" : "degraded");
    } catch {
      setHealth("degraded");
    }
  }, []);

  const firstRun = useRef(true);
  useEffect(() => {
    // Deferred a tick so the fetch's setState lands in a callback, not in the
    // effect body (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      void fetchStatus();
      void probeHealth();
    }, 0);
    const poll = setInterval(() => {
      void fetchStatus();
      void probeHealth();
    }, 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [fetchStatus, probeHealth, path]);

  // Refresh the header when a desk toggles a mode or the DRM vetoes a plan.
  useEffect(() => {
    const onSignal = () => void fetchStatus();
    window.addEventListener("rr-veto", onSignal);
    window.addEventListener("rr-mode", onSignal);
    return () => {
      window.removeEventListener("rr-veto", onSignal);
      window.removeEventListener("rr-mode", onSignal);
    };
  }, [fetchStatus]);

  // Keyboard: Esc closes any panel, "?" opens help.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "Escape") {
        setPanel("none");
        setVetoOpen(false);
      } else if (e.key === "?" && !typing) {
        e.preventDefault();
        setPanel((p) => (p === "help" ? "none" : "help"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (firstRun.current) firstRun.current = false;
  }, []);

  async function submitVeto(resume = false) {
    if (role?.role !== "DRM") return;
    setVetoBusy(true);
    try {
      await fetch("/api/veto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resume ? { mode: "PROPOSED" } : { mode: "VETOED", reason: t(vetoReason), note: vetoNote }),
      });
      await fetchStatus();
      window.dispatchEvent(new Event("rr-veto"));
      setVetoOpen(false);
      setVetoNote("");
    } finally {
      setVetoBusy(false);
    }
  }

  function closeAnd(target: Panel) {
    setPanel((p) => (p === target ? "none" : target));
    if (target === "notifs") setUnread(0);
  }

  function signOut() {
    clearRole();
    router.push("/login");
  }

  const roleMeta = role ? ROLE_META[role.role] : null;
  const roleName = session ? ROLE_LABEL[session.role] : role ? roleMeta?.label ?? "" : "";
  const deptName = session?.department ? DEPT_LABEL[session.department].split(" — ")[0] : role?.dept ? DEPT_LABEL[role.dept].split(" — ")[0] : null;
  const allowedGroups = navForRole(session?.role ?? null);

  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-hull">
      <div className="tricolor" aria-hidden />

      {/* ══════════ MASTHEAD — railway board band (bilingual, institutional) ══════════ */}
      <div className="bg-primary on-accent">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1 lg:px-5">
          <p className="flex min-w-0 items-center gap-2 text-[11px] leading-tight">
            <span className="font-semibold tracking-wide">उत्तर रेलवे</span>
            <span className="text-on-accent/45" aria-hidden>|</span>
            <span className="font-semibold uppercase tracking-[0.09em]">Northern Railway — Delhi Division</span>
            <span className="hidden text-on-accent/45 md:inline" aria-hidden>|</span>
            <span className="hidden text-on-accent/85 md:inline">दिल्ली मंडल · Divisional Control Organisation</span>
          </p>

          <div className="flex items-center gap-0.5">
            <span className="mr-1 hidden items-center gap-1.5 border-r border-on-accent/25 pr-2.5 text-[10.5px] text-on-accent/90 xl:flex">
              <span className="font-semibold uppercase tracking-[0.09em]">Control Centre</span>
              <span className="text-on-accent/45" aria-hidden>|</span>
              <span className="font-mono">NR-DELHI-03</span>
            </span>

            <button
              onClick={() => closeAnd("a11y")}
              className="hidden items-center gap-1 px-2 py-1 text-[10.5px] text-on-accent/90 hover:bg-on-accent/10 md:flex"
              aria-haspopup="dialog"
            >
              <Accessibility size={12} aria-hidden /> Accessibility
            </button>
            <button
              onClick={() => closeAnd("help")}
              className="hidden items-center gap-1 px-2 py-1 text-[10.5px] text-on-accent/90 hover:bg-on-accent/10 sm:flex"
              aria-haspopup="dialog"
              title="Help (press ?)"
            >
              <CircleHelp size={12} aria-hidden /> Help
            </button>
            <button
              onClick={() => closeAnd("contact")}
              className="hidden items-center gap-1 px-2 py-1 text-[10.5px] text-on-accent/90 hover:bg-on-accent/10 lg:flex"
              aria-haspopup="dialog"
            >
              <LifeBuoy size={12} aria-hidden /> Contact
            </button>

            <label className="ml-1 flex items-center gap-1 px-1.5 py-1 text-[10.5px] text-on-accent/90 hover:bg-on-accent/10">
              <Languages size={12} aria-hidden />
              <span className="sr-only">Interface language</span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value === "hi" ? "hi" : "en")}
                className="cursor-pointer bg-transparent text-[10.5px] text-on-accent outline-none [&>option]:text-ink"
                aria-label="Interface language"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </label>

            <span className="ml-1 hidden items-center gap-1.5 border-l border-on-accent/25 pl-2 font-mono text-[10.5px] text-on-accent/95 sm:flex">
              <Clock size={11} aria-hidden />
              {today} · {now} IST
            </span>
          </div>
        </div>
      </div>

      {/* ══════════ IDENTITY ROW — platform identity + session controls ══════════ */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-edge px-3 py-2 lg:px-5">
        <Link href={role ? ROLE_META[role.role].dest : "/"} className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center border border-primary bg-primary on-accent">
            <TrainFront size={17} strokeWidth={2.1} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-[15px] font-extrabold uppercase leading-none tracking-[0.02em] text-ink">Rail Rakshak</span>
              <span className="hidden shrink-0 border border-maroon/45 bg-maroon/[0.06] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.1em] text-maroon sm:inline">
                Prototype
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[10.5px] font-medium text-dim">
              Railway Operations &amp; Safety Intelligence Platform
            </span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* System health — the same live probe, rendered as an institutional readout */}
          <span className="hidden items-center gap-1.5 border border-edge bg-panel px-2 py-1 lg:flex">
            <ServerCog size={12} className="text-faint" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Systems</span>
            <span className={`text-[11px] font-semibold ${health === "operational" ? "text-mint" : health === "degraded" ? "text-signal" : "text-dim"}`}>
              {health === "operational" ? "Operational" : health === "degraded" ? "Degraded" : "Checking"}
            </span>
          </span>

          {/* Notifications (real operational event feed) */}
          <div className="relative">
            <button
              onClick={() => closeAnd("notifs")}
              className="relative flex h-8 items-center gap-1.5 border border-edge bg-panel px-2 text-[11px] font-medium text-dim hover:border-primary hover:text-primary"
              aria-label={`Notifications (${unread} unread critical)`}
              aria-haspopup="dialog"
            >
              {unread > 0 ? <BellRing size={14} className="text-signal" aria-hidden /> : <Bell size={14} aria-hidden />}
              <span className="hidden sm:inline">Alerts</span>
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-signal px-1 font-mono text-[9px] font-bold on-accent">
                  {unread}
                </span>
              )}
            </button>
          </div>

          {/* Decision authority: DRM veto (unchanged behaviour, POST /api/veto) */}
          {role?.role === "DRM" && (
            <button
              onClick={() => (planStatus === "VETOED" ? submitVeto(true) : setVetoOpen(true))}
              disabled={vetoBusy}
              className={`flex h-8 items-center gap-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
                planStatus === "VETOED" ? "bg-signal on-accent" : "border border-signal/45 bg-signal/[0.06] text-signal hover:bg-signal/[0.12]"
              }`}
              title="Divisional decision authority over the AI-generated plan"
            >
              <OctagonAlert size={13} aria-hidden />
              <span className="hidden sm:inline">{planStatus === "VETOED" ? t("veto.active") : t("veto.human")}</span>
            </button>
          )}

          {planStatus === "APPROVED" && (
            <span className="hidden md:inline-flex">
              <StatusPill label={t("plan.approved")} tone="success" />
            </span>
          )}

          <button
            onClick={toggle}
            className="hidden h-8 w-8 items-center justify-center border border-edge bg-panel text-dim hover:border-primary hover:text-primary lg:flex"
            title={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
            aria-label={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
          >
            {theme === "dark" ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
          </button>

          <span className="hidden h-8 w-px bg-edge sm:block" aria-hidden />

          {/* User identity — role, profile, sign out */}
          <button
            onClick={() => closeAnd("profile")}
            className="flex h-8 items-center gap-2 border border-edge bg-panel px-2 text-left hover:border-primary"
            aria-haspopup="dialog"
            aria-label="User profile and session"
          >
            <span className="flex h-5 w-5 items-center justify-center bg-primary/[0.09] text-primary">
              <User size={12} aria-hidden />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block max-w-[150px] truncate text-[11px] font-semibold text-ink">{session?.name ?? "Signed in"}</span>
              <span className="block max-w-[150px] truncate text-[10px] uppercase tracking-[0.05em] text-faint">
                {roleName || "No desk"}
                {deptName ? ` · ${deptName}` : ""}
              </span>
            </span>
            <ChevronDown size={12} className="text-faint" aria-hidden />
          </button>

          <button
            onClick={signOut}
            className="flex h-8 w-8 items-center justify-center border border-edge bg-panel text-dim hover:border-signal hover:text-signal"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={14} aria-hidden />
          </button>
        </div>
      </div>

      {/* ══════════ OPERATIONAL STATUS STRIP ══════════ */}
      <RailStatusBar
        cells={[
          {
            label: "System status",
            value: health === "operational" ? "Operational" : health === "degraded" ? "Degraded" : "Checking",
            tone: health === "operational" ? "success" : health === "degraded" ? "critical" : "neutral",
            hint: "Live probe of GET /api/health",
          },
          {
            label: "Data",
            value: ops ? "Seeded prototype set" : "—",
            tone: "warning",
            hint:
              "SIMULATION — this build runs on a seeded prototype dataset. No live TMS / TDMS / SMMS / COA / FOIS / IMD endpoint is connected.",
          },
          {
            label: "Plan",
            value: planStatus === "APPROVED" ? "Approved" : planStatus === "VETOED" ? "Vetoed" : "Awaiting approval",
            tone: planStatus === "APPROVED" ? "success" : planStatus === "VETOED" ? "critical" : "warning",
            hint: "Divisional decision state of the standing plan",
          },
          { label: "Active blocks", value: ops ? ops.activeBlocks : "—", tone: "info", hint: "Section kilometres currently under live block occupation" },
          { label: "Plan blocks", value: ops ? ops.planBlocks : "—", hint: "Blocks carried by the standing plan" },
          { label: "Critical defects", value: ops ? ops.criticalDefects : "—", tone: ops && ops.criticalDefects > 0 ? "critical" : "success", hint: "Open defects at severity 8 and above" },
          { label: "Overdue", value: ops ? ops.overdue : "—", tone: ops && ops.overdue > 0 ? "warning" : "success", hint: "Defects past their permitted deadline" },
          { label: "Crews engaged", value: ops ? ops.crewsEngaged : "—", tone: "info", hint: "Defects the field has taken up (work allotted or in hand)" },
          { label: "Updated", value: ops ? new Date(ops.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—", hint: "Last refresh of the divisional state" },
        ]}
      />

      {/* ══════════ SLIDE-DOWN PANELS ══════════ */}
      {panel !== "none" && (
        <>
          <button className="fixed inset-0 z-40 cursor-default bg-ink/25" aria-label="Close panel" onClick={() => setPanel("none")} />
          <div
            role="dialog"
            aria-modal="false"
            aria-label={`${panel} panel`}
            className="anim-rise absolute right-2 top-full z-50 mt-1 w-[min(26rem,calc(100vw-1rem))] border border-edge bg-panel shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]"
          >
            <div className="panel-hd">
              <span>
                {panel === "a11y" && "Accessibility"}
                {panel === "help" && "Help & keyboard shortcuts"}
                {panel === "contact" && "Contact & about"}
                {panel === "notifs" && "Operational alerts"}
                {panel === "profile" && "Session & desk"}
              </span>
              <button onClick={() => setPanel("none")} className="rounded-[3px] p-0.5 text-dim hover:text-ink" aria-label="Close">
                <X size={14} />
              </button>
            </div>

            {panel === "a11y" && (
              <div className="space-y-3 p-3">
                <label className="flex items-center justify-between gap-3 border border-edge px-3 py-2">
                  <span className="flex items-center gap-2 text-[12px] text-ink">
                    <Waves size={14} className="text-primary" aria-hidden /> Reduce motion
                  </span>
                  <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} className="h-4 w-4" />
                </label>
                <label className="flex items-center justify-between gap-3 border border-edge px-3 py-2">
                  <span className="flex items-center gap-2 text-[12px] text-ink">
                    <Type size={14} className="text-primary" aria-hidden /> Larger text
                  </span>
                  <input type="checkbox" checked={largeText} onChange={(e) => setLargeText(e.target.checked)} className="h-4 w-4" />
                </label>
                <p className="text-[11px] leading-relaxed text-dim">
                  The portal also honours your operating-system reduced-motion setting, supports full keyboard operation with visible focus rings,
                  and never communicates status by colour alone — every status carries an icon and a text label.
                </p>
              </div>
            )}

            {panel === "help" && (
              <div className="max-h-[70vh] space-y-3 overflow-y-auto p-3">
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-edge">
                    {[
                      ["?", "Open / close this help panel"],
                      ["Esc", "Close any open panel or dialog"],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td className="w-20 py-1.5">
                          <kbd className="rounded-[3px] border border-edge bg-abyss px-1.5 py-0.5 font-mono text-[10px] text-ink">{k}</kbd>
                        </td>
                        <td className="py-1.5 text-dim">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-faint">Your modules</p>
                  <ul className="space-y-1">
                    {allowedGroups.flatMap((g) =>
                      g.items.map((i) => (
                        <li key={i.href}>
                          <Link href={i.href} onClick={() => setPanel("none")} className="flex items-center gap-2 text-[12px] text-dim hover:text-primary">
                            <i.icon size={13} className="text-faint" aria-hidden />
                            <span className="font-medium text-ink">{i.label}</span>
                            <span className="text-faint">— {g.label}</span>
                          </Link>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <p className="border-t border-edge pt-2 text-[11px] leading-relaxed text-dim">
                  Evaluation build. Sign-in uses pre-authorised demonstration accounts; operational data is a seeded prototype dataset over real Delhi-NCR
                  geography.
                </p>
              </div>
            )}

            {panel === "contact" && (
              <div className="space-y-3 p-3 text-[11.5px] leading-relaxed text-dim">
                <p>
                  <span className="font-semibold text-ink">Rail Rakshak</span> — AI-Powered Railway Operations &amp; Maintenance Platform.
                  Demonstration node <span className="font-mono">NR-DELHI-03</span>, Northern Railway — Delhi Division.
                </p>
                <p>
                  For platform access or data issues during evaluation, contact your divisional IT / control office administrator. Desk access is granted by
                  role; role changes are handled by the divisional administrator.
                </p>
                <p className="border border-saffron/40 bg-saffron/[0.06] p-2 text-[11px] text-saffron">
                  <strong>Prototype notice:</strong> this is an evaluation build. It is not an official Government of India website, is not affiliated with
                  the Ministry of Railways, and displays a seeded prototype dataset — not live railway operational data.
                </p>
              </div>
            )}

            {panel === "notifs" && (
              <div className="max-h-[70vh] overflow-y-auto">
                <div className="border-b border-edge px-3 py-2 text-[11px] text-dim">
                  {criticalDefects} critical defect{criticalDefects === 1 ? "" : "s"} open · alerts below are the critical and warning rows of the live
                  operational event feed.
                </div>
                {feed.length === 0 && <p className="p-4 text-center text-[11px] text-faint">No critical or warning events recorded yet.</p>}
                <ul className="divide-y divide-edge">
                  {feed.map((e) => (
                    <li key={e.id} className="flex items-start gap-2 px-3 py-2">
                      <span className={`mt-0.5 shrink-0 ${e.kind === "critical" ? "text-signal" : "text-saffron"}`} aria-hidden>
                        {e.kind === "critical" ? <Siren size={13} /> : <OctagonAlert size={13} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11.5px] leading-snug text-ink">{e.message}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-faint">
                          {new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-edge px-3 py-2">
                  <Link href="/audit" onClick={() => setPanel("none")} className="btn btn-sm w-full">
                    Open approvals &amp; audit trail
                  </Link>
                </div>
              </div>
            )}

            {panel === "profile" && (
              <div className="space-y-3 p-3">
                <dl className="kv">
                  <dt>Name</dt>
                  <dd>{session?.name ?? "—"}</dd>
                  <dt>Desk role</dt>
                  <dd>{roleName || "—"}</dd>
                  {session?.designation && (
                    <>
                      <dt>Designation</dt>
                      <dd>{session.designation}</dd>
                    </>
                  )}
                  <dt>Unit</dt>
                  <dd>{session?.unit ?? "—"}</dd>
                  <dt>Access</dt>
                  <dd className="font-mono text-[11px]">{session ? `${allowedGroups.reduce((n, g) => n + g.items.length, 0)} modules` : "—"}</dd>
                  <dt>Signed in</dt>
                  <dd className="font-mono text-[11px]">
                    {session?.issuedAt ? new Date(session.issuedAt).toLocaleString("en-IN", { hour12: false }) : "—"}
                  </dd>
                </dl>
                <div className="flex flex-wrap gap-2 border-t border-edge pt-3">
                  <Link href={role ? ROLE_META[role.role].dest : "/command"} className="btn btn-sm" onClick={() => setPanel("none")}>
                    <ShieldCheck size={12} aria-hidden /> My desk
                  </Link>
                  <button onClick={signOut} className="btn btn-sm btn-danger">
                    <LogOut size={12} aria-hidden /> Sign out
                  </button>
                </div>
                <p className="text-[10.5px] leading-relaxed text-faint">
                  Prototype session held in this browser. Production design moves the same allow-list to a signed server session.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════ DRM HUMAN-VETO DIALOG (behaviour preserved) ══════════ */}
      {vetoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={() => setVetoOpen(false)}>
          <div className="anim-rise w-full max-w-md border border-signal/45 bg-panel shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("veto.title")}>
            <div className="flex items-center justify-between border-b border-signal/30 bg-signal/[0.06] px-4 py-3">
              <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-signal">
                <OctagonAlert size={15} aria-hidden /> {t("veto.title")}
              </p>
              <button onClick={() => setVetoOpen(false)} className="rounded-[3px] p-0.5 text-dim hover:text-ink" aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-[12px] leading-relaxed text-dim">{t("veto.desc")}</p>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-faint">{t("veto.reason")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {VETO_REASONS_KEYS.map((rKey, i) => {
                    const Icon = VETO_ICONS[i];
                    return (
                      <button
                        key={rKey}
                        type="button"
                        onClick={() => setVetoReason(rKey)}
                        className={`flex items-center gap-2 border px-3 py-2 text-left text-[11.5px] font-medium ${
                          vetoReason === rKey ? "border-signal bg-signal/[0.08] text-signal" : "border-edge bg-panel text-dim hover:text-ink"
                        }`}
                      >
                        <Icon size={13} className="shrink-0" aria-hidden />
                        <span className="truncate">{t(rKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-faint">{t("veto.note")}</label>
                <textarea
                  value={vetoNote}
                  onChange={(e) => setVetoNote(e.target.value)}
                  rows={3}
                  placeholder="Record the operational reason (appears in the audit trail)…"
                  className="w-full border border-edge bg-abyss px-3 py-2 text-[12px] text-ink placeholder:text-faint focus:border-primary focus:outline-none"
                />
              </div>
              <button onClick={() => submitVeto(false)} disabled={vetoBusy || vetoNote.trim().length < 6} className="btn btn-danger w-full">
                {vetoBusy ? t("veto.submitting") : t("veto.confirm")}
              </button>
              <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-faint">
                <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-mint" aria-hidden />
                The AI recommendation is advisory. A divisional officer holds the decision authority; every override is recorded with actor, reason and timestamp.
              </p>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
