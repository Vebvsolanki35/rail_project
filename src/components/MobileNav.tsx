"use client";

/**
 * RAIL RAKSHAK — TABLET / MOBILE NAVIGATION
 *
 * Below 1024px the desktop sidebar is not rendered, so operational desks would
 * otherwise be unreachable without typing URLs. This drawer exposes the same
 * RBAC-filtered grouped navigation built from `src/lib/navigation.ts`, in a
 * priority-first order for field use (Dashboards → Operations → Maintenance →
 * Field → the rest).
 *
 * Accessible: labelled trigger, aria-expanded, Esc to close, focus ring, and
 * the current module is announced with aria-current.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LayoutGrid, LogOut, Menu, TrainFront, X } from "lucide-react";
import { clearRole, ROLE_META, useRole } from "@/lib/role";
import { useSession } from "@/lib/useSession";
import { ROLE_LABEL } from "@/lib/auth";
import { navForRole } from "@/lib/navigation";
import StatusPill from "./StatusPill";

export default function MobileNav() {
  const path = usePathname();
  const router = useRouter();
  const role = useRole();
  const session = useSession();
  const [open, setOpen] = useState(false);

  const groups = navForRole(session?.role ?? null);
  const current = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).find((i) => path === i.href || path.startsWith(`${i.href}/`));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-1.5 border border-edge bg-panel px-2 text-[11.5px] font-semibold text-ink hover:border-primary hover:text-primary lg:hidden"
        aria-expanded={open}
        aria-label="Open module navigation"
      >
        {open ? <X size={14} aria-hidden /> : <Menu size={14} aria-hidden />}
        <span className="hidden xs:inline sm:inline">Modules</span>
        {current && <span className="max-w-[9rem] truncate border-l border-edge pl-1.5 text-faint">{current.label}</span>}
        <ChevronDown size={12} className="text-faint" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Module navigation">
          <button className="absolute inset-0 cursor-default bg-ink/50" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <div className="anim-rise absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-edge bg-hull shadow-[0_4px_16px_-6px_rgba(16,35,63,0.35)]">
            <div className="flex items-center justify-between border-b border-edge px-3 py-2.5">
              <span className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-primary on-accent">
                  <TrainFront size={15} aria-hidden />
                </span>
                <span className="text-[12.5px] font-extrabold tracking-tight text-ink">RAIL RAKSHAK</span>
              </span>
              <button onClick={() => setOpen(false)} className="p-1 text-dim hover:text-ink" aria-label="Close navigation">
                <X size={16} />
              </button>
            </div>

            {session && (
              <div className="flex items-center justify-between border-b border-edge bg-abyss/60 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-ink">{ROLE_LABEL[session.role]}</span>
                  <span className="block truncate text-[10px] text-dim">{session.unit}</span>
                </span>
                <StatusPill label="On duty" tone="success" />
              </div>
            )}

            <nav className="flex-1 overflow-y-auto px-3 py-3">
              {groups.map((g) => (
                <div key={g.id} className="mb-3">
                  <p className="flex items-center gap-1.5 px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                    <LayoutGrid size={10} aria-hidden /> {g.label}
                  </p>
                  <ul className="space-y-[2px]">
                    {g.items.map((n) => {
                      const active = path === n.href || path.startsWith(`${n.href}/`);
                      return (
                        <li key={n.href}>
                          <Link
                            href={n.href}
                            onClick={() => setOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-start gap-2 border-l-2 py-2 pl-2 ${
                              active ? "border-saffron bg-primary/[0.06] text-primary" : "border-transparent text-dim hover:bg-abyss hover:text-ink"
                            }`}
                          >
                            <n.icon size={15} className={`mt-[2px] shrink-0 ${active ? "text-primary" : "text-faint"}`} aria-hidden />
                            <span className="min-w-0">
                              <span className={`block text-[12px] leading-snug ${active ? "font-bold" : "font-medium"}`}>{n.label}</span>
                              {n.hint && <span className="block text-[10px] text-faint">{n.hint}</span>}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            {role && (
              <div className="border-t border-edge p-3">
                <button
                  onClick={() => {
                    clearRole();
                    router.push("/login");
                  }}
                  className="btn btn-danger w-full"
                >
                  <LogOut size={13} aria-hidden /> Sign out
                </button>
                <p className="mt-2 text-[10px] text-faint">Desk: {ROLE_META[role.role].label}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
