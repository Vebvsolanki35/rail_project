import Link from "next/link";
import { ChevronLeft, Radio } from "lucide-react";
import PatrolClient from "@/components/PatrolClient";
import { ensureSeeded } from "@/lib/engine/seed";
import { db } from "@/db";
import { segments } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Rakshak Patrol — the gangman's handset. Deliberately LOGIN-FREE (see
 * PUBLIC_ROUTES in src/lib/auth.ts): a patroller in the field taps a category,
 * stamps GPS and submits. No passwords, no menus, one screen.
 */
export default async function PatrolPage() {
  await ensureSeeded();
  const rows = await db.select().from(segments);

  return (
    <div className="min-h-screen bg-abyss text-ink">
      <div className="tricolor" />
      <header className="border-b border-edge/80 bg-hull/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-slate-950">
              <Radio size={18} />
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight">RAKSHAK PATROL</p>
              <p className="text-[10px] text-dim">Field defect reporting · no login required</p>
            </div>
          </div>
          <Link href="/" className="inline-flex items-center gap-1 text-[11px] text-dim transition hover:text-ink">
            <ChevronLeft size={12} /> Home
          </Link>
        </div>
      </header>

      <main className="gridlines mx-auto max-w-2xl px-4 py-6">
        <PatrolClient
          sections={rows
            .map((s) => ({ id: s.id, code: s.code, corridor: s.corridor, dailyTrains: s.dailyTrains }))
            .sort((a, b) => a.code.localeCompare(b.code))}
        />
      </main>

      <footer className="border-t border-edge/70 px-4 py-3 text-center text-[10px] text-faint">
        Northern Railway · Delhi Division · Smart India Hackathon 2026 · PS #26027
      </footer>
    </div>
  );
}
