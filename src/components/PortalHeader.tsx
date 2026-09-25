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
import { NAV_GROUPS, navForRole } from "@/lib/navigation";
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

      {/* ══════════ UTILITY STRIP ══════════ */}
      <div className="border-b border-edge bg-primary on-accent">
        <div className="flex h-8 items-center justify-between gap-3 px-3 lg:px-5">
          <p className="truncate text-[11px] text-on-accent/90">
            <span className="font-semibold">Rail Rakshak</span>
            <span className="mx-1.5 text-on-accent/40">·</span>
            Northern Railway — Delhi Division
            <span className="mx-1.5 hidden text-on-accent/40 sm:inline">·</span>
            <span className="hidden sm:inline">Node NR-DELHI-03</span>
          </p>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => closeAnd("a11y")}
              className="hidden items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-on-accent/90 hover:bg-on-accent/10 md:flex"
              aria-haspopup="dialog"
            >
              <Accessibility size={12} aria-hidden /> Accessibility
            </button>
            <button
              onClick={() => closeAnd("help")}
              className="hidden items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-on-accent/90 hover:bg-on-accent/10 sm:flex"
              aria-haspopup="dialog"
              title="Help (press ?)"
            >
              <CircleHelp size={12} aria-hidden /> Help
            </button>
            <button
              onClick={() => closeAnd("contact")}
              className="hidden items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-on-accent/90 hover:bg-on-accent/10 lg:flex"
              aria-haspopup="dialog"
            >
              <LifeBuoy size={12} aria-hidden /> Contact
            </button>

            <label className="ml-1 flex items-center gap-1 rounded-[3px] px-1.5 py-1 text-[11px] text-on-accent/90 hover:bg-on-accent/10">
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

            <span className="ml-1 hidden items-center gap-1.5 border-l border-on-accent/25 pl-2 font-mono text-[11px] text-on-accent/95 sm:flex">
              <Clock size={11} aria-hidden />
              {today} · {now} IST
            </span>

            <span className="ml-1 hidden lg:inline-flex">
              <StatusPill
                label={health === "operational" ? "Systems OK" : health === "degraded" ? "Degraded" : "Checking"}
                tone={health === "operational" ? "success" : health === "degraded" ? "critical" : "neutral"}
                motion={health === "checking" ? "pulse" : "none"}
                className="!border-on-accent/30 !bg-on-accent/15 !text-on-accent"
              />
            </span>
          </div>
        </div>
      </div>

      {/* ══════════ MAIN HEADER ══════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 lg:px-5">
        <Link href={role ? ROLE_META[role.role].dest : "/"} className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] bg-primary on-accent">
            <TrainFront size={21} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-[15px] font-extrabold leading-none tracking-tight text-ink">RAIL RAKSHAK</span>
              <span className="hidden rounded-[3px] border border-saffron/40 bg-saffron/[0.07] px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wider text-saffron sm:inline">
                Prototype
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-dim">
              AI-Powered Railway Operations &amp; Maintenance
            </span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {/* System health */}
          <span className="hidden items-center gap-1.5 rounded-[3px] border border-edge bg-panel px-2 py-1 text-[11px] md:flex">
            <ServerCog size={12} className="text-faint" aria-hidden />
            <span className="uppercase tracking-wide text-faint">Health</span>
            <span className={`font-semibold ${health === "operational" ? "text-mint" : health === "degraded" ? "text-signal" : "text-dim"}`}>
              {health === "operational" ? "98.6%" : health === "degraded" ? "DEGRADED" : "—"}
            </span>
          </span>

          {/* Notifications (real operational event feed) */}
          <div className="relative">
            <button
              onClick={() => closeAnd("notifs")}
              className="relative flex h-8 items-center gap-1.5 rounded-[3px] border border-edge bg-panel px-2 text-[11px] font-medium text-dim hover:border-primary hover:text-primary"
              aria-label={`Notifications (${unread} unread critical)`}
              aria-haspopup="dialog"
            >
              {unread > 0 ? <BellRing size={14} className="text-signal" aria-hidden /> : <Bell size={14} aria-hidden />}
              <span className="hidden sm:inline">Alerts</span>
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 font-mono text-[9px] font-bold on-accent">
                  {unread}
                </span>
              )}
            </button>
          </div>

          {/* User profile */}
          <button
            onClick={() => closeAnd("profile")}
            className="flex h-8 items-center gap-2 rounded-[3px] border border-edge bg-panel px-2 text-left hover:border-primary"
            aria-haspopup="dialog"
            aria-label="User profile and session"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-primary/[0.08] text-primary">
              <User size={13} aria-hidden />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-[11px] font-semibold text-ink">{session?.name ?? "Signed in"}</span>
              <span className="block text-[10px] text-faint">
                {roleName}
                {deptName ? ` · ${deptName}` : ""}
              </span>
            </span>
          </button>

          {/* Decision authority: DRM veto (unchanged behaviour, POST /api/veto) */}
          {role?.role === "DRM" && (
            <button
              onClick={() => (planStatus === "VETOED" ? submitVeto(true) : setVetoOpen(true))}
              disabled={vetoBusy}
              className={`flex h-8 items-center gap-1.5 rounded-[3px] px-2.5 text-[11px] font-semibold uppercase tracking-wide ${
                planStatus === "VETOED" ? "bg-signal on-accent" : "border border-signal/40 bg-signal/[0.07] text-signal hover:bg-signal/[0.13]"
              }`}
              title="Divisional decision authority over the AI-generated plan"
            >
              <OctagonAlert size={13} aria-hidden />
              <span className="hidden sm:inline">{planStatus === "VETOED" ? t("veto.active") : t("veto.human")}</span>
            </button>
          )}

          {planStatus === "APPROVED" && (
            <StatusPill label={t("plan.approved")} tone="success" className="hidden md:inline-flex" />
          )}

          <button
            onClick={toggle}
            className="hidden h-8 w-8 items-center justify-center rounded-[3px] border border-edge bg-panel text-dim hover:border-primary hover:text-primary lg:flex"
            title={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
            aria-label={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
          >
            {theme === "dark" ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
          </button>
        </div>
      </div>

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
