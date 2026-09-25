import { NextResponse } from "next/server";
import { generateSafetyOrder } from "@/lib/engine/simulate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { blockItemId?: number };
    const blockItemId = Number(body.blockItemId);
    if (!Number.isFinite(blockItemId))
      return NextResponse.json({ error: "blockItemId is required — issue the order for a block of the current plan" }, { status: 400 });
    const result = await generateSafetyOrder(blockItemId);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: /not found/.test(message) ? 404 : 500 });
  }
}
