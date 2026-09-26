import { NextResponse } from "next/server";
import { getDefectLifecycle } from "@/lib/engine/defectlifecycle";
import { ensureSeeded } from "@/lib/engine/seed";

export const dynamic = "force-dynamic";

/** GET /api/defects/:id — full lifecycle record: stage config, timeline, audit trail. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSeeded();
    const { id } = await params;
    const dto = await getDefectLifecycle(Number(id));
    if (!dto) return NextResponse.json({ error: "defect not found" }, { status: 404 });
    return NextResponse.json(dto);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
