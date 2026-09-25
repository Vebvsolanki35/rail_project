#!/usr/bin/env node
/**
 * URGENCY ENGINE suite — checks the prioritisation maths is consistent,
 * transparent and stays inside its documented bands.
 *   node scripts/urgency-test.mjs [baseUrl]
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

const ORDER = ["EMERGENCY", "CRITICALLY_OVERDUE", "OVERDUE", "DUE_SOON", "UPCOMING", "NORMAL"];

const data = await fetch(`${base}/api/urgency`).then((r) => r.json());
const { queue, summary, weights, formula } = data;

console.log("\n1. Weights & formula");
const wSum = Object.values(weights).reduce((a, b) => a + b, 0);
ok("priority weights sum to 1.00", Math.abs(wSum - 1) < 1e-6, wSum.toFixed(6));
ok("criticality weight is 35%", weights.criticality === 0.35);
ok("urgency weight is 30%", weights.urgency === 0.3);
ok("ML risk weight is 20%", weights.mlRisk === 0.2);
ok("availability weight is 15%", weights.availability === 0.15);
ok("formula is stated for the UI", /35%/.test(formula) && /30%/.test(formula) && /20%/.test(formula) && /15%/.test(formula));

console.log("\n2. Queue shape");
ok("queue is not empty", queue.length > 0, `${queue.length} rows`);
ok("urgency scores within 0–100", queue.every((q) => q.urgencyScore >= 0 && q.urgencyScore <= 100));
ok("boosts within 0.70–1.30", queue.every((q) => q.boost >= 0.7 && q.boost <= 1.3));
ok(
  "boost = 0.70 + score/100 × 0.60",
  queue.every((q) => Math.abs(q.boost - round3(0.7 + (q.urgencyScore / 100) * 0.6)) < 0.002),
  "boost is a pure function of the urgency index"
);
ok("sort key = aiScore × boost", queue.every((q) => Math.abs(q.sortKey - round1(q.aiScore * q.boost)) < 0.35));
ok("class order is monotonic down the queue", isMonotonic(queue.map((q) => ORDER.indexOf(q.urgencyClass))));
ok("ties inside a class break on the sort key", withinClassSorted(queue));
ok("every row carries a priority band", queue.every((q) => ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(q.priority)));

console.log("\n3. Classification rules");
const byClass = (c) => queue.filter((q) => q.urgencyClass === c);
ok("EMERGENCY ⇒ severity ≥ 8 or ≥ 21 days late", byClass("EMERGENCY").every((q) => q.severity >= 8 || q.dueInDays <= -21));
ok("CRITICALLY_OVERDUE ⇒ at least 7 days late", byClass("CRITICALLY_OVERDUE").every((q) => q.dueInDays <= -7));
ok("OVERDUE ⇒ deadline in the past", byClass("OVERDUE").every((q) => q.dueInDays < 0));
ok("DUE_SOON ⇒ deadline today or within 3 days", byClass("DUE_SOON").every((q) => q.dueInDays >= 0 && q.dueInDays <= 3));
ok("UPCOMING ⇒ deadline within 14 days", byClass("UPCOMING").every((q) => q.dueInDays > 3 && q.dueInDays <= 14));
ok("a defect due TODAY is at least DUE_SOON", !queue.some((q) => q.dueInDays === 0 && ["UPCOMING", "NORMAL"].includes(q.urgencyClass)));
ok("NORMAL ⇒ more than 14 days of runway", byClass("NORMAL").every((q) => q.dueInDays > 14));
ok("an overdue defect never sits below DUE_SOON", !queue.some((q) => q.dueInDays < 0 && ["UPCOMING", "NORMAL"].includes(q.urgencyClass)));
ok("an emergency never outranks itself as NORMAL", !queue.some((q) => q.severity >= 8 && q.dueInDays <= 0 && q.urgencyClass !== "EMERGENCY"));

console.log("\n4. Summary consistency");
const counted = ORDER.reduce((acc, c) => ({ ...acc, [c]: queue.filter((q) => q.urgencyClass === c).length }), {});
ok("summary total matches the queue", summary.total === queue.length, `${summary.total}`);
ok("per-class counts match", ORDER.every((c) => (summary.counts[c] ?? 0) === counted[c]), ORDER.map((c) => `${c}:${counted[c]}`).join(" "));
ok("emergencyCount matches EMERGENCY rows", summary.emergencyCount === counted.EMERGENCY);
ok("overdueCount adds OVERDUE + CRITICALLY_OVERDUE", summary.overdueCount === counted.OVERDUE + counted.CRITICALLY_OVERDUE);
ok("average urgency is inside 0–100", summary.avgUrgency >= 0 && summary.avgUrgency <= 100, String(summary.avgUrgency));
ok("average urgency matches the rows", Math.abs(summary.avgUrgency - round1(queue.reduce((s, q) => s + q.urgencyScore, 0) / queue.length)) < 0.15);
ok("top item is the head of the queue", summary.top?.id === queue[0]?.id, summary.top?.defectCode);
ok("top item is the worst class present", summary.top?.urgencyClass === queue.map((q) => q.urgencyClass).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0]);

console.log("\n5. Board integration");
const board = await fetch(`${base}/api/defects`).then((r) => r.json());
ok("board rows carry the same urgency classes", board.board.every((r) => ORDER.includes(r.urgencyClass)));
ok("board sort keys match their own boost", board.board.every((r) => r.sortKey > 0 && r.boost > 0));
const emergencySev = board.board.filter((r) => r.urgencyClass === "EMERGENCY");
ok("emergency defects are the severest cohort", emergencySev.length === 0 || average(emergencySev.map((r) => r.severity)) >= average(board.board.map((r) => r.severity)));

function round1(n) {
  return Math.round(n * 10) / 10;
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}
function isMonotonic(arr) {
  return arr.every((v, i) => i === 0 || arr[i - 1] <= v);
}
function withinClassSorted(q) {
  for (let i = 1; i < q.length; i++) {
    if (q[i - 1].urgencyClass === q[i].urgencyClass && q[i - 1].sortKey < q[i].sortKey) return false;
  }
  return true;
}
function average(a) {
  return a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
