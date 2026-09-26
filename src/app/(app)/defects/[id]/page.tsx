import { notFound } from "next/navigation";
import RoleGate from "@/components/RoleGate";
import DefectDetailClient from "@/components/DefectDetailClient";
import { getDefectLifecycle } from "@/lib/engine/defectlifecycle";

export const dynamic = "force-dynamic";

export default async function DefectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) notFound();
  const defect = await getDefectLifecycle(numeric);
  if (!defect) notFound();

  return (
    <RoleGate title={`Defect ${defect.defectCode}`}>
      <DefectDetailClient defect={defect} />
    </RoleGate>
  );
}
