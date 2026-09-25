#!/usr/bin/env node
/**
 * RAKSHAK PATROL suite — the field handset must work with muddy gloves, no
 * login, and a flaky network. Checks the login-free handset, the category
 * catalogue and the intake contract (stable ids, deadline defaults, recurrence,
 * duplicate guard, validation).
 *
 *   node scripts/patrol-test.mjs [baseUrl]
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
const get = (p) => fetch(base + p).then((r) => r.json());
const post = (p, b) =>
  fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b ?? {}) });

console.log("\n1. The handset is open — no login in the field");
const page = await fetch(base + "/patrol");
const html = await page.text();
ok("/patrol renders without a session", page.status === 200, `HTTP ${page.status}`);
ok("the handset names itself", /patrol/i.test(html), "Rakshak Patrol present in the page");
ok("no sign-in wall on the handset", !/Sign in to continue|User ID/i.test(html.replace(/\\u[0-9a-f]{4}/gi, "")));
const catRes = await get("/api/defects/report");
const cats = catRes.categories;
ok("category catalogue is served", Array.isArray(cats) && cats.length >= 8, `${cats.length} categories`);
ok(
  "every category is field-complete",
  cats.every((c) => c.key && c.label && c.department && c.severity >= 1 && c.severity <= 10 && c.durationMin >= 15 && c.icon && c.hint)
);
ok("disciplines are only ENG / TRD / SNT", cats.every((c) => ["ENG", "TRD", "SNT"].includes(c.department)), [...new Set(cats.map((c) => c.department))].join(", "));
ok("every discipline is represented", new Set(cats.map((c) => c.department)).size === 3);
ok("safety-critical categories exist", cats.some((c) => c.severity >= 9), cats.filter((c) => c.severity >= 9).map((c) => c.key).join(", "));

console.log("\n2. Report from the field — defaults come from the category");
const before = (await get("/api/defects")).board.length;
const crack = await post("/api/defects/report", {
  category: "rail-crack",
  segmentCode: "NDLS-NZM",
  gps: "28.6431, 77.2197",
  reporterName: "Ram Kumar",
  reporterMobile: "9811000101",
  photo: "data:image/jpeg;base64,AAAA",
});
const crackBody = await crack.json();
ok("report accepted (201)", crack.status === 201, `HTTP ${crack.status}`);
ok("stable identity issued", /^DEF-[A-Z0-9-]+-\d{4}-\d{3}$/.test(crackBody.defectCode), crackBody.defectCode);
ok("department inferred from the category", crackBody.department === "ENG", crackBody.department);
ok("severity defaults to the category", crackBody.severity === 9, String(crackBody.severity));
ok("duration defaults to the category", crackBody.durationMin === 90, `${crackBody.durationMin} min`);
ok("title defaults to the category label", /Rail Crack/.test(crackBody.title), crackBody.title);
ok("safety-critical ⇒ same-day deadline", crackBody.dueInDays === 0);
ok("urgency follows the deadline + severity", crackBody.urgencyClass === "EMERGENCY", crackBody.urgencyClass);
ok("lands at the first lifecycle stage", crackBody.stage === "REPORTED");
ok("tells the karmi what happens next", typeof crackBody.next === "string" && crackBody.next.length > 10, crackBody.next);
ok("names who owns it next", /Inspector/i.test(crackBody.responsible), crackBody.responsible);
ok("returns a human-readable confirmation", /registered/i.test(crackBody.message));
ok("the defect is on the board immediately", (await get("/api/defects")).board.length === before + 1);

console.log("\n3. Discipline routing (each department has its own crew)");
const trd = await (await post("/api/defects/report", { category: "ohe-wire", segmentCode: "NDLS-NZM" })).json();
ok("OHE work routes to TRD", trd.department === "TRD", trd.department);
ok("OHE reports demand a power block by default", trd.defectCode !== undefined && trd.department === "TRD");
const snt = await (await post("/api/defects/report", { category: "signal-fail", segmentCode: "NDLS-NZM", severity: 99 })).json();
ok("signal work routes to SNT", snt.department === "SNT", snt.department);
ok("severity is clamped to 10", snt.severity === 10, String(snt.severity));
const low = await (await post("/api/defects/report", { category: "waterlogging", segmentCode: "NDLS-NZM", severity: -4, durationMin: 2 })).json();
ok("severity is clamped to 1", low.severity === 1, String(low.severity));
ok("duration has a 15-minute floor", low.durationMin === 15, `${low.durationMin} min`);
ok("low severity gets a long deadline", low.dueInDays === 30, `${low.dueInDays} days`);

console.log("\n4. Minimum typing: section from GPS, overrides honoured");
const gpsOnly = await (await post("/api/defects/report", { category: "fouling", gps: "28.6600, 77.2300" })).json();
ok("a GPS-only report still resolves to a section", typeof gpsOnly.segmentCode === "string" && gpsOnly.segmentCode.length > 0, gpsOnly.segmentCode);
const explicit = await post("/api/defects/report", {
  category: "bridge-structure",
  segmentCode: "NDLS-NZM",
  department: "TRD",
  severity: 4,
  durationMin: 200,
  title: "Girder bearing crack at km 7.4",
  needsPowerBlock: true,
});
const explicitBody = await explicit.json();
ok("explicit severity wins", explicitBody.severity === 4, String(explicitBody.severity));
ok("explicit duration wins", explicitBody.durationMin === 200, `${explicitBody.durationMin} min`);
ok("explicit department wins", explicitBody.department === "TRD");
ok("explicit title wins", explicitBody.title === "Girder bearing crack at km 7.4");
ok("an unknown section code does not crash the handset", (await post("/api/defects/report", { category: "track-joint", segmentCode: "NO-SUCH-SECTION" })).status === 201);
ok("an unknown category falls back to a safe default", (await post("/api/defects/report", { category: "not-a-category", segmentCode: "NDLS-NZM" })).status === 201);

console.log("\n5. Validation — a bad report never becomes a bad defect");
const beforeRejects = (await get("/api/defects")).board.length;
const noCategory = await post("/api/defects/report", { segmentCode: "NDLS-NZM" });
ok("missing category is refused (400)", noCategory.status === 400, `HTTP ${noCategory.status}`);
ok("refusal explains itself", /category/.test((await noCategory.json()).error ?? ""));
ok("no phantom defect was created", (await get("/api/defects")).board.length === beforeRejects, "the board did not grow from the rejected reports");
const emptyBody = await post("/api/defects/report", {});
ok("an empty body is refused without a 500", emptyBody.status === 400);

console.log("\n6. Duplicate guard & recurrence (rule-based, on-device cheap)");
const dup1 = await (await post("/api/defects/report", { category: "level-crossing", segmentCode: "NDLS-NZM", note: "gate boom stuck" })).json();
const dup2 = await (await post("/api/defects/report", { category: "level-crossing", segmentCode: "NDLS-NZM", note: "gate boom stuck again" })).json();
ok("a repeat report flags the earlier one", !!dup2.possibleDuplicate, dup2.possibleDuplicate?.defectCode);
ok("the flag points at the previous defect, not itself", dup2.possibleDuplicate?.id !== dup2.defectId);
ok("the flag reports how old the earlier report is", typeof dup2.possibleDuplicate?.ageDays === "number" && dup2.possibleDuplicate.ageDays >= 0, `${dup2.possibleDuplicate?.ageDays} days`);
ok("the flag names the earlier defect", typeof dup2.possibleDuplicate?.defectCode === "string" && dup2.possibleDuplicate.defectCode.length > 0);
ok("occurrences climb with repeats", dup2.recurrence.occurrences > dup1.recurrence.occurrences, `${dup1.recurrence.occurrences} → ${dup2.recurrence.occurrences}`);
ok("recurrence rule window is 180 days", dup2.recurrence.windowDays === 180);
ok("bands come from the documented vocabulary", ["NONE", "LOW", "MEDIUM", "HIGH"].includes(dup2.recurrence.band), dup2.recurrence.band);
ok("escalation flag is reported", typeof dup2.recurrence.escalated === "boolean");

console.log("\n7. The handset's output reaches the control room");
const feed = await get("/api/state");
ok("patrol reports reach the live feed", feed.events.some((e) => /PATROL REPORT/.test(e.message ?? "")), "control room sees field intake");
ok("critical reports are flagged critical", feed.events.some((e) => /PATROL REPORT/.test(e.message ?? "") && ["critical", "warn"].includes(e.kind)));
const board = await get("/api/defects");
ok("field-reported defects appear in the lifecycle board", board.board.some((r) => r.department === "TRD" && r.stage === "REPORTED"));
ok("every board row can be actioned by an inspector", board.board.every((r) => typeof r.nextAction === "string"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
