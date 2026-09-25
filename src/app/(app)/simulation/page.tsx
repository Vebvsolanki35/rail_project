import { getDashboardState } from "@/lib/engine/state";
import PageHeader from "@/components/PageHeader";
import WhatIfLab from "@/components/WhatIfLab";
import CrisisConsole from "@/components/CrisisConsole";

export const dynamic = "force-dynamic";

export default async function SimulationPage() {
  const state = await getDashboardState();
  return (
    <div className="anim-rise space-y-3">
      <PageHeader
        module="AIP-SIM"
        title="What-If Simulation"
        titleKey="page.simulation"
        subtitleKey="page.simulation.sub"
        subtitle="Test a decision before it reaches the line: cascade a delay or a failure through the live network, compare interventions, and see what the control office would have to absorb. Results are model estimates from the engine, not predictions of record."
        crumbs={[{ label: "AI Planning" }, { label: "What-If Simulation" }]}
        state={state.settings.fogMode ? "Fog mode active — physical work withheld" : "Nominal operating conditions"}
        stateTone={state.settings.fogMode ? "warning" : "success"}
        reference={`${state.segments.length} sections · ${state.stations.length} stations in the test rig`}
      />

      <WhatIfLab stations={state.stations} segments={state.segments} fog={state.settings.fogMode} />
      <CrisisConsole />
    </div>
  );
}
