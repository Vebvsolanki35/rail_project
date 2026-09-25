import { NextResponse } from "next/server";
import { authenticateOfficer, authenticateWorker, ROLE_HOME, ROLE_ROUTES } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login — validates a prototype credential pair and returns the
 * session the client stores (see src/lib/auth.ts for the pre-authorised
 * evaluation accounts). Two modes: officer (User ID + password, role derived
 * from the account) and worker (mobile + DOB).
 *
 * Production note: this endpoint would call the divisional IAM and issue a
 * signed, httpOnly session cookie. In the prototype the session lives in
 * localStorage so the demo works with no backend ceremony.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    mode?: "officer" | "worker";
    userId?: string;
    password?: string;
    mobile?: string;
    dob?: string;
  };

  // The door is explicit: an unknown/missing mode is refused instead of
  // silently falling through to the officer path.
  if (body.mode !== "officer" && body.mode !== "worker") {
    return NextResponse.json(
      { ok: false, error: "Choose a sign-in mode: 'officer' (User ID + password) or 'worker' (mobile + date of birth)." },
      { status: 400 }
    );
  }

  const result =
    body.mode === "worker"
      ? authenticateWorker(body.mobile ?? "", body.dob ?? "")
      : authenticateOfficer(body.userId ?? "", body.password ?? "");

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 401 });

  return NextResponse.json({
    ok: true,
    session: result.session,
    home: ROLE_HOME[result.session.role],
    routes: ROLE_ROUTES[result.session.role],
  });
}
