import { NextResponse } from "next/server";
import { setPlanStatus } from "@/lib/engine/jobs";

const DECISIONS = ["PROPOSED", "APPROVED", "VETOED"] as const;

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { mode?: string; reason?: string; note?: string; actorName?: string; actorRole?: string };
    const mode = String(body.mode ?? "").toUpperCase();
    if (!DECISIONS.includes(mode as (typeof DECISIONS)[number]))
      return NextResponse.json({ error: `mode must be one of ${DECISIONS.join(", ")}` }, { status: 400 });
    /* A veto is the DRM overriding the machine — it must state why, and the
       decision is recorded against the officer who took it. */
    const reason = (body.reason ?? "").trim();
    if (mode === "VETOED" && reason.length < 6)
      return NextResponse.json({ error: "a veto must record a reason (at least 6 characters)" }, { status: 400 });
    await setPlanStatus(
      mode as (typeof DECISIONS)[number],
      reason || undefined,
      body.note,
      { name: String(body.actorName ?? (mode === "PROPOSED" ? "Section Controller" : "Divisional Railway Manager")), role: String(body.actorRole ?? (mode === "PROPOSED" ? "CONTROL" : "DRM")) }
    );
    return NextResponse.json({ ok: true, planStatus: mode });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
