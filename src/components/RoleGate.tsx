"use client";

/**
 * Route protection. Wraps every authenticated page:
 *   - no session           → redirect to /login (remembering where you wanted to go)
 *   - session, wrong desk  → explicit "this desk is not part of your role" screen
 *   - allowed              → renders the page
 *
 * Login-free surfaces (/patrol, /trains, /) are listed in PUBLIC_ROUTES and are
 * deliberately not wrapped.
 */
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lock, ShieldAlert } from "lucide-react";
import { ROLE_LABEL, ROLE_ROUTES, canAccess, roleHome, type AppRole } from "@/lib/auth";
import { useSession } from "@/lib/useSession";

export default function RoleGate({
  children,
  allow,
  title,
}: {
  children: ReactNode;
  /** Optional stricter allow-list for a single page (subset of ROLE_ROUTES). */
  allow?: AppRole[];
  title?: string;
}) {
  // `useSession` reads the session as an external store: the server snapshot is
  // "no session" and the client snapshot is the real one, so there is no
  // mount-flag dance and no hydration mismatch.
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [session, router, pathname]);

  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border border-edge/70 bg-panel/60 px-5 py-4 text-sm text-dim">
          <Lock size={16} className="text-amber-400" />
          <span>Verifying session…</span>
        </div>
      </div>
    );
  }

  const roleAllowed = canAccess(session.role, pathname);
  const explicitAllowed = allow ? allow.includes(session.role) : true;

  if (!roleAllowed || !explicitAllowed) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <ShieldAlert size={18} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-ink">
                {roleAllowed ? "Not part of your desk" : "Access denied"} — {title ?? pathname}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-dim">
                You are signed in as <span className="font-semibold text-ink">{ROLE_LABEL[session.role]}</span> ({session.name}).
                This surface is restricted to {allow ? allow.map((r) => ROLE_LABEL[r]).join(", ") : "other desks"}.
              </p>
              <p className="mt-2 text-[11px] text-faint">
                Prototype roles are enforced in the UI at the route boundary. The production design moves this check
                server-side (signed session cookie + divisional IAM), with the same allow-list.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={roleHome(session.role)}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"
                >
                  Go to my desk ({roleHome(session.role)})
                </Link>
                <Link href="/login" className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-dim transition hover:text-ink">
                  Switch account
                </Link>
              </div>
              <p className="mt-3 text-[11px] text-faint">
                Your desk grants: {ROLE_ROUTES[session.role].join(" · ")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
