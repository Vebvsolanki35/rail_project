import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/engine/seed";
import { FEED_CONTRACTS, feedStatus, hubSummary, recentThroughput, recordsFor, runAllCycles, runCycle } from "@/lib/engine/ingestion";

export const dynamic = "force-dynamic";

/**
 * GET /api/feeds                     — hub status: every contract + latest cycle
 * GET /api/feeds?system=TMS&records=1 — synced records for one system
 * GET /api/feeds?system=TMS&status=INVALID — only quarantined/invalid records
 */
export async function GET(req: Request) {
  try {
    await ensureSeeded();
    const url = new URL(req.url);
    const system = url.searchParams.get("system");
    if (system && url.searchParams.get("records")) {
      return NextResponse.json({
        system: system.toUpperCase(),
        records: await recordsFor(system, Number(url.searchParams.get("limit") ?? 60), url.searchParams.get("status") ?? undefined),
      });
    }
    const [status, summary, throughput] = await Promise.all([feedStatus(), hubSummary(), recentThroughput(60)]);
    return NextResponse.json({
      simulated: true,
      disclaimer:
        "SIMULATED / DEMO DATA — realistic synthetic payloads served through the production adapter contract. No authorised connection to Indian Railways TMS/SMMS/TDMS/COA/FOIS/TIMETABLE/IMD exists in this prototype.",
      contracts: FEED_CONTRACTS,
      status,
      summary,
      throughput,
      system: system ? status.find((s) => s.system === system.toUpperCase()) ?? null : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST /api/feeds  { system?: "TMS" } — run one cycle, or every contract. */
export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const body = (await req.json().catch(() => ({}))) as { system?: string };
    if (body.system) {
      const result = await runCycle(body.system);
      return NextResponse.json({ simulated: true, cycles: [result], status: await feedStatus() });
    }
    const cycles = await runAllCycles();
    return NextResponse.json({ simulated: true, cycles, status: await feedStatus() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
