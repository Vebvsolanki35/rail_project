/** Client-safe DTOs shared between API routes and UI components. */
import type { UrgencyQueueItem } from "./urgency";

export type Department = "ENG" | "TRD" | "SNT";

export interface StationDTO {
  id: number;
  code: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  dailyTrains: number;
  vipZone: boolean;
}

export interface LiveTrainDTO {
  number: string;
  name: string;
  kind: string;
  from: string;
  to: string;
  schDep: number;
  delayMin: number;
  status: "RUNNING" | "SCHEDULED" | "ARRIVED";
  segCode: string | null;
  progressPct: number;
  nextStation: string;
  x: number;
  y: number;
}

export interface SegmentDTO {
  id: number;
  code: string;
  fromCode: string;
  toCode: string;
  corridor: string;
  lengthKm: number;
  isBridge: boolean;
  isLevelCrossing: boolean;
  dailyTrains: number;
  criticality: number;
}

export interface DefectDTO {
  id: number;
  /** Stable human reference — DEF-<SECTION>-<YEAR>-<SEQ>. */
  defectCode: string;
  segmentId: number;
  segmentCode: string;
  corridor: string;
  department: Department;
  sourceSystem: string;
  title: string;
  severity: number;
  overdueDays: number;
  durationMin: number;
  inspectionMode: string;
  failureProb72h: number;
  status: string;
  aiScore: number;
  /* ---- Smart Defect Lifecycle ---- */
  lifecycleStatus: string;
  lifecycleLabel: string;
  stageIndex: number;
  happening: string;
  next: string;
  responsible: string;
  nextAction: string | null;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  dueInDays: number;
  recurrenceBand: string;
  occurrences: number;
  detailedInspection: boolean;
  /* ---- Urgency engine ---- */
  urgencyClass: string;
  urgencyScore: number;
  boost: number;
  /** aiScore × urgencyBoost — the optimizer's ordering key. */
  sortKey: number;
  /** Rule-based recurrence escalations are always labelled as such. */
  escalatedByRecurrence: boolean;
}

export interface BlockItemDTO {
  id: number;
  segmentId: number;
  segmentCode: string;
  corridor: string;
  day: number;
  startMin: number;
  endMin: number;
  departments: string[];
  /** Ids of the defects bundled into this occupancy (order = priority order). */
  defectIds?: number[];
  defectCount: number;
  isSuperBlock: boolean;
  mode: string;
  window: string;
  delayCostMin: number;
  /** Why the optimizer chose this window — rendered by BlockExplain. */
  rationale?: string;
  /** proposed | frozen (crew on site) | superseded (replaced by a re-plan) */
  status?: string;
}

export interface PlanDTO {
  id: number;
  name: string;
  horizon: string;
  createdAt: string;
  resilienceScore: number;
  kpis: Record<string, number>;
  blocks: BlockItemDTO[];
  /* ---- Dynamic re-planning lineage (plans.supersedesId / triggerNote / diff) ---- */
  supersedesId?: number | null;
  triggerNote?: string | null;
  diff?: { added: string[]; removed: string[]; moved: string[]; frozen: string[]; note: string } | null;
}

export interface EventDTO {
  id: number;
  kind: "info" | "warn" | "critical" | "ai";
  message: string;
  createdAt: string;
}

export interface SettingsDTO {
  fogMode: boolean;
  vipAlert: boolean;
  dtpRedZone: boolean;
  planStatus: "PROPOSED" | "APPROVED" | "VETOED";
}

export type JobStatus = "PENDING" | "ALLOTTED" | "IN_PROGRESS" | "AWAITING_REVIEW" | "COMPLETED" | "REJECTED";

export interface JobDTO {
  id: number;
  defectId: number | null;
  segmentId: number;
  segmentCode: string;
  corridor: string;
  department: Department;
  title: string;
  note: string;
  chainage: string;
  status: JobStatus;
  teamLeader: string | null;
  windowStart: number | null;
  windowEnd: number | null;
  isSuperBlock: boolean;
  reportPhoto: string;
  reportGps: string;
  reportAt: string;
  beforePhoto: string | null;
  beforeGps: string | null;
  beforeAt: string | null;
  afterPhoto: string | null;
  afterGps: string | null;
  afterAt: string | null;
  reviewNote: string | null;
  escalationLevel: number; // 0 none · 1 SMS to karmi · 2 inspector alert · 3 DRM critical
  allottedBy: string | null;
  updatedAt: string;
}

export interface DashboardState {
  stations: StationDTO[];
  segments: SegmentDTO[];
  settings: SettingsDTO;
  counts: {
    openDefects: number;
    criticalDefects: number;
    assetsBelowHealth: number;
    virtualInspections: number;
  };
  deptLoad: { dept: Department; open: number; critical: number; avgFailureProb: number }[];
  latestPlan: PlanDTO | null;
  events: EventDTO[];
  liveTrains: LiveTrainDTO[];
  activeBlockSegments: number[];
  overrun: OverrunInfo | null;
  kpis: {
    downtimeBaselineH: number;
    downtimeOptimizedH: number;
    bundlingPct: number;
    avgDelayMin: number;
    resilienceScore: number;
    conflictsAvoided: number;
  };
  weather: { tempC: number; visibilityM: number; humidityPct: number; fogRisk: string };
  /* ---- PS #26027 additions ---- */
  lifecycle: {
    counts: Record<string, number>;
    open: number;
    closed: number;
    overdue: number;
    emergency: number;
    awaitingValidation: number;
    chronic: number;
    detailedInspections: number;
    avgAgeDaysOpen: number;
  };
  urgency: {
    total: number;
    counts: Record<string, number>;
    emergency: number;
    overdue: number;
    /** Same fields the engine's urgencySummary() exposes, for the shared panel. */
    emergencyCount: number;
    overdueCount: number;
    avgUrgency: number;
    top: UrgencyQueueItem | null;
  };
  /** Top of the prioritisation queue, ready for the command-centre panel. */
  urgencyQueue: UrgencyQueueItem[];
  availability: {
    optimizedPct: number;
    baselinePct: number;
    gainPts: number;
    monitoredAssets: number;
    optimizedDowntimeH: number;
    baselineDowntimeH: number;
    horizon: string;
  } | null;
  superBlocks: {
    opportunities: number;
    recommended: number;
    potentialSavingH: number;
    plannedSuperBlocks: number;
    coordinationH: number;
    splitFindings: number;
    topSegmentCode: string | null;
    topSavingMin: number;
    topDecision: string | null;
  } | null;
  replanning: {
    versions: number;
    replans: number;
    latestTrigger: string | null;
    latestDiff: { added: string[]; removed: string[]; moved: string[]; frozen: string[]; note: string } | null;
  };
  /** Latest plan quality score (quality.ts) — null until a plan exists. */
  planQuality: {
    score: number;
    items: { key: string; label: string; pct: number; display: string; weight: number; note: string }[];
    /** Plan vs the manual/pre-Rail-Rakshak baseline (null when unmeasurable). */
    vsManual: { downtimePct: number | null; availabilityPts: number | null } | null;
  } | null;
  modelCard: {
    algorithm: string;
    trainedOn: number;
    accuracy: number;
    auc: number;
    features: { name: string; weight: number }[];
    note: string;
  };
}

export interface WhatIfRequest {
  segmentId: number;
  durationH: number;
  startMin: number;
  superBlock: boolean;
}

export interface WhatIfResult {
  segmentCode: string;
  affectedTrains: number;
  freightRakesHeld: number;
  totalDelayMin: number;
  passengerDelayCost: number;
  freightPenalty: number;
  dieselSavings: number;
  futureFailureCostAvoided: number;
  netBenefit: number;
  humanImpactScore: number;
  recommend: boolean;
  verdict: string;
  bestWindow: { startMin: number; cost: number };
  stationHeat: Record<string, number>;
  cascade: { station: string; delayMin: number; note: string }[];
}

export interface ConsensusResult {
  segmentCode: string;
  votes: { system: string; dept: Department; vote: number; rationale: string }[];
  agreementPct: number;
  decision: "APPROVED" | "HELD";
  rootCause: string;
}

export interface CrisisStep {
  tSec: number;
  tag: string;
  title: string;
  detail: string;
  tone: "info" | "warn" | "critical" | "ok";
}

export interface CrisisResult {
  scenario: string;
  steps: CrisisStep[];
  decision: {
    action: string;
    rerouteVia: string;
    freightHeld: number;
    costReroute: number;
    costHold: number;
    savings: number;
    blockMin: number;
    justification: string[];
  };
  resolvedInSec: number;
}

export interface SafetyOrderDTO {
  ref: string;
  generatedInMs: number;
  title: string;
  body: string[];
}

export interface OptimizeResponse {
  plan: PlanDTO;
  monteCarlo: { runs: number; p50Delay: number; p95Delay: number; stdDev: number; hist: number[] };
  log: string[];
}

export interface OverrunInfo {
  jobId: number;
  title: string;
  segCode: string;
  remainingMin: number;
  donePct: number;
  probability: number;
}

/* ------------------------------------------------------------------ */
/*  Citizen Train View (public /trains page)                           */
/* ------------------------------------------------------------------ */

export interface CitizenSearchResultDTO {
  number: string;
  name: string;
  kind: string;
  origin: string;
  originName: string;
  dest: string;
  destName: string;
  departs: string;
  runsPerDay: number;
  stationsOnRoute: number;
}

export interface CitizenImpactReasonDTO {
  kind: "active-work" | "field-job" | "planned-block" | "safety-watch";
  section: string;
  sectionCode: string;
  corridor: string;
  when: string;
  windowLabel: string;
  overlapsPassage: boolean;
  departments: string[];
  maxSeverity?: number;
  isSuperBlock?: boolean;
  text: string;
}

export interface CitizenJourneyDTO {
  train: {
    number: string;
    name: string;
    kind: string;
    origin: string;
    originName: string;
    dest: string;
    destName: string;
    departs: string;
    runsPerDay: number;
    priority: number;
  };
  journey: {
    status: "RUNNING" | "SCHEDULED" | "ARRIVED";
    statusLabel: "Running Normally" | "Maintenance Window Nearby" | "Minor Operational Impact" | "High Operational Impact";
    progressPct: number;
    lastStation: { code: string; name: string; note: string } | null;
    nextStation: { code: string; name: string; etaMin: number | null; note: string } | null;
    stations: { code: string; name: string; seq: number; timeLabel: string; state: "passed" | "current" | "upcoming"; note: string }[];
    beyondGrid: { destCode: string; destName: string } | null;
  };
  impact: {
    level: "GREEN" | "YELLOW" | "RED";
    statusLabel: CitizenJourneyDTO["journey"]["statusLabel"];
    headline: string;
    advice: string;
    reasons: CitizenImpactReasonDTO[];
    notes: string[];
    whatWeDo: string;
  };
  kpis: {
    horizon: string;
    generatedAt: string;
    blocksOptimized: number | null;
    activitiesCoordinated: number | null;
    combinedWindows: number | null;
    downtimeReductionPct: number | null;
    downtimeBaselineH: number | null;
    downtimeOptimizedH: number | null;
  } | null;
  disclaimers: string[];
}
