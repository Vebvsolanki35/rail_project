"use client";

/**
 * COMPATIBILITY LAYER over `@/lib/auth`.
 *
 * The first prototype slice had a pick-a-desk role switch (`getRole`/`setRole`)
 * with four roles. The real authentication module now owns the session, adds the
 * STATION MASTER desk and derives the role from the account. These exports keep
 * the older components (Sidebar, TopBar, CommandClient, JobsClient,
 * PlannerClient) working without a rewrite, and map the new roles onto the four
 * legacy ones where a component only understands four.
 */
import {
  DEPT_LABEL as AUTH_DEPT_LABEL,
  ROLE_LABEL,
  type AppRole,
  type Dept,
  type Session,
  clearSession,
  getSession,
  setSession,
  subscribeSession,
} from "./auth";
import { useSession as useAuthSession } from "./useSession";
import { useSyncExternalStore } from "react";

/** Legacy role union (the older components' vocabulary). */
export type Role = "DRM" | "CONTROL" | "INSPECTOR" | "KARMI";

export interface RoleInfo {
  role: Role;
  dept?: Dept;
}

export { DEPT_LABEL } from "./auth";
export type { Dept } from "./auth";
export { ROLE_LABEL, DEPT_LABEL as DEPT_LABEL_FULL } from "./auth";

/** Station Master is an operational desk: legacy UI groups it with Control. */
export function toLegacyRole(role: AppRole): Role {
  return role === "STATION_MASTER" ? "CONTROL" : role;
}

export function toLegacyInfo(session: Session | null): RoleInfo | null {
  if (!session) return null;
  return { role: toLegacyRole(session.role), dept: session.department };
}

export function getRole(): RoleInfo | null {
  return toLegacyInfo(getSession());
}

/**
 * Legacy setter. The desk selector on /login used to call this directly; now a
 * role can only be assumed for a real account, so it signs in the matching
 * pre-authorised demo account (worker accounts for KARMI).
 */
export function setRole(info: RoleInfo) {
  const byRole: Record<Role, { userId: string; kind: "OFFICER" | "WORKER" }> = {
    DRM: { userId: "drm01", kind: "OFFICER" },
    CONTROL: { userId: "coa01", kind: "OFFICER" },
    INSPECTOR: { userId: "ins01", kind: "OFFICER" },
    KARMI: { userId: info.dept === "TRD" ? "9811000102" : info.dept === "SNT" ? "9811000103" : "9811000101", kind: "WORKER" },
  };
  const target = byRole[info.role];
  // Resolve the demo account through the same authenticator the login page uses.
  void import("./auth").then(({ authenticateOfficer, authenticateWorker, OFFICER_ACCOUNTS, WORKER_ACCOUNTS, DEMO_PASSWORD }) => {
    if (target.kind === "OFFICER") {
      const account = OFFICER_ACCOUNTS.find((a) => a.userId === target.userId);
      if (!account) return;
      const res = authenticateOfficer(account.userId, DEMO_PASSWORD);
      if (res.ok) setSession(res.session);
    } else {
      const worker = WORKER_ACCOUNTS.find((w) => w.mobile === target.userId);
      if (!worker) return;
      const res = authenticateWorker(worker.mobile, worker.dob);
      if (res.ok) setSession(res.session);
    }
  });
}

export function clearRole() {
  clearSession();
}

export function useRoleSync(cb: () => void) {
  if (typeof window !== "undefined") {
    window.addEventListener("rr-role", cb);
    return () => window.removeEventListener("rr-role", cb);
  }
  return () => {};
}

/** Reactive session for client components (client-only hook module). */
export { useSession } from "./useSession";

/** Reactive legacy role info. */
export function useRole(): RoleInfo | null {
  const session = useAuthSession();
  return toLegacyInfo(session);
}

export const ROLE_META: Record<Role, { label: string; badge: string; color: string; dest: string; icon: string }> = {
  DRM: { label: ROLE_LABEL.DRM, badge: "DRM — Strategic Override Active", color: "#ff4d4f", dest: "/command", icon: "shield" },
  CONTROL: { label: ROLE_LABEL.CONTROL, badge: "Control Room — Live Operations", color: "#34d399", dest: "/command", icon: "radio" },
  INSPECTOR: { label: ROLE_LABEL.INSPECTOR, badge: "Inspector — Zone: NDLS Beat (SSE/P.Way)", color: "#f5a524", dest: "/defects", icon: "hardhat" },
  KARMI: { label: ROLE_LABEL.KARMI, badge: "Karmi — Field Crew", color: "#a78bfa", dest: "/jobs", icon: "wrench" },
};

/** Department labels (legacy shape kept for older imports). */
export const LEGACY_DEPT_LABEL = AUTH_DEPT_LABEL;
