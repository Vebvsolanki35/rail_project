import { NextResponse } from "next/server";
import { searchTrains } from "@/lib/engine/citizen";

export const dynamic = "force-dynamic";

/**
 * Citizen train search — GET /api/trains?q=<number-or-name>
 * Searches the existing demo roster (static TRAINS dataset). No external
 * API, no keys. In production this is the seam where an approved
 * train-enquiry provider would be connected.
 */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const results = searchTrains(q);
    return NextResponse.json({
      query: q,
      count: results.length,
      results,
      disclaimer: "Prototype Data — demo railway operations dataset (Delhi NCR grid).",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
