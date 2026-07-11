/** Shared dismiss/flag reason vocabulary (items 45/47). */

export const DISMISS_REASON_CODES = [
  "not_a_good_lead",
  "title_issues",
  "dealer",
  "wrong_vehicle",
  "bad_price",
  "bad_condition",
  "damaged",
  "too_far",
  "duplicate",
  "other",
] as const;

export type DismissReasonCode = (typeof DISMISS_REASON_CODES)[number];

export const DISMISS_REASON_LABELS: Record<DismissReasonCode, string> = {
  not_a_good_lead: "Not a good lead",
  title_issues: "Title Issues",
  dealer: "Dealer",
  wrong_vehicle: "Wrong vehicle type",
  bad_price: "Price out of range",
  bad_condition: "Condition concerns",
  damaged: "Damaged car",
  too_far: "Too far / wrong market",
  duplicate: "Duplicate",
  other: "Other",
};

/** Statuses excluded from default Opportunities queue views. */
export const SUPPRESSED_QUEUE_STATUSES = new Set([
  "bad_lead",
  "passed",
  "purchased",
  "duplicate",
  "stale",
  "sold",
  "archived",
]);

export function isSuppressedFromActiveQueue(status: string | null | undefined): boolean {
  if (!status) return false;
  return SUPPRESSED_QUEUE_STATUSES.has(status);
}
