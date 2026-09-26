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
    id: "command",
    label: "Command",
    items: [
      { href: "/command", label: "Command Centre", labelKey: "nav.command", hint: "Divisional control dashboard", icon: LayoutGrid, roles: ["DRM", "CONTROL", "STATION_MASTER"], badgeKey: "criticalAlerts" },
      { href: "/network", label: "Situation Overview", labelKey: "nav.network", hint: "Network status, occupancy & conflict detection", icon: Network, roles: ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR"] },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/trains", label: "Trains", labelKey: "nav.trains", hint: "Running board & journey impact", icon: TrainFront, roles: ALL },
      { href: "/blocks", label: "Blocks", labelKey: "nav.blocks", hint: "Departmental demands → one possession", icon: ClipboardCheck, roles: ["DRM", "CONTROL", "INSPECTOR", "STATION_MASTER"] },
      { href: "/conflicts", label: "Control Room", labelKey: "nav.conflicts", hint: "Traffic conflicts & feasible options", icon: AlertTriangle, roles: ["DRM", "CONTROL"], badgeKey: "criticalAlerts" },
      { href: "/simulation", label: "Simulation", labelKey: "nav.simulation", hint: "What-if cascade lab & crisis console", icon: FlaskConical, roles: ["DRM", "CONTROL"] },
      { href: "/alerts", label: "Alerts", labelKey: "nav.alerts", hint: "Risk, demand & feed alerts", icon: Radar, roles: ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR", "KARMI"], badgeKey: "criticalAlerts" },
      { href: "/replan", label: "Re-Planning", labelKey: "nav.replan", hint: "Live event → new plan version", icon: GitBranch, roles: ["DRM", "CONTROL"] },
      { href: "/forecast", label: "Goods Forecast", labelKey: "nav.forecast", hint: "Freight demand the optimizer obeys", icon: Boxes, roles: ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR"] },
      { href: "/station", label: "Station Desk", labelKey: "nav.station", hint: "Station-level blocks & reports", icon: Building2, roles: ["DRM", "STATION_MASTER", "INSPECTOR"] },
    ],
  },
  {
    id: "assets",
    label: "Assets",
    items: [
      { href: "/defects", label: "Defects", labelKey: "nav.defects", hint: "Lifecycle board & urgency register", icon: ClipboardList, roles: ["DRM", "CONTROL", "STATION_MASTER", "INSPECTOR"], badgeKey: "openDefects" },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    items: [
      { href: "/planner", label: "Planner", labelKey: "nav.planner", hint: "Optimiser, Gantt & approvals", icon: CalendarCog, roles: ["DRM", "CONTROL"], badgeKey: "pendingApprovals" },
      { href: "/jobs", label: "Work Orders", labelKey: "nav.jobs", hint: "Permit-to-work execution", icon: Wrench, roles: ["KARMI", "INSPECTOR"] },
      { href: "/resources", label: "Crews & Machines", labelKey: "nav.resources", hint: "Capacity the solver cannot exceed", icon: HardHat, roles: ["DRM", "CONTROL"] },
      { href: "/superblocks", label: "Super Blocks", labelKey: "nav.superblocks", hint: "Bundling opportunities & feasibility", icon: BarChart3, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/shadow", label: "Shadow Blocks", labelKey: "nav.shadow", hint: "Combined possessions & time saved", icon: Layers, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/compare", label: "Plan Comparison", labelKey: "nav.compare", hint: "Safety-first vs traffic-first strategies", icon: Scale, roles: ["DRM", "CONTROL", "INSPECTOR"] },
    ],
  },
  {
    id: "safety",
    label: "Safety",
    items: [
      { href: "/safety", label: "Safety & Permits", labelKey: "nav.safety", hint: "Permit-to-work, checklists, audit", icon: ShieldCheck, roles: ["DRM", "CONTROL", "INSPECTOR", "STATION_MASTER"] },
      { href: "/approvals", label: "Safety Orders & Authorisations", labelKey: "nav.approvals", hint: "Technical → Controller → DRM → block authority", icon: FileCheck2, roles: ["DRM", "CONTROL", "INSPECTOR"] },
    ],
  },
  {
    id: "field",
    label: "Field",
    items: [
      { href: "/field", label: "Field Operations", labelKey: "nav.field", hint: "Inspector beat operations", icon: HardHat, roles: ["DRM", "INSPECTOR", "KARMI"] },
      { href: "/patrol", label: "Patrol Reporting", labelKey: "nav.patrol", hint: "Login-free gangman handset", icon: Radio, roles: ALL },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    items: [
      { href: "/analytics", label: "Analytics", labelKey: "nav.analytics", hint: "Availability, backlog and baseline comparison", icon: BarChart3, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/data-quality", label: "Data Quality", labelKey: "nav.quality", hint: "Duplicates, gaps & quarantined records", icon: ShieldCheck, roles: ["DRM", "CONTROL", "INSPECTOR"] },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/data", label: "Integrations & Feeds", labelKey: "nav.data", hint: "TMS · SMMS · TDMS · COA · FOIS contracts", icon: Database, roles: ["DRM", "CONTROL", "INSPECTOR"] },
      { href: "/audit", label: "Audit Trail", labelKey: "nav.audit", hint: "Immutable action log", icon: FileSearch, roles: ["DRM", "CONTROL"] },
      { href: "/admin", label: "Administration", labelKey: "nav.admin", hint: "Desk accounts & policy switches", icon: Users, roles: ["DRM"] },
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
