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
      <div className="tricolor" aria-hidden />

      {/* Utility strip — this handset is public, so it carries its own chrome */}
      <div className="border-b border-edge bg-primary on-accent">
        <div className="mx-auto flex h-8 max-w-3xl items-center justify-between gap-3 px-4">
          <p className="truncate text-[11px] text-on-accent/90">
            <span className="font-semibold">RAKSHAK PATROL</span>
            <span className="mx-1.5 text-on-accent/40">·</span>
            Field defect reporting — no sign-in required
          </p>
          <span className="hidden text-[11px] text-on-accent/85 sm:block">Node NR-DELHI-03</span>
        </div>
      </header>

      <header className="border-b border-edge bg-hull">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-saffron on-accent">
              <Radio size={19} aria-hidden />
            </span>
            <div>
              <p className="text-[14px] font-extrabold tracking-tight text-ink">RAKSHAK PATROL</p>
              <p className="text-[10.5px] text-dim">Gangman handset · GPS-stamped report · works without sign-in</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/trains" className="btn btn-sm">
              Train status
            </Link>
            <Link href="/" className="btn btn-sm">
              <ChevronLeft size={12} aria-hidden /> Portal home
            </Link>
          </div>
        </div>
      </header>

      <main className="gridlines mx-auto max-w-3xl px-4 py-5">
        <PatrolClient
          sections={rows
            .map((s) => ({ id: s.id, code: s.code, corridor: s.corridor, dailyTrains: s.dailyTrains }))
            .sort((a, b) => a.code.localeCompare(b.code))}
        />
      </main>

      <footer className="border-t border-edge bg-hull px-4 py-3 text-center text-[10.5px] text-faint">
        Rail Rakshak · Indian Railways Block Orchestration System · Northern Railway — Delhi Division · Prototype evaluation build (not an official Government of India website)
      </footer>
    </div>
  );
}
