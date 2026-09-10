"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { KeyRound, OctagonAlert, ShieldCheck, TrainFront, X, Zap, Siren, User, FileWarning, Sun, Moon, Languages } from "lucide-react";
import { getRole, ROLE_META, DEPT_LABEL, type RoleInfo } from "@/lib/role";
import { useTheme } from "@/lib/theme";
import { useLang } from "@/lib/lang";

const VETO_REASONS_KEYS = ["veto.r1", "veto.r2", "veto.r3", "veto.r4"] as const;
const VETO_ICONS = [Zap, Siren, User, FileWarning];

export default function TopBar() {
  const path = usePathname();
  const { theme, toggle } = useTheme();
  const { lang, setLang, t } = useLang();

  const titleKey = path === "/command" ? "page.command" : path === "/planner" ? "page.planner" : path === "/simulation" ? "page.simulation" : path === "/field" ? "page.field" : path === "/jobs" ? "page.jobs" : "page.default";
  const subKey = titleKey + ".sub";

  const [now, setNow] = useState<string>("");
  const [role, setRoleState] = useState<RoleInfo | null>(null);
  const [planStatus, setPlanStatus] = useState<string>("PROPOSED");
  const [vetoBusy, setVetoBusy] = useState(false);
  const [vetoOpen, setVetoOpen] = useState(false);
  const [vetoReason, setVetoReason] = useState<(typeof VETO_REASONS_KEYS)[number]>(VETO_REASONS_KEYS[0]);
  const [vetoNote, setVetoNote] = useState("");

  useEffect(() => {
    setRoleState(getRole());
    const sync = () => setRoleState(getRole());
    window.addEventListener("rr-role", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("rr-role", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setPlanStatus(d.settings?.planStatus ?? "PROPOSED");
      }
    } catch {
      /* offline-tolerant */
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus, path]);

  useEffect(() => {
    const f = () => setNow(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    f();
    const t = setInterval(f, 1000);
    return () => clearInterval(t);
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

  const meta_role = role ? ROLE_META[role.role] : null;

  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-hull">
      <div className="tricolor" />
      <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white font-bold shadow-sm lg:hidden">
            <TrainFront size={17} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-ink">{t(titleKey)}</h1>
              {role && meta_role && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium"
                  style={{
                    borderColor: `${meta_role.color}40`,
                    background: `${meta_role.color}14`,
                    color: meta_role.color,
                  }}
                >
                  <ShieldCheck size={11} />
                  {role.role === "KARMI" && role.dept ? DEPT_LABEL[role.dept].split(" — ")[0] : t(`role.${role.role.toLowerCase()}`)}
                </span>
              )}
            </div>
            <p className="hidden text-xs text-dim sm:block">{t(subKey)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Day/Night Toggle */}
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-panel text-dim hover:text-ink hover:bg-abyss transition"
            title={theme === "dark" ? "Switch to Day Mode" : "Switch to Night Mode"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Hindi/English Toggle */}
          <button
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-xs font-medium text-dim hover:text-ink hover:bg-abyss transition"
          >
            <Languages size={14} />
            <span>{lang === "en" ? "हिन्दी" : "English"}</span>
          </button>

          {role?.role === "DRM" && (
            <button
              onClick={() => (planStatus === "VETOED" ? submitVeto(true) : setVetoOpen(true))}
              disabled={vetoBusy}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
                planStatus === "VETOED"
                  ? "bg-red-600 text-white shadow-lg shadow-red-900/20 animate-pulse"
                  : "border border-red-500/30 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
              }`}
            >
              <OctagonAlert size={14} />
              {planStatus === "VETOED" ? t("veto.active") : t("veto.human")}
            </button>
          )}

          {planStatus === "APPROVED" && (
            <span className="hidden rounded-full border border-green-500/30 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 md:inline-flex items-center gap-1 dark:bg-green-500/10 dark:text-green-400">
              <ShieldCheck size={12} /> {t("plan.approved")}
            </span>
          )}

          {!role && (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <KeyRound size={13} /> {t("btn.signin")}
            </Link>
          )}

          <div className="hidden items-center gap-1.5 rounded-md border border-edge bg-panel px-2.5 py-1 text-xs text-dim md:flex">
            <span className="anim-blink h-2 w-2 rounded-full bg-green-500" />
            <span className="text-[11px] font-medium">{t("system.ready")}</span>
          </div>

          <div className="rounded-md border border-edge bg-panel px-3 py-1 text-xs font-mono font-medium text-primary">
            {now || "--:--:--"} <span className="text-[10px] text-faint">IST</span>
          </div>
        </div>
      </div>

        {/* HUMAN VETO modal */}
        {vetoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setVetoOpen(false)}>
            <div className="anim-rise w-full max-w-md overflow-hidden rounded-2xl border border-red-300 bg-hull shadow-2xl dark:border-red-500/30" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-5 py-3.5 dark:border-red-500/20 dark:bg-red-500/[0.06]">
                <p className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
                  <OctagonAlert size={16} /> {t("veto.title")}
                </p>
                <button onClick={() => setVetoOpen(false)} className="rounded-lg p-1 text-dim hover:bg-white/50 hover:text-ink dark:hover:bg-white/5">
                  <X size={15} />
                </button>
              </div>
              <div className="space-y-4 p-5">
                <p className="text-xs leading-relaxed text-dim">
                  {t("veto.desc")}
                </p>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-dim">{t("veto.reason")}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {VETO_REASONS_KEYS.map((rKey, i) => {
                      const Icon = VETO_ICONS[i];
                      return (
                        <button
                          key={rKey}
                          type="button"
                          onClick={() => setVetoReason(rKey)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                            vetoReason === rKey
                              ? "border-red-400 bg-red-50 text-red-600 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-300"
                              : "border-edge bg-panel text-dim hover:text-ink"
                          }`}
                        >
                          <Icon size={13} className="shrink-0" />
                          <span className="truncate">{t(rKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-dim">{t("veto.note")}</label>
                  <textarea
                    value={vetoNote}
                    onChange={(e) => setVetoNote(e.target.value)}
                    rows={3}
                    placeholder="..."
                    className="w-full rounded-lg border border-edge bg-abyss px-3 py-2 text-xs text-ink placeholder:text-faint focus:border-primary/50 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => submitVeto(false)}
                  disabled={vetoBusy || vetoNote.trim().length < 6}
                  className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-red-500 disabled:opacity-50"
                >
                  {vetoBusy ? t("veto.submitting") : t("veto.confirm")}
                </button>
              </div>
            </div>
          </div>
        )}
    </header>
  );
}
