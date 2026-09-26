/**
 * ASSET INTELLIGENCE — shared vocabulary (Phase 11).
 *
 * The map layers an inspection/control officer works with, declared once here so
 * the desk (client) and the verification suite read the same list. Each layer is
 * an operational question, not a decoration:
 *
 *   Track & structures    which track, bridge and points assets exist
 *   OHE / Traction        which traction assets carry work or risk
 *   Signals & telecom     which S&T assets carry work or risk
 *   Assets with defects   where the open register actually sits
 *   Critical only         what is already critical-priority
 *   Assets with a planned block   what the optimizer has already scheduled
 *   Crews on site now     where a gang is working today
 *   Speed restrictions    where caution is posted pending repair
 *   Maintenance crews     gang locations against the asset picture
 *
 * `match` documents, in one line each, which stored field the layer filters on —
 * so a reader can reproduce any filtered view directly against the database.
 */
export type MapLayerKey =
  | "track"
  | "ohe"
  | "signal"
  | "defects"
  | "critical"
  | "plannedBlocks"
  | "activeBlocks"
  | "speedRestrictions"
  | "crews";

export interface MapLayer {
  key: MapLayerKey;
  label: string;
  /** What the layer interrogates in the register. */
  match: string;
  /** Layer is on by default (the operational minimum). */
  defaultOn: boolean;
}

export const MAP_LAYERS: MapLayer[] = [
  { key: "track", label: "Track & structures", match: "assets.asset_type or label contains track / rail / bridge / points / curve", defaultOn: true },
  { key: "ohe", label: "OHE / Traction", match: "assets.department = TRD or asset_type contains ohe / power", defaultOn: false },
  { key: "signal", label: "Signals & telecom", match: "assets.department = SNT or asset_type contains signal / telecom / block", defaultOn: false },
  { key: "defects", label: "Assets with defects", match: "exists open defect (defects.lifecycle_status <> CLOSED) on the asset", defaultOn: true },
  { key: "critical", label: "Critical only", match: "at least one open defect with priority = CRITICAL", defaultOn: false },
  { key: "plannedBlocks", label: "Assets with a planned block", match: "the newest plan bundles one of the asset's open defects", defaultOn: true },
  { key: "activeBlocks", label: "Crews on site now", match: "a work order on the section is IN_PROGRESS", defaultOn: true },
  { key: "speedRestrictions", label: "Speed restrictions", match: "open track/structure defect at severity >= 8 (advisory posted in the panel)", defaultOn: false },
  { key: "crews", label: "Maintenance crews", match: "work orders raised against the asset's section", defaultOn: true },
];

/** Labels the asset panel is required to publish (used by tests and the UI). */
export const ASSET_PANEL_FIELDS = [
  "health",
  "openDefects",
  "failureRisk",
  "lastInspection",
  "maintenanceHistory",
  "recommendedAction",
  "recommendedBlock",
] as const;
