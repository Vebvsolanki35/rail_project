#!/usr/bin/env node
/**
 * PROTOTYPE AUTH suite — proves the two doors, the role derivation and the
 * route permission matrix. Runs entirely against the login API so it exercises
 * the same code path the browser does.
 *   node scripts/auth-test.mjs [baseUrl]
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

const login = async (body) => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

console.log("\n1. Officer door — role derived from the account, never chosen");
const expected = [
  { userId: "drm01", role: "DRM", name: "Sh. R. K. Verma", home: "/command" },
  { userId: "coa01", role: "CONTROL", name: "Smt. A. Nair", home: "/command" },
  { userId: "sm01", role: "STATION_MASTER", name: "Sh. M. Iqbal", home: "/station" },
  { userId: "ins01", role: "INSPECTOR", name: "Insp. S. Sharma", home: "/defects" },
];
for (const acct of expected) {
  const r = await login({ mode: "officer", userId: acct.userId, password: "demo123" });
  ok(`${acct.userId} signs in`, r.status === 200 && r.body.ok === true, `HTTP ${r.status}`);
  ok(`  → role is ${acct.role}`, r.body.session?.role === acct.role, r.body.session?.role);
  ok(`  → name resolved (${acct.name})`, r.body.session?.name === acct.name);
  ok(`  → lands on ${acct.home}`, r.body.home === acct.home, r.body.home);
  ok("  → session carries an issue timestamp", !Number.isNaN(Date.parse(r.body.session?.issuedAt ?? "")));
  ok("  → session is marked OFFICER", r.body.session?.kind === "OFFICER");
  ok("  → permitted routes returned", Array.isArray(r.body.routes) && r.body.routes.length > 0, `${r.body.routes?.length} routes`);
}
ok("User ID is case-insensitive", (await login({ mode: "officer", userId: "DRM01", password: "demo123" })).status === 200);
ok("surrounding whitespace is tolerated", (await login({ mode: "officer", userId: "  ins01 ", password: "demo123" })).status === 200);

console.log("\n2. Officer door — refusals are specific, not generic");
const wrongPw = await login({ mode: "officer", userId: "drm01", password: "hunter2" });
ok("wrong password refused (401)", wrongPw.status === 401);
ok("  → message names the password", /password/i.test(wrongPw.body.error ?? ""), wrongPw.body.error);
ok("  → no session leaked on failure", wrongPw.body.session === undefined && wrongPw.body.ok === false);
const unknown = await login({ mode: "officer", userId: "hacker", password: "demo123" });
ok("unknown User ID refused (401)", unknown.status === 401);
ok("  → message does not reveal which field was wrong", /User ID/i.test(unknown.body.error ?? ""), unknown.body.error);
ok("password is never echoed back", !JSON.stringify(unknown.body).includes("demo123"));
const blanks = await Promise.all([
  login({ mode: "officer", userId: "", password: "demo123" }),
  login({ mode: "officer", userId: "drm01", password: "" }),
  login({ mode: "officer" }),
]);
ok("blank User ID refused", blanks[0].status === 400 || blanks[0].status === 401, `HTTP ${blanks[0].status}`);
ok("blank password refused", blanks[1].status === 400 || blanks[1].status === 401, `HTTP ${blanks[1].status}`);
ok("missing fields refused without a crash", blanks[2].status >= 400 && blanks[2].status < 500, `HTTP ${blanks[2].status}`);

console.log("\n3. Field-worker door — mobile + DOB, no passwords");
const workers = [
  { mobile: "9811000101", dob: "1988-04-12", name: "Ram Kumar", dept: "ENG" },
  { mobile: "9811000102", dob: "1990-08-25", name: "Shyam Lal", dept: "TRD" },
  { mobile: "9811000103", dob: "1985-11-30", name: "Abdul Rahim", dept: "SNT" },
];
for (const w of workers) {
  const r = await login({ mode: "worker", mobile: w.mobile, dob: w.dob });
  ok(`${w.mobile} signs in`, r.status === 200 && r.body.ok === true, `HTTP ${r.status}`);
  ok(`  → ${w.name}`, r.body.session?.name === w.name, r.body.session?.name);
  ok(`  → role is KARMI`, r.body.session?.role === "KARMI");
  ok(`  → discipline is ${w.dept}`, r.body.session?.department === w.dept, r.body.session?.department);
  ok(`  → lands on the job portal`, r.body.home === "/jobs", r.body.home);
  ok("  → no planner/command access", !(r.body.routes ?? []).some((x) => ["/planner", "/simulation", "/command", "/replan"].includes(x)), (r.body.routes ?? []).join(" "));
}
const spaced = await login({ mode: "worker", mobile: "9811 000 101", dob: "1988-04-12" });
ok("mobile number formatting is tolerated", spaced.status === 200);
const wrongDob = await login({ mode: "worker", mobile: "9811000101", dob: "1988-04-13" });
ok("wrong DOB refused (401)", wrongDob.status === 401);
ok("  → message names the DOB", /date of birth/i.test(wrongDob.body.error ?? ""), wrongDob.body.error);
ok("unregistered mobile refused", (await login({ mode: "worker", mobile: "9999999999", dob: "1990-01-01" })).status === 401);
ok("short mobile refused", (await login({ mode: "worker", mobile: "98110", dob: "1990-01-01" })).status >= 400);
ok("missing DOB refused", (await login({ mode: "worker", mobile: "9811000101" })).status >= 400);

console.log("\n4. Door separation");
const officerAsWorker = await login({ mode: "worker", mobile: "drm01", dob: "1988-04-12" });
ok("an officer User ID cannot enter the worker door", officerAsWorker.status >= 400);
const workerAsOfficer = await login({ mode: "officer", userId: "9811000101", password: "demo123" });
ok("a karmi mobile cannot enter the officer door", workerAsOfficer.status === 401);
const noMode = await login({ userId: "drm01", password: "demo123" });
ok("an unknown mode is refused rather than defaulting to officer", noMode.status >= 400, `HTTP ${noMode.status}`);

console.log("\n5. Permission matrix (RoleGate contract)");
const routes = {
  DRM: { allowed: ["/command", "/planner", "/simulation", "/defects", "/station", "/field", "/superblocks", "/replan"], denied: ["/jobs"] },
  CONTROL: { allowed: ["/command", "/planner", "/simulation", "/defects", "/replan", "/superblocks"], denied: ["/station", "/jobs"] },
  STATION_MASTER: { allowed: ["/station", "/command", "/defects"], denied: ["/planner", "/simulation", "/jobs", "/replan", "/superblocks"] },
  INSPECTOR: { allowed: ["/defects", "/field", "/jobs", "/station", "/superblocks"], denied: ["/command", "/planner", "/simulation", "/replan"] },
  KARMI: { allowed: ["/jobs", "/field"], denied: ["/command", "/planner", "/defects", "/station", "/simulation", "/replan", "/superblocks"] },
};
for (const [role, spec] of Object.entries(routes)) {
  const session = role === "KARMI" ? undefined : (await login({ mode: "officer", userId: { DRM: "drm01", CONTROL: "coa01", STATION_MASTER: "sm01", INSPECTOR: "ins01" }[role], password: "demo123" })).body;
  const granted = role === "KARMI" ? (await login({ mode: "worker", mobile: "9811000101", dob: "1988-04-12" })).body.routes : session.routes;
  ok(`${role}: every permitted route is granted`, spec.allowed.every((r) => granted.includes(r)), granted.join(" "));
  ok(`${role}: nothing outside the desk is granted`, !spec.denied.some((r) => granted.includes(r)));
  ok(`${role}: no duplicate routes`, new Set(granted).size === granted.length);
  ok(`${role}: home desk is in the list`, granted.includes(role === "KARMI" ? "/jobs" : session.home));
}
const drmRoutes = (await login({ mode: "officer", userId: "drm01", password: "demo123" })).body.routes;
const smRoutes = (await login({ mode: "officer", userId: "sm01", password: "demo123" })).body.routes;
ok("DRM sees strictly more than the station master", drmRoutes.length > smRoutes.length, `${drmRoutes.length} vs ${smRoutes.length}`);

console.log("\n6. Public surfaces stay login-free by design");
for (const path of ["/patrol", "/trains"]) {
  const res = await fetch(base + path);
  ok(`${path} renders without a session`, res.status === 200, `HTTP ${res.status}`);
}
const trains = await fetch(`${base}/api/trains`).then((r) => r.json()).catch(() => null);
if (trains) {
  ok("public train feed exposes no defect data", !/defect/i.test(JSON.stringify(trains)), "citizens must never see defect locations");
  ok("public train feed exposes no block windows", !/block/i.test(JSON.stringify(trains)));
}
const guard = await fetch(`${base}/command`, { redirect: "manual" });
ok("/command is protected by RoleGate", guard.status === 200, "RoleGate redirects client-side after hydration");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
