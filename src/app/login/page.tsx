"use client";

/**
 * Sign-in.
 *
 * Two doors, because the railway has two kinds of user:
 *   OFFICER      User ID + password. The role is derived from the account — you
 *                cannot choose to be the DRM.
 *   FIELD WORKER mobile number + date of birth. No passwords in the field.
 *
 * The patroller handset (/patrol) and the citizen train view (/trains) need no
 * sign-in at all.
 */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronLeft, HardHat, KeyRound, Lock, Radio, ShieldCheck, TrainFront, UserRound } from "lucide-react";
import { DEMO_PASSWORD, OFFICER_ACCOUNTS, ROLE_HOME, ROLE_LABEL, WORKER_ACCOUNTS, setSession, type Session } from "@/lib/auth";

type Mode = "officer" | "worker";

/**
 * `useSearchParams` forces a client-side bailout during prerendering, so the
 * form that reads `?next=` lives behind a Suspense boundary: the shell
 * prerenders, the form hydrates with the redirect target.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <SignInForm />
    </Suspense>
  );
}

/** Prerendered skeleton shown until the form's search params resolve. */
function LoginShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-abyss px-4">
      <div className="w-full max-w-md rounded-2xl border border-edge bg-hull p-8 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
          <TrainFront size={22} strokeWidth={2.2} />
        </span>
        <p className="mt-4 text-sm font-semibold text-ink">Rail Rakshak</p>
        <p className="mt-1 text-xs text-dim">Preparing the sign-in desk…</p>
      </div>
    </div>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [mode, setMode] = useState<Mode>("officer");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "officer" ? { mode, userId, password } : { mode, mobile, dob }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; session?: Session; home?: string };
      if (!res.ok || !json.session) {
        setError(json.error ?? "Sign-in failed");
        return;
      }
      setSession(json.session);
      router.replace(next || json.home || ROLE_HOME[json.session.role]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  function quickFill(id: string) {
    setMode("officer");
    setUserId(id);
    setPassword(DEMO_PASSWORD);
  }

  return (
    <div className="flex min-h-screen flex-col bg-abyss text-ink">
      <div className="tricolor" />

      <header className="border-b border-edge/80 bg-hull/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-slate-950 shadow-md">
              <TrainFront size={22} strokeWidth={2.2} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-ink">RAIL RAKSHAK</span>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                  SIH 2026 #26027
                </span>
              </div>
              <p className="text-xs text-dim">Ministry of Railways · Northern Railway (Delhi Division)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-dim">
            <span className="h-2 w-2 rounded-full bg-emerald-400 anim-blink" />
            <span className="hidden sm:inline">Orchestrator Online</span>
          </div>
        </div>
      </header>

      <main className="gridlines mx-auto grid w-full max-w-5xl flex-1 items-start gap-10 px-5 py-10 lg:grid-cols-[1fr_420px] sm:px-8">
        <div>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-dim transition hover:text-ink">
            <ChevronLeft size={14} /> Back to Project Overview
          </Link>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Sign in to your desk</h1>
          <p className="mt-3 text-sm leading-relaxed text-dim">
            Access is role-based: the account decides which desk you land on. Officers sign in with a User ID and
            password, field karmis with the mobile number registered to their gang. Patrollers and citizens never need
            an account.
          </p>

          <div className="mt-6 space-y-2 rounded-2xl border border-edge/80 bg-panel/40 p-4">
            <p className="text-xs font-semibold text-ink">Pre-authorised evaluation accounts</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {OFFICER_ACCOUNTS.map((a) => (
                <button
                  key={a.userId}
                  type="button"
                  onClick={() => quickFill(a.userId)}
                  className="flex items-center justify-between rounded-lg border border-edge bg-hull/40 px-3 py-2 text-left text-[11px] transition hover:border-amber-500/50"
                >
                  <span>
                    <span className="font-mono font-semibold text-amber-400">{a.userId}</span>
                    <span className="ml-2 text-dim">{ROLE_LABEL[a.role]}</span>
                  </span>
                  <ArrowRight size={12} className="text-faint" />
                </button>
              ))}
            </div>
            <p className="text-[10px] text-faint">
              Shared password for every officer account: <span className="font-mono text-dim">{DEMO_PASSWORD}</span>
            </p>
            <div className="mt-2 border-t border-edge/60 pt-2">
              <p className="text-[10px] uppercase tracking-wide text-faint">Field worker accounts (mobile + DOB)</p>
              <div className="mt-1.5 grid gap-1 sm:grid-cols-3">
                {WORKER_ACCOUNTS.map((w) => (
                  <button
                    key={w.mobile}
                    type="button"
                    onClick={() => {
                      setMode("worker");
                      setMobile(w.mobile);
                      setDob(w.dob);
                    }}
                    className="rounded-lg border border-edge bg-hull/40 px-2 py-1.5 text-left text-[10px] transition hover:border-amber-500/50"
                  >
                    <span className="block font-mono text-[11px] text-violet-300">{w.mobile}</span>
                    <span className="text-faint">{w.designation}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
            <Link href="/patrol" className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-dim transition hover:text-ink">
              <HardHat size={13} /> Patroller handset (no login)
            </Link>
            <Link href="/trains" className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-dim transition hover:text-ink">
              <TrainFront size={13} /> Citizen train view (no login)
            </Link>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="rounded-2xl border border-edge/80 bg-panel shadow-sm">
          <div className="grid grid-cols-2 gap-1 border-b border-edge/70 p-2">
            <button
              onClick={() => setMode("officer")}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                mode === "officer" ? "bg-amber-500 text-slate-950" : "text-dim hover:text-ink"
              }`}
            >
              <ShieldCheck size={14} /> Officer
            </button>
            <button
              onClick={() => setMode("worker")}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                mode === "worker" ? "bg-violet-600 text-white" : "text-dim hover:text-ink"
              }`}
            >
              <UserRound size={14} /> Field worker
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3 p-4">
            {mode === "officer" ? (
              <>
                <label className="block text-[11px] text-dim">
                  User ID
                  <input
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="drm01 / coa01 / sm01 / ins01"
                    autoComplete="username"
                    className="mt-1 w-full rounded-xl border border-edge bg-hull/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-amber-500/60"
                  />
                </label>
                <label className="block text-[11px] text-dim">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="•••••••"
                    autoComplete="current-password"
                    className="mt-1 w-full rounded-xl border border-edge bg-hull/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-amber-500/60"
                  />
                </label>
                <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
                  <Lock size={11} className="mt-0.5 shrink-0" />
                  Your role (DRM, Control, Station Master, Inspector) is derived from the account — it cannot be chosen
                  here.
                </p>
              </>
            ) : (
              <>
                <label className="block text-[11px] text-dim">
                  Registered mobile number
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="98110 00101"
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-edge bg-hull/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-violet-500/60"
                  />
                </label>
                <label className="block text-[11px] text-dim">
                  Date of birth
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-edge bg-hull/50 px-3 py-2.5 text-sm text-ink outline-none focus:border-violet-500/60"
                  />
                </label>
                <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
                  <Radio size={11} className="mt-0.5 shrink-0" />
                  Field karmis have no password: the mobile number is registered to their gang and the date of birth
                  confirms identity.
                </p>
              </>
            )}

            {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${
                mode === "officer" ? "bg-amber-500 text-slate-950 hover:bg-amber-400" : "bg-violet-600 text-white hover:bg-violet-500"
              }`}
            >
              <KeyRound size={15} /> {busy ? "Signing in…" : mode === "officer" ? "Sign in to desk" : "Enter job portal"}
            </button>

            <p className="text-center text-[10px] text-faint">
              Prototype authentication · sessions are held in this browser only. A production build authenticates
              against the divisional IAM and issues a signed server session.
            </p>
          </form>
        </div>
      </main>

      <footer className="border-t border-edge/80 bg-hull px-5 py-4 text-center text-xs text-faint">
        Northern Railway · Delhi Division · Smart India Hackathon 2026
      </footer>
    </div>
  );
}
