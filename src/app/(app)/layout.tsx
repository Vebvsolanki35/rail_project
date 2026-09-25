import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import RoleGate from "@/components/RoleGate";

/**
 * Every authenticated surface lives under (app). RoleGate enforces the session
 * and the per-role route allow-list (src/lib/auth.ts ROLE_ROUTES) before the
 * shell renders; individual pages may additionally narrow access.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-abyss text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <RoleGate>{children}</RoleGate>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge/60 bg-hull/40 px-5 py-3 text-xs text-dim">
          <p className="font-medium">
            RAIL RAKSHAK · Indian Railways Block Orchestration System · Node NR-DELHI-03
          </p>
          <p className="text-faint">
            Smart India Hackathon 2026 · PS #26027 · Ministry of Railways
          </p>
        </footer>
      </div>
    </div>
  );
}
