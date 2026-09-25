import type { ReactNode } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import PortalHeader from "@/components/PortalHeader";
import RoleGate from "@/components/RoleGate";

/**
 * Authenticated application shell.
 *
 *   PortalHeader   government-portal chrome (utility strip, alerts, clock,
 *                  health probe, role, DRM decision authority)
 *   Sidebar        grouped RBAC navigation (desktop, ≥1024px)
 *   MobileNav      the same navigation as a drawer (tablet / phone)
 *   RoleGate       session + route allow-list enforcement (src/lib/auth.ts)
 *
 * Server component: the shell itself ships no client JavaScript beyond the
 * interactive chrome it composes.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-abyss text-ink">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <PortalHeader />

        {/* Tablet / phone: module access without a keyboard-console sidebar */}
        <div className="flex items-center gap-2 border-b border-edge bg-hull px-3 py-2 lg:hidden">
          <MobileNav />
          <span className="ml-auto">
            <Link href="/patrol" className="btn btn-sm">
              Patrol handset
            </Link>
          </span>
        </div>

        <main id="main" className="min-w-0 flex-1 p-3 lg:p-4">
          <RoleGate>{children}</RoleGate>
        </main>

        <footer className="border-t border-edge bg-hull px-3 py-3 lg:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-dim">
            <p>
              <span className="font-semibold text-ink">RAIL RAKSHAK</span> · Indian Railways Block Orchestration System · Node NR-DELHI-03
            </p>
            <p className="text-faint">
              Smart India Hackathon 2026 · PS #26027 · Prototype evaluation build — not an official Government of India website
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
