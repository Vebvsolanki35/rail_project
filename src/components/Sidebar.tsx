"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCog, FlaskConical, HardHat, KeyRound, LayoutGrid, Radar, ShieldCheck, TrainFront, Users, Wrench, ChevronRight, Activity } from "lucide-react";
import { getRole, setRole, ROLE_META, DEPT_LABEL, type Role, type RoleInfo } from "@/lib/role";
import { useLang } from "@/lib/lang";

const NAV = [
  { href: "/command", labelKey: "nav.command", icon: Radar, hintKey: "nav.command.hint", roles: ["DRM", "CONTROL"] },
  { href: "/planner", labelKey: "nav.planner", icon: CalendarCog, hintKey: "nav.planner.hint", roles: ["DRM", "CONTROL"] },
  { href: "/simulation", labelKey: "nav.simulation", icon: FlaskConical, hintKey: "nav.simulation.hint", roles: ["DRM", "CONTROL"] },
  { href: "/field", labelKey: "nav.field", icon: HardHat, hintKey: "nav.field.hint", roles: ["INSPECTOR", "DRM"] },
  { href: "/jobs", labelKey: "nav.jobs", icon: Wrench, hintKey: "nav.jobs.hint", roles: ["KARMI"] },
];

const UPLINKS = [
  { name: "TMS", label: "Track" },
  { name: "TDMS", label: "Traction" },
  { name: "SMMS", label: "Signals" },
  { name: "COA", label: "Control" },
  { name: "FOIS", label: "Freight" },
  { name: "IMD", label: "Weather" },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLang();
  const [role, setRoleState] = useState<RoleInfo | null>(null);
  const [switching, setSwitching] = useState(false);

  function quickSwitch(r: Role) {
    setRole({ role: r, dept: r === "KARMI" ? (role?.dept ?? "ENG") : undefined });
    setSwitching(false);
    router.push(ROLE_META[r].dest);
  }

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

  const visibleNav = role ? NAV.filter((n) => n.roles.includes(role.role)) : NAV.slice(0, 3);
  const meta = role ? ROLE_META[role.role] : null;

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-edge bg-hull lg:flex">
      {/* Brand Header */}
      <Link href="/" className="flex items-center gap-3 border-b border-edge px-5 py-4 transition hover:bg-abyss/50">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <TrainFront size={20} strokeWidth={2.2} />
        </span>
        <div>
          <span className="block text-sm font-bold tracking-tight text-ink">{t("app.name")}</span>
          <span className="block text-[11px] font-medium text-dim">{t("app.division")}</span>
        </div>
      </Link>

      {/* Role Profile Box */}
      <div className="border-b border-edge p-3.5">
        {role && meta ? (
          <div className="rounded-xl border border-edge bg-abyss p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-faint">{t("role.active")}</span>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
            </div>
            <p className="mt-1 text-xs font-semibold text-ink">
              {role.role === "KARMI" && role.dept ? DEPT_LABEL[role.dept].split(" — ")[0] : t(`role.${role.role.toLowerCase()}`)}
            </p>
            {role.role === "KARMI" && role.dept && (
              <p className="mt-0.5 text-[11px] text-dim">{DEPT_LABEL[role.dept].split(" — ")[1]}</p>
            )}
            <button
              onClick={() => setSwitching(!switching)}
              className="mt-2.5 flex w-full items-center justify-between rounded-lg border border-edge bg-hull px-2.5 py-1.5 text-[11px] font-medium text-dim hover:text-ink transition"
            >
              <span>{t("role.switch")}</span>
              <ChevronRight size={13} className={switching ? "rotate-90" : ""} />
            </button>
            {switching && (
              <div className="anim-rise mt-2 grid grid-cols-2 gap-1.5 border-t border-edge pt-2">
                {(["DRM", "CONTROL", "INSPECTOR", "KARMI"] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => quickSwitch(r)}
                    className="rounded-md border border-edge bg-hull px-2 py-1.5 text-left text-[10.5px] font-medium text-dim hover:border-primary/40 hover:text-ink transition"
                  >
                    {r === "CONTROL" ? "COA Room" : t(`role.${r.toLowerCase()}`).split(" ")[0]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-primary hover:bg-primary/10 transition"
          >
            <KeyRound size={15} />
            <span className="text-xs font-semibold">{t("btn.select.desk")}</span>
          </Link>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-1.5 text-[10.5px] font-semibold tracking-wider text-faint uppercase">{t("nav.operations")}</p>
        {visibleNav.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                active
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-dim hover:bg-abyss hover:text-ink font-medium"
              }`}
            >
              <n.icon size={17} className={active ? "text-primary" : "text-faint group-hover:text-dim"} />
              <div className="min-w-0 flex-1">
                <span className="block text-xs leading-snug">{t(n.labelKey)}</span>
                <span className="block truncate text-[10px] text-faint group-hover:text-dim/80">{t(n.hintKey)}</span>
              </div>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}

        <div className="pt-4">
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold tracking-wider text-faint uppercase">{t("nav.system")}</p>
          <Link
            href="/"
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
              path === "/"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-dim hover:bg-abyss hover:text-ink font-medium"
            }`}
          >
            <LayoutGrid size={17} className={path === "/" ? "text-primary" : "text-faint group-hover:text-dim"} />
            <div className="min-w-0 flex-1">
              <span className="block text-xs leading-snug">{t("nav.overview")}</span>
              <span className="block truncate text-[10px] text-faint">{t("nav.overview.hint")}</span>
            </div>
          </Link>
        </div>

        {/* PUBLIC citizen portal — clearly separated from internal operations */}
        <div className="pt-4">
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold tracking-wider text-faint uppercase">{t("nav.public")}</p>
          <Link
            href="/trains"
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
              path === "/trains"
                ? "bg-mint/10 text-mint font-semibold"
                : "text-dim hover:bg-abyss hover:text-ink font-medium"
            }`}
          >
            <Users size={17} className={path === "/trains" ? "text-mint" : "text-faint group-hover:text-dim"} />
            <div className="min-w-0 flex-1">
              <span className="block text-xs leading-snug">{t("nav.trains")}</span>
              <span className="block truncate text-[10px] text-faint">{t("nav.trains.hint")}</span>
            </div>
          </Link>
        </div>
      </nav>

      {/* Connected Feeds Footer */}
      <div className="mt-auto border-t border-edge p-4 space-y-2.5 bg-abyss/50">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-dim">
            <Activity size={12} className="text-green-500" /> {t("feeds.title")}
          </span>
          <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 anim-blink" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {UPLINKS.map((u) => (
            <div
              key={u.name}
              className="flex items-center justify-center rounded-md border border-edge bg-hull py-1 text-[10px] font-mono text-dim font-medium"
              title={u.label}
            >
              {u.name}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
