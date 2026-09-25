"use client";

/**
 * RAIL RAKSHAK — PRIMARY NAVIGATION (desktop)
 *
 * Grouped railway-department navigation driven by `src/lib/navigation.ts`.
 * The visible items are filtered by the signed-in role, and that filter is a
 * strict subset of the `ROLE_ROUTES` allow-list in `src/lib/auth.ts` — so the
 * navigation can never offer a desk that RoleGate would refuse.
 *
 * Tablet and phone widths get the same model through components/MobileNav.tsx.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, ChevronRight, KeyRound, LayoutGrid, LogOut, TrainFront } from "lucide-react";
import { clearRole, DEPT_LABEL, ROLE_META, useRole } from "@/lib/role";
import { useSession } from "@/lib/useSession";
import { ROLE_LABEL } from "@/lib/auth";
import { useLang } from "@/lib/lang";
import { navForRole } from "@/lib/navigation";
import StatusPill from "./StatusPill";

/** Documented external exchange contracts (see src/lib/integrations/contracts.ts). */
const UPLINKS = [
  { name: "TMS", label: "Track Management System — defect & USFD feed" },
  { name: "TDMS", label: "Traction Distribution — OHE & SCADA alerts" },
  { name: "SMMS", label: "Signal & Telecom — RDPMS diagnostics" },
  { name: "COA", label: "Control Office — corridors & live graph" },
  { name: "FOIS", label: "Freight Operations — rakes & DFC forecast" },
  { name: "IMD", label: "India Meteorological Department — fog nowcast" },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLang();
  const role = useRole();
  const session = useSession();
  const [switching, setSwitching] = useState(false);

  function signOut() {
    clearRole();
    setSwitching(false);
    router.push("/login");
  }

  const groups = navForRole(session?.role ?? null);
  const meta = role ? ROLE_META[role.role] : null;
  const roleName = session ? ROLE_LABEL[session.role] : meta?.label ?? "";
  const deptName = session?.department ? DEPT_LABEL[session.department].split(" — ")[0] : role?.dept ? DEPT_LABEL[role.dept].split(" — ")[0] : null;
  const signInNeeded = !session;

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-edge bg-hull lg:flex" aria-label="Module navigation">
      {/* Brand */}
      <Link href="/" className="dept-bar m-3 mb-2 flex items-center gap-2.5 border border-edge bg-panel px-3 py-2.5 hover:border-primary/50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-primary on-accent">
          <TrainFront size={17} strokeWidth={2.2} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-extrabold leading-none tracking-tight text-ink">RAIL RAKSHAK</span>
          <span className="mt-0.5 block truncate text-[10.5px] text-dim">{t("app.division")}</span>
        </span>
      </Link>

      {/* Desk / session panel */}
      <div className="mx-3 mb-2 border border-edge bg-panel">
        {session ? (
          <div className="p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Active desk</span>
              <span className="h-1.5 w-1.5 rounded-full bg-mint anim-blink" aria-hidden />
            </div>
            <p className="mt-1 text-[12px] font-semibold text-ink">{roleName}</p>
            <p className="truncate text-[10.5px] text-dim">{session.unit}</p>
            {deptName && <p className="mt-0.5 text-[10.5px] text-dim">{deptName}</p>}

            <button
              onClick={() => setSwitching(!switching)}
              className="mt-2 flex w-full items-center justify-between border border-edge bg-abyss px-2 py-1 text-[10.5px] font-medium text-dim hover:border-primary hover:text-primary"
              aria-expanded={switching}
            >
              <span>Change desk</span>
              <ChevronRight size={12} className={switching ? "rotate-90" : ""} aria-hidden />
            </button>

            {switching && (
              <div className="anim-rise mt-2 space-y-1.5 border-t border-edge pt-2">
                <p className="text-[10px] leading-relaxed text-faint">
                  Your desk is decided by the account you sign in with. Use another account to work at another desk.
                </p>
                <Link href="/login" className="btn btn-sm w-full">
                  <KeyRound size={11} aria-hidden /> Sign in as another account
                </Link>
                <button onClick={signOut} className="btn btn-sm btn-danger w-full">
                  <LogOut size={11} aria-hidden /> {t("btn.signout")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" className="flex items-center gap-2 p-3 text-primary hover:bg-primary/[0.04]">
            <KeyRound size={14} aria-hidden />
            <span className="text-[11.5px] font-semibold">{t("btn.select.desk")}</span>
          </Link>
        )}
      </div>

      {/* Module navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {signInNeeded && (
          <p className="mb-2 border border-saffron/35 bg-saffron/[0.06] p-2 text-[10.5px] leading-relaxed text-saffron">
            Sign in to open your modules. Public desks below need no sign-in.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.id} className="mb-3">
            <p className="flex items-center gap-1.5 px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
              <LayoutGrid size={10} aria-hidden /> {group.label}
            </p>
            <ul className="space-y-[2px]">
              {group.items.map((n) => {
                const active = path === n.href || path.startsWith(`${n.href}/`);
                const label = n.labelKey ? t(n.labelKey) : n.label;
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-start gap-2 border-l-2 py-1.5 pl-2 pr-1.5 ${
                        active ? "border-saffron bg-primary/[0.06] text-primary" : "border-transparent text-dim hover:border-edge hover:bg-abyss hover:text-ink"
                      }`}
                    >
                      <n.icon size={14} className={`mt-[1px] shrink-0 ${active ? "text-primary" : "text-faint group-hover:text-dim"}`} aria-hidden />
                      <span className="min-w-0">
                        <span className={`block text-[11.5px] leading-snug ${active ? "font-bold" : "font-medium"}`}>{label}</span>
                        {n.hint && <span className="block truncate text-[10px] text-faint">{n.hint}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Integration contracts — documented, not live (see audit / contracts.ts) */}
      <div className="mt-auto space-y-2 border-t border-edge bg-abyss/60 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-dim">
            <Activity size={11} className="text-cyan" aria-hidden /> Data-exchange contracts
          </span>
          <StatusPill label="Simulated" tone="ai" />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {UPLINKS.map((u) => (
            <div
              key={u.name}
              title={u.label}
              className="flex items-center justify-center border border-edge bg-hull py-1 font-mono text-[10px] font-semibold text-dim"
            >
              {u.name}
            </div>
          ))}
        </div>
        <p className="text-[10px] leading-relaxed text-faint">
          Contract shapes are documented in code and served from the seeded data lake; no live departmental endpoint is contacted in this build.
        </p>
      </div>
    </aside>
  );
}
