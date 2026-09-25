"use client";

/**
 * PORTAL SIGN-IN
 *
 * Two doors, because the railway has two kinds of user:
 *   OFFICER       User ID + password. The desk is derived from the account — you
 *                 cannot choose to be the DRM.
 *   FIELD KARMI   mobile number + date of birth. No passwords in the field.
 *
 * The patroller handset (/patrol) and the citizen train view (/trains) need no
 * sign-in at all.
 *
 * Presented as a government-portal access page: utility strip, masthead,
 * numbered sign-in procedure, the two-door tab panel, a register of the
 * pre-authorised evaluation accounts, and the prototype disclosure.
 */
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  HardHat,
  KeyRound,
  Lock,
  Radio,
  ShieldCheck,
  TrainFront,
  UserRound,
} from "lucide-react";
import { DEMO_PASSWORD, OFFICER_ACCOUNTS, ROLE_HOME, ROLE_LABEL, WORKER_ACCOUNTS, setSession, type Session } from "@/lib/auth";
import StatusPill from "@/components/StatusPill";

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
    <div className="flex min-h-screen flex-col bg-abyss">
      <div className="tricolor" />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md border border-edge bg-panel p-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[3px] bg-primary on-accent">
            <TrainFront size={22} strokeWidth={2.2} aria-hidden />
          </span>
          <p className="mt-3 text-[13px] font-bold text-ink">RAIL RAKSHAK</p>
          <p className="mt-1 text-[11.5px] text-dim">Preparing the sign-in desk…</p>
        </div>
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
      <div className="tricolor" aria-hidden />

      {/* ══════════ UTILITY STRIP ══════════ */}
      <div className="border-b border-edge bg-primary on-accent">
        <div className="mx-auto flex h-8 max-w-[1200px] items-center justify-between gap-3 px-4">
          <p className="truncate text-[11px] text-on-accent/90">
            <span className="font-semibold">Rail Rakshak</span>
            <span className="mx-1.5 text-on-accent/40">·</span>
            Restricted access — authorised desks only
          </p>
          <p className="hidden text-[11px] text-on-accent/85 sm:block">Node NR-DELHI-03 · Delhi Division</p>
        </div>
      </div>

      {/* ══════════ MASTHEAD ══════════ */}
      <header className="border-b border-edge bg-hull">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[3px] bg-primary on-accent">
              <TrainFront size={22} strokeWidth={2.2} aria-hidden />
            </span>
            <span>
              <span className="flex items-center gap-2 text-[15px] font-extrabold leading-none tracking-tight text-ink">
                RAIL RAKSHAK
                <span className="rounded-[3px] border border-saffron/40 bg-saffron/[0.07] px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wider text-saffron">
                  Prototype
                </span>
              </span>
              <span className="mt-1 block text-[11px] font-medium text-dim">
                AI-Powered Railway Operations &amp; Maintenance Management System
              </span>
            </span>
          </Link>
          <StatusPill label="Authentication gateway" tone="info" />
        </div>
      </header>

      <main className="gridlines mx-auto grid w-full max-w-[1200px] flex-1 items-start gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <Link href="/" className="btn-link inline-flex items-center gap-1">
            <ChevronLeft size={13} aria-hidden /> Back to portal home
          </Link>

          <h1 className="mt-3 border-b border-edge pb-2 text-[19px] font-bold tracking-tight text-ink">
            Sign in to your desk
          </h1>
          <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-dim">
            Access is role-based: the account decides which desk you land on. Officers sign in with a User ID and password; field karmis with the mobile
            number registered to their gang. Patrollers and citizens never need an account.
          </p>

          {/* Procedure */}
          <ol className="mt-4 space-y-1.5">
            {[
              "Choose the door that matches your role — officer desk or field karmi.",
              "Enter your credentials. The desk and its permitted modules are derived from the account.",
              "You land on your home desk; other desks remain closed to you by the route gate.",
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-dim">
                <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] bg-primary font-mono text-[9.5px] font-bold on-accent">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {/* Evaluation account register */}
          <section className="mt-5 border border-edge bg-panel">
            <div className="panel-hd">
              <span>Pre-authorised evaluation accounts</span>
              <span className="font-mono text-[10.5px] normal-case tracking-normal text-faint">click to fill</span>
            </div>

            <div className="gov-table-wrap">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th className="sr">Sr</th>
                    <th>Sign-in ID</th>
                    <th>Desk</th>
                    <th>Home module</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {OFFICER_ACCOUNTS.map((a, i) => (
                    <tr key={a.userId}>
                      <td className="sr">{String(i + 1).padStart(2, "0")}</td>
                      <td className="ref">{a.userId}</td>
                      <td>
                        <StatusPill label={ROLE_LABEL[a.role]} tone={a.role === "DRM" ? "critical" : "info"} />
                      </td>
                      <td className="font-mono text-[10.5px] text-dim">{ROLE_HOME[a.role]}</td>
                      <td>
                        <button type="button" onClick={() => quickFill(a.userId)} className="btn btn-sm">
                          Fill form <ArrowRight size={11} aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="border-t border-edge px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              Shared evaluation password for every officer account: <span className="font-mono text-dim">{DEMO_PASSWORD}</span> — shown openly because this
              build is a demonstration, not a production deployment.
            </p>

            <div className="border-t border-edge">
              <div className="panel-hd">
                <span>Field karmi accounts — mobile + date of birth</span>
                <StatusPill label="No password" tone="ai" />
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-3">
                {WORKER_ACCOUNTS.map((w) => (
                  <button
                    key={w.mobile}
                    type="button"
                    onClick={() => {
                      setMode("worker");
                      setMobile(w.mobile);
                      setDob(w.dob);
                    }}
                    className="border border-edge bg-panel px-2.5 py-2 text-left hover:border-violet/50"
                  >
                    <span className="block font-mono text-[11.5px] font-semibold text-violet">{w.mobile}</span>
                    <span className="mt-0.5 block text-[10.5px] text-dim">{w.designation}</span>
                    <span className="block text-[10px] text-faint">{w.gang}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/patrol" className="btn">
              <HardHat size={13} aria-hidden /> Patroller handset (no login)
            </Link>
            <Link href="/trains" className="btn">
              <TrainFront size={13} aria-hidden /> Citizen train view (no login)
            </Link>
          </div>
        </div>

        {/* ══════════ SIGN-IN PANEL ══════════ */}
        <section className="border border-edge bg-panel">
          <div className="panel-hd">
            <span>Portal access</span>
            <StatusPill label="Secured form" tone="success" />
          </div>

          <div className="grid grid-cols-2 gap-0 border-b border-edge">
            <button
              type="button"
              onClick={() => setMode("officer")}
              aria-pressed={mode === "officer"}
              className={`flex items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-wide ${
                mode === "officer" ? "border-saffron bg-saffron/[0.06] text-saffron" : "border-transparent text-dim hover:text-ink"
              }`}
            >
              <ShieldCheck size={14} aria-hidden /> Officer desk
            </button>
            <button
              type="button"
              onClick={() => setMode("worker")}
              aria-pressed={mode === "worker"}
              className={`flex items-center justify-center gap-1.5 border-b-2 border-l border-edge px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-wide ${
                mode === "worker" ? "border-b-violet bg-violet/[0.06] text-violet" : "border-transparent text-dim hover:text-ink"
              }`}
            >
              <UserRound size={14} aria-hidden /> Field karmi
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3 p-4">
            {mode === "officer" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-faint">
                    User ID <span className="text-signal">*</span>
                  </span>
                  <input
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="drm01 / coa01 / sm01 / ins01"
                    autoComplete="username"
                    required
                    className="w-full border border-edge bg-hull px-3 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-faint">
                    Password <span className="text-signal">*</span>
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="•••••••"
                    autoComplete="current-password"
                    required
                    className="w-full border border-edge bg-hull px-3 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-primary"
                  />
                </label>
                <p className="flex items-start gap-1.5 border border-edge bg-abyss/50 p-2 text-[10.5px] leading-relaxed text-dim">
                  <Lock size={11} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                  Your role (DRM, Control, Station Master, Inspector) is derived from the account — it cannot be chosen here.
                </p>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-faint">
                    Registered mobile number <span className="text-signal">*</span>
                  </span>
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="9811000101"
                    inputMode="numeric"
                    required
                    className="w-full border border-edge bg-hull px-3 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-faint">
                    Date of birth <span className="text-signal">*</span>
                  </span>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    required
                    className="w-full border border-edge bg-hull px-3 py-2 text-[13px] text-ink outline-none focus:border-primary"
                  />
                </label>
                <p className="flex items-start gap-1.5 border border-edge bg-abyss/50 p-2 text-[10.5px] leading-relaxed text-dim">
                  <Radio size={11} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                  Field karmis have no password: the mobile number is registered to their gang and the date of birth confirms identity.
                </p>
              </>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-1.5 border border-signal/40 bg-signal/[0.07] px-3 py-2 text-[11px] text-signal">
                <Lock size={11} className="mt-0.5 shrink-0" aria-hidden /> {error}
              </p>
            )}

            <button type="submit" disabled={busy} className={`btn w-full ${mode === "officer" ? "btn-primary" : "btn-accent"}`}>
              <KeyRound size={14} aria-hidden />
              {busy ? "Verifying credentials…" : mode === "officer" ? "Sign in to desk" : "Enter work-order portal"}
            </button>

            <ul className="space-y-1 border-t border-edge pt-2.5">
              {["Session held in this browser only", "Desk decided by account, not by choice", "Every action recorded against your name"].map((n) => (
                <li key={n} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-faint">
                  <CheckCircle2 size={10} className="mt-[2px] shrink-0 text-mint" aria-hidden />
                  {n}
                </li>
              ))}
            </ul>

            <p className="border border-saffron/35 bg-saffron/[0.06] p-2 text-[10px] leading-relaxed text-saffron">
              <strong>Prototype notice:</strong> evaluation build with pre-authorised demonstration accounts. Not an official Government of India website.
              Production replaces this with divisional IAM / LDAP and a signed server session.
            </p>
          </form>
        </section>
      </main>

      <footer className="border-t border-edge bg-hull px-4 py-3">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 text-[11px] text-dim">
          <p>
            <span className="font-semibold text-ink">RAIL RAKSHAK</span> · Indian Railways Block Orchestration System · Northern Railway — Delhi Division
          </p>
          <p className="text-faint">Smart India Hackathon 2026 · PS #26027 · Prototype evaluation build</p>
        </div>
      </footer>
    </div>
  );
}
