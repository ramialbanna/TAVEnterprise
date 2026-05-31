import type { OpportunityRow } from "@/lib/app-api/schemas";

/** Human-readable region names for internal keys (e.g. `dallas_tx`). */
export const REGION_LABELS: Record<string, string> = {
  dallas_tx: "Dallas",
  houston_tx: "Houston",
  austin_tx: "Austin",
  san_antonio_tx: "San Antonio",
  lubbock_tx: "Lubbock",
  oklahoma_city_ok: "Oklahoma City",
};

export const OPPORTUNITY_TYPE_LABELS = {
  lead: "Lead",
  near_miss: "Almost a deal",
  manual_submission: "Submitted by team",
} as const;

/** Maps API badge strings to buyer-friendly labels. Unlisted badges pass through. */
export const BADGE_LABELS: Record<string, string> = {
  "Near miss": "Almost a deal",
  "Manual submission": "Submitted by team",
};

/** Maps workflow status values to buyer-friendly labels. */
export const STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  claimed: "Working on it",
  reviewed: "Reviewed",
  contacted: "Contacted",
  negotiating: "Negotiating",
  purchased: "Bought",
  bought: "Bought",
  passed: "Passed",
};

export const TABLE_HEADERS = {
  vehicle: "Vehicle",
  type: "Type",
  badges: "Signals",
  price: "Asking price",
  mmrValue: "Wholesale value",
  spread: "Room to make",
  finalScore: "Deal score",
  assignedCloserName: "Assignee",
  claimedBy: "Working by",
  status: "Status",
  region: "Region",
  lastSeenAt: "Last seen",
} as const;

export const TOOLTIPS = {
  mmrValue: "MMR — Manheim Market Report wholesale estimate",
  spread: "Difference between asking price and wholesale value",
  finalScore: "Combined deal score from price, vehicle, and market signals",
} as const;

export const PAGE_COPY = {
  title: "Opportunities",
  intro:
    "Your deal queue — scored leads, listings worth a second look, and team submissions. " +
    "Compare asking price to wholesale value, then claim a deal and track it through close.",
  queueSummaryTitle: "Queue at a glance",
  queueTotal: "Total in queue",
  queueShowing: "Showing",
  queueLeads: "Leads",
  queueNearMisses: "Almost deals",
  queueManual: "Team submissions",
  tableTitle: "Your queue",
  tableFooter:
    "Sorted by room to make (best deals first). Click a row for a quick preview, or open the full detail page from there.",
  emptyTitle: "No deals in your queue yet",
  emptyHint:
    "Leads, almost-deals, and team submissions show up here. Submit a listing link with the button above.",
  claimAction: "I'm working this",
  preview: {
    valuationTitle: "Pricing",
    askingPrice: "Asking price",
    wholesaleValue: "Wholesale value",
    roomToMake: "Room to make",
    dealScore: "Deal score",
    status: "Status",
    sightingTitle: "Listing details",
    source: "Source",
    region: "Region",
    firstSeen: "First seen",
    lastSeen: "Last seen",
    seenCount: "Times seen",
    detailTitle: "Vehicle details",
    vin: "VIN",
    mileage: "Mileage",
    reasonCodes: "Reason codes",
    valuationMiss: "Missing valuation",
  },
} as const;

export function formatRegion(region: string | null | undefined): string {
  if (!region) return "—";
  return REGION_LABELS[region] ?? region.replace(/_/g, " ");
}

export function formatOpportunityStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function formatOpportunityBadge(badge: string): string {
  return BADGE_LABELS[badge] ?? badge;
}

export function formatOpportunityType(
  type: OpportunityRow["type"],
  grade?: string | null,
): string {
  const base = OPPORTUNITY_TYPE_LABELS[type];
  if (type === "lead" && grade) {
    const label = grade.charAt(0).toUpperCase() + grade.slice(1);
    return `${base} · ${label}`;
  }
  return base;
}
