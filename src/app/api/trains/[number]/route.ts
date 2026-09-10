import { NextResponse } from "next/server";
import { getTrainJourney } from "@/lib/engine/citizen";

export const dynamic = "force-dynamic";

/**
 * Citizen journey detail — GET /api/trains/<number>
 * Assembles status, route timeline and the maintenance-impact classification
 * from existing Rail Rakshak planning data (jobs, plan blocks, defects).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ number: string }> }) {
  try {
    const { number } = await ctx.params;
    const journey = await getTrainJourney(decodeURIComponent(number));
    if (!journey) {
      return NextResponse.json(
        { error: "not_found", message: "No train found in the current prototype dataset." },
        { status: 404 }
      );
    }
    return NextResponse.json(journey);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
