/**
 * PROTOTYPE AUTHENTICATION — Rail Rakshak (SIH 2026 · PS #26027)
 *
 * Two clearly separated doors, because the field reality is two different kinds
 * of user:
 *
 *   1. OFFICER — User ID + password. The ROLE IS DERIVED FROM THE ACCOUNT, never
 *      chosen by the user (a station master cannot click into the DRM desk):
 *      drm01 → DRM · coa01 → CONTROL ROOM · sm01 → STATION MASTER · ins01 → INSPECTOR
 *
 *   2. FIELD WORKER — mobile number + date of birth (no passwords in the field).
 *      Known numbers map to a named karmi and their discipline.
 *
 * The session is held in localStorage for the prototype and every route is
 * guarded by RoleGate against ROLE_ROUTES. Patrollers (/patrol) and citizens
 * (/trains) intentionally need no login.
 *
 * SECURITY NOTE (prototype honesty): credentials live in this module and the
 * session is client-side. A production deployment would authenticate against the
 * divisional IAM/LDAP service and sign a server session — see README.
 */

export type OfficerRole = "DRM" | "CONTROL" | "STATION_MASTER" | "INSPECTOR";
export type WorkerRole = "KARMI";
export type AppRole = OfficerRole | WorkerRole;
export type Dept = "ENG" | "TRD" | "SNT";

export interface OfficerAccount {
  userId: string;
  password: string;
  name: string;
  role: OfficerRole;
  designation: string;
  unit: string;
  headquarters: string;
}

/**
 * Pre-authorised evaluation accounts (SIH demo). Password is shared for the
 * prototype: `demo123`. Role is auto-detected from the User ID.
 */
export const OFFICER_ACCOUNTS: OfficerAccount[] = [
  {
    userId: "drm01",
    password: "demo123",
    name: "Sh. R. K. Verma",
    role: "DRM",
    designation: "Divisional Railway Manager",
    unit: "Delhi Division · Northern Railway",
    headquarters: "DRM Office, State Entry Road, NDLS",
  },
  {
    userId: "coa01",
    password: "demo123",
    name: "Smt. A. Nair",
    role: "CONTROL",
    designation: "Section Controller (COA)",
    unit: "Divisional Control Office",
    headquarters: "Control Room, NDLS",
  },
  {
    userId: "sm01",
    password: "demo123",
    name: "Sh. M. Iqbal",
    role: "STATION_MASTER",
    designation: "Station Master",
    unit: "New Delhi (NDLS)",
    headquarters: "Station Master's Office, NDLS",
  },
  {
    userId: "ins01",
    password: "demo123",
    name: "Insp. S. Sharma",
    role: "INSPECTOR",
    designation: "SSE/P.Way (Section Inspector)",
    unit: "NDLS–GZB Beat",
    headquarters: "SSE/P.Way Office, NDLS-I",
  },
];

export interface WorkerAccount {
  mobile: string;
  dob: string; // YYYY-MM-DD
  name: string;
  role: WorkerRole;
  department: Dept;
  designation: string;
  gang: string;
}

/** Field karmis — mobile + DOB, no password (gloves, sunlight, no typing). */
export const WORKER_ACCOUNTS: WorkerAccount[] = [
  { mobile: "9811000101", dob: "1988-04-12", name: "Ram Kumar", role: "KARMI", department: "ENG", designation: "Gangman (P.Way)", gang: "Gang 14 · NDLS-I" },
  { mobile: "9811000102", dob: "1990-08-25", name: "Shyam Lal", role: "KARMI", department: "TRD", designation: "Karmi (OHE)", gang: "OHE Party · Tughlakabad" },
  { mobile: "9811000103", dob: "1985-11-30", name: "Abdul Rahim", role: "KARMI", department: "SNT", designation: "Karmi (Signal)", gang: "Signal Party · NDLS" },
];

export interface Session {
  kind: "OFFICER" | "WORKER";
  userId: string; // officer user id, or worker mobile
  name: string;
  role: AppRole;
  designation: string;
  unit: string;
  department?: Dept; // workers (and inspectors) carry a discipline
  issuedAt: string;
}

export const SESSION_KEY = "railrakshak.session";
const LEGACY_ROLE_KEY = "railrakshak.role";

/* ------------------------------------------------------------------ */
/*  Authentication                                                     */
/* ------------------------------------------------------------------ */

export type AuthResult = { ok: true; session: Session } | { ok: false; error: string };

export function authenticateOfficer(userId: string, password: string): AuthResult {
  const id = userId.trim().toLowerCase();
  if (!id) return { ok: false, error: "Enter your User ID." };
  if (!password) return { ok: false, error: "Enter your password." };
  const account = OFFICER_ACCOUNTS.find((a) => a.userId === id);
  if (!account) return { ok: false, error: "Unknown User ID. Use one of the pre-authorised evaluation accounts." };
  if (account.password !== password) return { ok: false, error: "Incorrect password for this User ID." };
  return {
    ok: true,
    session: {
      kind: "OFFICER",
      userId: account.userId,
      name: account.name,
      role: account.role,
      designation: account.designation,
      unit: account.unit,
      department: account.role === "INSPECTOR" ? "ENG" : undefined,
      issuedAt: new Date().toISOString(),
    },
  };
}

export function authenticateWorker(mobile: string, dob: string): AuthResult {
  const m = mobile.replace(/\D/g, "");
  if (m.length !== 10) return { ok: false, error: "Enter the 10-digit mobile number registered with the gang." };
  if (!dob) return { ok: false, error: "Enter your date of birth." };
  const account = WORKER_ACCOUNTS.find((a) => a.mobile === m);
  if (!account) return { ok: false, error: "This mobile number is not registered. Contact your Section Inspector." };
  if (account.dob !== dob) return { ok: false, error: "Date of birth does not match our records." };
  return {
    ok: true,
    session: {
      kind: "WORKER",
      userId: account.mobile,
      name: account.name,
      role: account.role,
      designation: account.designation,
      unit: account.gang,
      department: account.department,
      issuedAt: new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Session storage (localStorage, prototype)                          */
/* ------------------------------------------------------------------ */

let cachedRaw: string | null | undefined;
let cachedSession: Session | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSession = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cachedSession = null;
    }
  }
  return cachedSession;
}

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("rr-session"));
  // Legacy components still listen on the old channel.
  window.dispatchEvent(new Event("rr-role"));
}

export function setSession(session: Session) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.localStorage.removeItem(LEGACY_ROLE_KEY);
  } catch {
    /* storage disabled — session stays in memory for this tab */
  }
  cachedRaw = undefined;
  cachedSession = null;
  notify();
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(LEGACY_ROLE_KEY);
  } catch {
    /* ignore */
  }
  cachedRaw = undefined;
  cachedSession = null;
  notify();
}

export function subscribeSession(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("rr-session", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("rr-session", cb);
    window.removeEventListener("storage", cb);
  };
}

/* ------------------------------------------------------------------ */
/*  Role → home desk and permitted routes                              */
/* ------------------------------------------------------------------ */

/** Where each role lands after login — the desk they actually work at. */
export const ROLE_HOME: Record<AppRole, string> = {
  DRM: "/command",
  CONTROL: "/command",
  STATION_MASTER: "/station",
  INSPECTOR: "/defects",
  KARMI: "/jobs",
};

/**
 * Route allow-list per role. Anything not listed is refused by RoleGate with an
 * explicit explanation (never a blank page).
 */
export const ROLE_ROUTES: Record<AppRole, string[]> = {
  DRM: [
    "/command",
    "/network",
    "/planner",
    "/simulation",
    "/defects",
    "/station",
    "/field",
    "/superblocks",
    "/compare",
    "/replan",
    "/safety",
    "/audit",
    "/admin",
    /* feature expansion — SIH26027 desks */
    "/data",
    "/forecast",
    "/blocks",
    "/shadow",
    "/conflicts",
    "/resources",
    "/approvals",
    "/analytics",
    "/data-quality",
    "/alerts",
  ],
  CONTROL: [
    "/command",
    "/network",
    "/planner",
    "/simulation",
    "/defects",
    "/compare",
    "/replan",
    "/superblocks",
    "/safety",
    "/audit",
    "/data",
    "/forecast",
    "/blocks",
    "/shadow",
    "/conflicts",
    "/resources",
    "/approvals",
    "/analytics",
    "/data-quality",
    "/alerts",
  ],
  STATION_MASTER: ["/station", "/command", "/network", "/defects", "/safety", "/forecast", "/blocks", "/alerts"],
  INSPECTOR: ["/defects", "/field", "/jobs", "/station", "/superblocks", "/compare", "/safety", "/network", "/data", "/forecast", "/blocks", "/shadow", "/approvals", "/analytics", "/data-quality", "/alerts"],
  KARMI: ["/jobs", "/field", "/safety", "/alerts"],
};

/** Login-free surfaces: the patroller handset and the citizen train view. */
export const PUBLIC_ROUTES = ["/login", "/patrol", "/trains", "/"];

export function canAccess(role: AppRole | null | undefined, pathname: string): boolean {
  if (!role) return false;
  if (PUBLIC_ROUTES.some((p) => pathname === p)) return true;
  return ROLE_ROUTES[role].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function roleHome(role: AppRole | null | undefined): string {
  if (!role) return "/login";
  return ROLE_HOME[role];
}

export const ROLE_LABEL: Record<AppRole, string> = {
  DRM: "DRM / Admin",
  CONTROL: "Control Room / COA",
  STATION_MASTER: "Station Master",
  INSPECTOR: "Section Inspector",
  KARMI: "Maintenance Karmi",
};

export function roleSubtitle(session: Session | null): string {
  if (!session) return "Not signed in";
  const dept = session.department ? ` · ${DEPT_LABEL[session.department].split(" — ")[0]}` : "";
  return `${session.designation} — ${session.unit}${dept}`;
}

export const DEPT_LABEL: Record<Dept, string> = {
  ENG: "ENG Karmi — Track Division (TMS)",
  TRD: "TRD Karmi — Traction/OHE (TDMS)",
  SNT: "SNT Karmi — Signal & Telecom (SMMS)",
};

export const DEMO_PASSWORD = "demo123";
