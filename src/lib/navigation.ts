/**
 * RAIL RAKSHAK — NAVIGATION MODEL (single source of truth for the shell).
 *
 * Grouped railway-department navigation. Every entry points at a REAL route
 * that exists in the app, and the `roles` list is a strict subset of the
 * `ROLE_ROUTES` allow-list in `src/lib/auth.ts` — so the navigation can never
 * offer a desk that RoleGate would refuse.
 *
 * Consumed by: components/Sidebar.tsx (desktop), components/MobileNav.tsx
 * (tablet/phone drawer), components/PortalHeader.tsx (help panel) and the
 * landing page module directory (app/page.tsx).
 */
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Database,
  Layers,
  Building2,
  CalendarCog,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileSearch,
  FlaskConical,
  GitBranch,
  HardHat,
  LayoutGrid,
  Network,
  Radar,
  Radio,
  Scale,
  ShieldCheck,
  TrainFront,
  Users,
  Wrench,
} from "lucide-react";
import type { AppRole } from "./auth";

export type NavItem = {
  href: string;
  /** i18n key in src/lib/translations.ts (falls back to the literal below). */
  labelKey?: string;
  /** Always-present literal name — used by the mobile drawer and breadcrumbs. */
  label: string;
  hint?: string;
  icon: typeof Radar;
  roles: AppRole[];
  /** Operational reference badge, e.g. counts surfaced from the dashboard. */
  badgeKey?: "criticalAlerts" | "pendingApprovals" | "openDefects";
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const ALL: AppRole[] = ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR", "KARMI"];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    items: [
      { href: "/command", label: "Command Centre", labelKey: "nav.command", hint: "Divisional control dashboard", icon: LayoutGrid, roles: ["DRM", "CONTROL", "STATION_MASTER"], badgeKey: "criticalAlerts" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/network", label: "Network Status", labelKey: "nav.network", hint: "Sections, occupancy & conflict detection", icon: Network, roles: ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR"] },
      { href: "/station", label: "Station Desk", labelKey: "nav.station", hint: "Station-level blocks & reports", icon: Building2, roles: ["DRM", "STATION_MASTER", "INSPECTOR"] },
      { href: "/replan", label: "Dynamic Re-Planning", labelKey: "nav.replan", hint: "Live event → new plan version", icon: GitBranch, roles: ["DRM", "CONTROL"] },
      { href: "/forecast", label: "Goods Train Forecast", labelKey: "nav.forecast", hint: "Freight demand the optimizer obeys", icon: Boxes, roles: ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR"] },
      { href: "/alerts", label: "Alert Centre", labelKey: "nav.alerts", hint: "Risk, demand & feed alerts", icon: Radar, roles: ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR", "KARMI"], badgeKey: "criticalAlerts" },
    ],
  },
  {
    id: "planning",
    label: "AI Planning",
    items: [
      { href: "/planner", label: "AI Block Planner", labelKey: "nav.planner", hint: "Optimiser, Gantt & approvals", icon: CalendarCog, roles: ["DRM", "CONTROL"], badgeKey: "pendingApprovals" },
      { href: "/superblocks", label: "Super Block Intelligence", labelKey: "nav.superblocks", hint: "Bundling opportunities & feasibility", icon: BarChart3, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/compare", label: "Plan Comparison", labelKey: "nav.compare", hint: "Safety-first vs traffic-first strategies", icon: Scale, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/simulation", label: "What-If Simulation", labelKey: "nav.simulation", hint: "Cascade lab & crisis console", icon: FlaskConical, roles: ["DRM", "CONTROL"] },
      { href: "/blocks", label: "Block Request Exchange", labelKey: "nav.blocks", hint: "Departmental demands → one possession", icon: ClipboardCheck, roles: ["DRM", "CONTROL", "INSPECTOR", "STATION_MASTER"] },
      { href: "/shadow", label: "Shadow Block Intelligence", labelKey: "nav.shadow", hint: "Combined possessions & time saved", icon: Layers, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/conflicts", label: "Conflict Resolution Centre", labelKey: "nav.conflicts", hint: "Traffic conflicts & feasible options", icon: AlertTriangle, roles: ["DRM", "CONTROL"], badgeKey: "criticalAlerts" },
      { href: "/resources", label: "Crew & Machine Resources", labelKey: "nav.resources", hint: "Capacity the solver cannot exceed", icon: HardHat, roles: ["DRM", "CONTROL"] },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    items: [
      { href: "/defects", label: "Defect Management", labelKey: "nav.defects", hint: "Eleven-stage lifecycle board", icon: ClipboardList, roles: ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR"], badgeKey: "openDefects" },
      { href: "/jobs", label: "Work Orders & Jobs", labelKey: "nav.jobs", hint: "Permit-to-work execution", icon: Wrench, roles: ["KARMI", "INSPECTOR"] },
      { href: "/field", label: "Field Dashboard", labelKey: "nav.field", hint: "Inspector beat operations", icon: HardHat, roles: ["DRM", "INSPECTOR", "KARMI"] },
    ],
  },
  {
    id: "field",
    label: "Field Operations",
    items: [
      { href: "/patrol", label: "Patrol Reporting", labelKey: "nav.patrol", hint: "Login-free gangman handset", icon: Radio, roles: ALL },
      { href: "/safety", label: "Safety & Permits", labelKey: "nav.safety", hint: "Permit-to-work, checklists, audit", icon: ShieldCheck, roles: ["DRM", "CONTROL", "INSPECTOR", "STATION_MASTER"] },
    ],
  },
  {
    id: "passenger",
    label: "Passenger",
    items: [
      { href: "/trains", label: "Citizen Train View", labelKey: "nav.trains", hint: "Public journey & impact status", icon: TrainFront, roles: ALL },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { href: "/approvals", label: "Approval Workflow & Authorizations", labelKey: "nav.approvals", hint: "Technical → Controller → DRM → block authority", icon: FileCheck2, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/analytics", label: "Asset Availability Analytics", labelKey: "nav.analytics", hint: "Availability, backlog and baseline comparison", icon: BarChart3, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/data", label: "Data Integration Hub", labelKey: "nav.data", hint: "TMS · SMMS · TDMS · COA · FOIS feeds", icon: Database, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/data-quality", label: "Data Quality Monitor", labelKey: "nav.quality", hint: "Duplicates, gaps & quarantined records", icon: ShieldCheck, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/audit", label: "Approvals & Audit Trail", labelKey: "nav.audit", hint: "Immutable action log", icon: FileSearch, roles: ["DRM", "CONTROL"] },
      { href: "/admin", label: "Users, Roles & Configuration", labelKey: "nav.admin", hint: "Desk accounts & policy switches", icon: Users, roles: ["DRM"] },
    ],
  },
];

/** Items visible to a role (nav never shows a desk the gate would refuse). */
export function navForRole(role: AppRole | null): NavGroup[] {
  if (!role) return [];
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length > 0);
}

export function navItemFor(pathname: string, role: AppRole | null): NavItem | null {
  const groups = navForRole(role);
  for (const g of groups) {
    for (const i of g.items) {
      if (pathname === i.href || pathname.startsWith(`${i.href}/`)) return i;
    }
  }
  return null;
}

export function navGroupFor(pathname: string, role: AppRole | null): NavGroup | null {
  for (const g of navForRole(role)) {
    for (const i of g.items) {
      if (pathname === i.href || pathname.startsWith(`${i.href}/`)) return g;
    }
  }
  return null;
}

/** Reference-ID style labels used across module headers. */
export const MODULE_CODES: Record<string, string> = {
  "/command": "OPS-CC",
  "/network": "OPS-NET",
  "/station": "OPS-SM",
  "/planner": "AIP-BLK",
  "/superblocks": "AIP-SBX",
  "/compare": "AIP-CMP",
  "/simulation": "AIP-SIM",
  "/replan": "AIP-RPL",
  "/defects": "MTN-DEF",
  "/jobs": "MTN-WO",
  "/field": "FLD-INS",
  "/patrol": "FLD-PTR",
  "/safety": "SAF-PTW",
  "/trains": "PAX-TV",
  "/audit": "ADM-AUD",
  "/data": "ADM-INT",
  "/data-quality": "ADM-DQ",
  "/forecast": "OPS-FRT",
  "/blocks": "AIP-BRQ",
  "/shadow": "AIP-SHD",
  "/conflicts": "AIP-CFL",
  "/resources": "AIP-RSC",
  "/approvals": "ADM-APR",
  "/analytics": "ADM-AVA",
  "/alerts": "OPS-ALT",
  "/admin": "ADM-CFG",
};

export const ungroupedIcon = AlertTriangle;
export const reportIcon = FileCheck2;
export const checkIcon = ClipboardCheck;
