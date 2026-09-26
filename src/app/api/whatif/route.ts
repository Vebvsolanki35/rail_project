import { NextResponse } from "next/server";
import { whatIf } from "@/lib/engine/simulate";
import { ensureSeeded } from "@/lib/engine/seed";
import type { WhatIfRequest } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as Partial<WhatIfRequest>;
    /* Simulation input is validated BEFORE the engine runs: a what-if must answer
       a question about a real section, with a sane duration and start time. */
    const segmentId = Number(body.segmentId);
    if (!Number.isFinite(segmentId))
      return NextResponse.json({ error: "segmentId is required — pick a section from the network map" }, { status: 400 });
    const durationH = Number(body.durationH ?? 2);
    const startMin = Number(body.startMin ?? 60);
    if (!(durationH > 0 && durationH <= 24))
      return NextResponse.json({ error: "durationH must be between 0 and 24" }, { status: 400 });
    if (!(startMin >= 0 && startMin <= 1440))
      return NextResponse.json({ error: "startMin must be within a day (0–1440 minutes)" }, { status: 400 });
    const result = await whatIf({ segmentId, durationH, startMin, superBlock: !!body.superBlock });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: /not found/.test(message) ? 404 : 500 });
  }
}
