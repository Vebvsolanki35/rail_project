"use client";

/**
 * RAIL RAKSHAK — PRIMARY NAVIGATION (desktop)
 *
 * Sectioned railway-department navigation driven by `src/lib/navigation.ts`.
 * The visible items are filtered by the signed-in role, and that filter is a
 * strict subset of the `ROLE_ROUTES` allow-list in `src/lib/auth.ts` — so the
 * navigation can never offer a desk that RoleGate would refuse.
 *
 * Presentation notes for the institutional pass:
 *   · one line per module (the description lives in the `title` tooltip and in
 *     the module header), which roughly doubles the number of desks visible
 *     without scrolling — an operations console is scanned, not read;
 *   · active desk = navy field + maroon marker bar;
 *   · collapsible to an icon rail, remembered per browser.
 *
 * Tablet and phone widths get the same model through components/MobileNav.tsx.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import { ChevronsLeft, ChevronsRight, KeyRound, LogOut, PanelLeft } from "lucide-react";
import { clearRole, DEPT_LABEL, ROLE_META, useRole } from "@/lib/role";
import { useSession } from "@/lib/useSession";
import { ROLE_LABEL } from "@/lib/auth";
import { useLang } from "@/lib/lang";
import { navForRole } from "@/lib/navigation";
import StatusPill from "./StatusPill";

/** Documented external exchange contracts (see src/lib/integrations/adapters.ts). */
const UPLINKS = [
  { name: "TMS", label: "Track Management System — defect & USFD feed" },
  { name: "TDMS", label: "Traction Distribution — OHE & SCADA alerts" },
  { name: "SMMS", label: "Signal & Telecom — RDPMS diagnostics" },
  { name: "COA", label: "Control Office — corridors & live graph" },
  { name: "FOIS", label: "Freight Operations — rakes & DFC forecast" },
  { name: "IMD", label: "India Meteorological Department — fog nowcast" },
];

const COLLAPSE_KEY = "rr-nav-collapsed";

/**
 * Rail-width preference, kept in localStorage.
 *
 * Held in a tiny external store rather than component state + effect: the
 * server snapshot is always "expanded", so hydration matches, and the stored
 * preference is applied by the re-render React performs after subscribing.
 */
const collapseListeners = new Set<() => void>();
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(next: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  } catch {
    /* private mode — the toggle still applies for this page */
  }
  collapseListeners.forEach((l) => l());
}
function subscribeCollapse(cb: () => void) {
  collapseListeners.add(cb);
  return () => collapseListeners.delete(cb);
}

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { t } = useLang();
  const role = useRole();
  const session = useSession();
  const collapsed = useSyncExternalStore(subscribeCollapse, readCollapsed, () => false);
  const toggleCollapsed = useCallback(() => writeCollapsed(!readCollapsed()), []);

  const groups = navForRole(session?.role ?? null);
  const meta = role ? ROLE_META[role.role] : null;
  const roleName = session ? ROLE_LABEL[session.role] : meta?.label ?? "";
  const deptName = session?.department
    ? DEPT_LABEL[session.department].split(" — ")[0]
    : role?.dept
      ? DEPT_LABEL[role.dept].split(" — ")[0]
      : null;
  const signInNeeded = !session;

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-edge bg-hull lg:flex ${
        collapsed ? "w-[54px]" : "w-[224px]"
      }`}
      aria-label="Module navigation"
    >
      {/* Rail control: width toggle */}
      <div className="flex items-center justify-between border-b border-edge px-2 py-[7px]">
        {!collapsed && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-faint">
            <PanelLeft size={11} aria-hidden /> Modules
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          className="flex h-6 w-6 items-center justify-center border border-edge text-dim hover:border-primary hover:text-primary"
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronsRight size={12} aria-hidden /> : <ChevronsLeft size={12} aria-hidden />}
        </button>
      </div>

      {/* Module navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1.5">
        {signInNeeded && !collapsed && (
          <p className="mx-2 mb-2 border border-maroon/40 bg-maroon/[0.05] p-2 text-[10px] leading-snug text-maroon">
            Sign in to open your desks. The patrol handset and citizen train view below need no sign-in.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.id} className="mb-1">
            {collapsed ? (
              <div className="mx-2 my-1.5 h-px bg-edge" aria-hidden />
            ) : (
              <p className="dept-bar mx-2 mb-1 mt-2 text-[9.5px] font-bold uppercase tracking-[0.11em] text-maroon">
                {group.label}
              </p>
            )}
            <ul>
              {group.items.map((n) => {
                const active = path === n.href || path.startsWith(`${n.href}/`);
                const label = n.labelKey ? t(n.labelKey) : n.label;
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? `${label}${n.hint ? ` — ${n.hint}` : ""}` : n.hint}
                      className={`relative flex items-center gap-2 border-l-[3px] py-[6px] ${
                        collapsed ? "justify-center pl-0 pr-0" : "pl-2 pr-2"
                      } ${
                        active
                          ? "border-maroon bg-primary/[0.07] text-primary"
                          : "border-transparent text-dim hover:border-edge hover:bg-parch hover:text-ink"
                      }`}
                    >
                      <n.icon
                        size={15}
                        className={`shrink-0 ${active ? "text-primary" : "text-faint"}`}
                        aria-hidden
                      />
                      {!collapsed && (
                        <span className={`truncate text-[11.5px] leading-tight ${active ? "font-bold" : "font-medium"}`}>
                          {label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Desk + data-exchange contracts */}
      <div className="border-t border-edge bg-parch">
        {signInNeeded ? (
          <Link
            href="/login"
            className={`flex items-center gap-2 p-2 text-primary hover:bg-panel ${collapsed ? "justify-center" : ""}`}
            title={t("btn.select.desk")}
          >
            <KeyRound size={14} aria-hidden />
            {!collapsed && <span className="text-[11px] font-semibold">{t("btn.select.desk")}</span>}
          </Link>
        ) : (
          <div className={`flex items-center gap-2 p-2 ${collapsed ? "justify-center" : ""}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-primary/40 bg-panel font-mono text-[10px] font-bold text-primary">
              {roleName.slice(0, 2).toUpperCase()}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10.5px] font-semibold text-ink">{roleName}</span>
                <span className="block truncate text-[10px] text-faint">{deptName ?? session?.unit}</span>
              </span>
            )}
            <button
              onClick={() => {
                clearRole();
                router.push("/login");
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center text-dim hover:text-signal"
              title={t("btn.signout")}
              aria-label={t("btn.signout")}
            >
              <LogOut size={12} aria-hidden />
            </button>
          </div>
        )}

        {!collapsed && (
          <div className="space-y-1.5 border-t border-edge px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-dim">Exchange contracts</span>
              <StatusPill label="Simulated" tone="ai" />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {UPLINKS.map((u) => (
                <div
                  key={u.name}
                  title={u.label}
                  className="border border-edge bg-panel py-1 text-center font-mono text-[9.5px] font-semibold text-dim"
                >
                  {u.name}
                </div>
              ))}
            </div>
            <p className="text-[9.5px] leading-snug text-faint">
              Contract shapes are documented in code and served from the seeded data lake. No live departmental endpoint is contacted in this build.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
