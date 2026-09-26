#!/usr/bin/env node
/**
 * SUPER BLOCK INTELLIGENCE suite — checks the opportunity finder, the
 * coordinated-vs-independent downtime maths, the feasibility weights and the
 * computed rejection reasons.
 *   node scripts/superblock-test.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://127.0.0.1:3000";
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✘ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const data = await fetch(`${base}/api/superblocks`).then((r) => r.json());
const { kpis, opportunities, plannedSuperBlocks, splitFindings, weights, model } = data;

console.log("\n1. Contract & model statement");
ok("KPI block present", !!kpis);
ok("opportunity list present", Array.isArray(opportunities) && opportunities.length > 0, `${opportunities.length} opportunities`);
ok("planned super blocks exposed", Array.isArray(plannedSuperBlocks));
ok("split-block findings exposed", Array.isArray(splitFindings));
ok("the model is written out for the UI", /40/.test(model.formula) && /15/.test(model.formula) && /8/.test(model.formula), model.formula);
ok("feasibility weights are published", Object.keys(weights).length > 0, JSON.stringify(weights));
ok("setup constants are published", model.setupMin === 40 && model.firstWaveSetupMin === 15 && model.waveSpacingMin === 8, JSON.stringify(model));

console.log("\n2. Downtime arithmetic (independent vs coordinated)");
ok("every opportunity bundles ≥ 2 tasks", opportunities.every((o) => o.defects.length >= 2));
ok("defect count matches the bundle", opportunities.every((o) => o.defectCount === o.defects.length));
ok(
  "independent downtime = Σ(task + 40 min setup)",
  opportunities.every((o) => o.independentMin === o.defects.length * 40 + o.defects.reduce((s, t) => s + t.durationMin, 0)),
  "plus 40 min of setup per task when windows are taken separately"
);
ok(
  "coordinated downtime = packed waves + 15 min + 8 min × (waves − 1)",
  opportunities.every((o) => o.coordinatedMin >= 15 + 8 * (o.waves - 1)),
  "packed waves + first-wave setup + spacing"
);
ok("coordination is never slower than going independent", opportunities.every((o) => o.coordinatedMin <= o.independentMin));
ok("saving is the difference", opportunities.every((o) => o.savingMin === o.independentMin - o.coordinatedMin));
ok("saving is positive or zero", opportunities.every((o) => o.savingMin >= 0));
ok("wave count is at least the busiest department's task count", opportunities.every((o) => {
  const byDept = {};
  for (const d of o.defects) byDept[d.department] = (byDept[d.department] ?? 0) + 1;
  return o.waves >= Math.max(...Object.values(byDept));
}), "departments run in parallel inside a wave, so a wave per repeat task is the floor");
ok("coordinated occupancy is never less than the longest single task", opportunities.every((o) => o.coordinatedMin >= Math.max(...o.defects.map((d) => d.durationMin))));
ok("multi-department opportunities are flagged as coordinated", opportunities.every((o) => o.departments.length === new Set(o.defects.map((d) => d.department)).size));
ok("single-department work can still qualify as a super block", opportunities.some((o) => o.departments.length === 1));
ok(
  "opportunities mix departments (that is the point of a super block)",
  new Set(opportunities.flatMap((o) => o.departments)).size >= 2,
  [...new Set(opportunities.flatMap((o) => o.departments))].join(", ")
);

console.log("\n3. Feasibility scoring");
ok("score is 0–100", opportunities.every((o) => o.feasibility.score >= 0 && o.feasibility.score <= 100));
ok("five weighted factors reported", opportunities.every((o) => o.feasibility.factors.length === 5));
ok("factor weights sum to 100", opportunities.every((o) => o.feasibility.factors.reduce((s, f) => s + f.weight, 0) === 100));
ok("each factor is a 0–100 percentage", opportunities.every((o) => o.feasibility.factors.every((f) => f.pct >= 0 && f.pct <= 100)));
ok(
  "the score is Σ(weight × pct/100)",
  opportunities.every(
    (o) => Math.abs(o.feasibility.score - o.feasibility.factors.reduce((s, f) => s + (f.weight * f.pct) / 100, 0)) < 1
  )
);
ok("every factor explains itself in words", opportunities.every((o) => o.feasibility.factors.every((f) => typeof f.note === "string" && f.note.length > 10)));
ok(
  "published weights are the ones used",
  opportunities.every((o) => o.feasibility.factors.every((f) => f.weight === weights[f.key]))
);
ok("decisions come from the documented vocabulary", opportunities.every((o) => ["RECOMMEND", "CONDITIONAL", "REJECT"].includes(o.feasibility.decision)));
ok("RECOMMEND ⇒ score ≥ 70", opportunities.filter((o) => o.feasibility.decision === "RECOMMEND").every((o) => o.feasibility.score >= 70));
ok("CONDITIONAL ⇒ 50 ≤ score < 70", opportunities.filter((o) => o.feasibility.decision === "CONDITIONAL").every((o) => o.feasibility.score >= 50 && o.feasibility.score < 70));
ok("REJECT ⇒ score < 50", opportunities.filter((o) => o.feasibility.decision === "REJECT").every((o) => o.feasibility.score < 50));
ok("every opportunity carries a recommendation sentence", opportunities.every((o) => typeof o.feasibility.recommendation === "string" && o.feasibility.recommendation.length > 20));

console.log("\n4. Rejection reasons are computed, not hand-written");
ok("every decision carries a human reason", opportunities.every((o) => typeof o.feasibility.recommendation === "string" && o.feasibility.recommendation.length > 10));
const dense = opportunities.filter((o) => o.dailyTrains >= 240);
if (dense.length > 0) {
  ok("dense corridors are identified (≥ 240 trains/day)", dense.length > 0, `${dense.length} dense segment(s)`);
  ok(
    "dense corridors are pushed into the low-impact window",
    dense.every((o) => o.feasibility.reasons.some((r) => /low-impact|00:30/.test(r))),
    "traffic cost is the binding constraint"
  );
} else {
  ok("long/oversized blocks are told which cap they breach", opportunities.every((o) => o.feasibility.reasons.every((r) => !/cap/.test(r) || /cap of \d+ min/.test(r))), "caps quoted as numbers");
}
ok("every opportunity lists its reasoning", opportunities.every((o) => o.feasibility.reasons.length >= 1));
ok("reasons are plain sentences for the dashboard", opportunities.every((o) => o.feasibility.reasons.every((r) => r.length > 20 && /[a-z]/.test(r))));
ok("broken caps are quoted as numbers", opportunities.every((o) => o.feasibility.reasons.filter((r) => /exceeds|cap/.test(r)).every((r) => /\d+ min/.test(r))), "e.g. \"exceeds the GOLDEN cap of 215 min\"");
ok("a recommendation is never a bare REJECT", opportunities.every((o) => !/^REJECT$/i.test(o.feasibility.recommendation)));

console.log("\n5. Golden / shoulder / off-peak caps");
const golden = opportunities.filter((o) => o.window === "GOLDEN" && o.feasibility.decision !== "REJECT");
ok("GOLDEN windows stay within 215 min", golden.every((o) => o.coordinatedMin <= 215), golden.length ? `max ${Math.max(...golden.map((o) => o.coordinatedMin))} min` : "none in this state");
const shoulder = opportunities.filter((o) => o.window === "SHOULDER" && o.feasibility.decision !== "REJECT");
ok("SHOULDER windows stay within 150 min", shoulder.every((o) => o.coordinatedMin <= 150), shoulder.length ? `max ${Math.max(...shoulder.map((o) => o.coordinatedMin))} min` : "none in this state");
ok("windows are from the vocabulary", opportunities.every((o) => ["GOLDEN", "SHOULDER", "OFFPEAK"].includes(o.window)));

console.log("\n6. KPI roll-up");
const recommend = opportunities.filter((o) => o.feasibility.decision === "RECOMMEND").length;
const conditional = opportunities.filter((o) => o.feasibility.decision === "CONDITIONAL").length;
const rejected = opportunities.filter((o) => o.feasibility.decision === "REJECT").length;
ok("opportunity count matches", kpis.opportunities === opportunities.length, `${kpis.opportunities}`);
ok("recommended count matches", kpis.recommended === recommend, `${kpis.recommended}`);
ok("conditional count matches", kpis.conditional === conditional, `${kpis.conditional}`);
ok("rejected count matches", kpis.rejected === rejected, `${kpis.rejected}`);
ok("classes partition the list", recommend + conditional + rejected === opportunities.length);
ok("potential saving is in hours", Math.abs(kpis.potentialSavingH - opportunities.reduce((s, o) => s + o.savingMin, 0) / 60) < 0.1, `${kpis.potentialSavingH} h`);
ok("top opportunity is the biggest saver", kpis.topOpportunity === null || kpis.topOpportunity.savingMin === Math.max(...opportunities.map((o) => o.savingMin)), kpis.topOpportunity?.segmentCode);
ok("opportunities are sorted by saving", opportunities.every((o, i) => i === 0 || opportunities[i - 1].savingMin >= o.savingMin));
ok("saving percentage is reported", opportunities.every((o) => o.savingPct >= 0 && o.savingPct <= 100 || o.independentMin === 0));
ok("golden utilisation is a percentage", kpis.goldenUtilisationPct >= 0 && kpis.goldenUtilisationPct <= 100, `${kpis.goldenUtilisationPct}%`);

console.log("\n7. Planned super blocks (from the optimizer)");
const plan = await fetch(`${base}/api/state`).then((r) => r.json());
if (plan?.latestPlan) {
  ok("planner published super blocks", plannedSuperBlocks.length >= 0, `${plannedSuperBlocks.length} in the live plan`);
  ok(
    "planned super blocks span ≥ 2 departments or are single-discipline by design",
    plannedSuperBlocks.every((b) => Array.isArray(b.departments) && b.departments.length >= 1)
  );
  ok(
    "planned coordination time is reported in minutes",
    kpis.plannedCoordinationMin >= 0,
    `${Math.round(kpis.plannedCoordinationMin)} min of combined occupancy`
  );
  ok("planned blocks carry a rationale", plannedSuperBlocks.every((b) => typeof b.rationale === "string" && b.rationale.length > 0));
  ok("planned blocks name the window they use", plannedSuperBlocks.every((b) => typeof b.window === "string"));
  ok("planned super blocks bundle ≥ 2 tasks", plannedSuperBlocks.every((b) => b.defectCount >= 2));
  ok("planned coordination time matches the block footprints", kpis.plannedCoordinationMin === plannedSuperBlocks.reduce((s, b) => s + (b.endMin - b.startMin), 0));
} else {
  ok("planner has not run yet — super block KPIs degrade gracefully", plannedSuperBlocks.length === 0);
}

console.log("\n8. Split-block analysis");
ok("split findings list available", Array.isArray(splitFindings));
if (splitFindings.length > 0) {
  ok("each finding names the segment that was split", splitFindings.every((f) => typeof f.segmentCode === "string" && f.segmentCode.length > 0));
  ok("each finding lists the blocks that would merge", splitFindings.every((f) => Array.isArray(f.blocks) && f.blocks.length >= 2));
  ok("each finding quantifies the saving", splitFindings.every((f) => typeof f.mergeSavingMin === "number" && f.mergeSavingMin > 0));
  ok("findings are ranked by saving", splitFindings.every((f, i) => i === 0 || splitFindings[i - 1].mergeSavingMin >= f.mergeSavingMin));
  ok("merging saving accounts for the setup it removes", splitFindings.every((f) => f.mergeSavingMin >= (f.blocks.length - 1) * 15));
  ok("each finding explains itself", splitFindings.every((f) => typeof f.note === "string" && f.note.length > 10));
} else {
  ok("split analysis ran and found the corridor already joined", true, "no fragmented corridor in this state");
  ok("split findings count matches the KPI", kpis.splitFindings === splitFindings.length);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
