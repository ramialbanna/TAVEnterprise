/** Structured override types — must match `MaxbuyOverrideRequestSchema`. */
export const MAXBUY_OVERRIDE_TYPES = [
  "passed_despite_buy",
  "bought_despite_pass",
  "bid_reduced",
  "title_condition_concern",
  "transport_concern",
  "manager_call",
  "inventory_need",
  "other",
] as const;

export type MaxbuyOverrideType = (typeof MAXBUY_OVERRIDE_TYPES)[number];

export const MAXBUY_OVERRIDE_LABELS: Record<MaxbuyOverrideType, string> = {
  passed_despite_buy: "Passed despite buy signal",
  bought_despite_pass: "Bought despite pass signal",
  bid_reduced: "Bid reduced vs recommendation",
  title_condition_concern: "Title / condition concern",
  transport_concern: "Transport concern",
  manager_call: "Manager call",
  inventory_need: "Inventory need",
  other: "Other",
};

/** Structured pass reasons for evaluated-but-passed logging. */
export const MAXBUY_PASS_REASONS = [
  "passed_despite_buy",
  "price_above_max",
  "condition_concern",
  "transport_concern",
  "title_concern",
  "timing_or_capacity",
  "other",
] as const;

export type MaxbuyPassReason = (typeof MAXBUY_PASS_REASONS)[number];

export const MAXBUY_PASS_REASON_LABELS: Record<MaxbuyPassReason, string> = {
  passed_despite_buy: "Passed despite buy / review signal",
  price_above_max: "Price above recommended max",
  condition_concern: "Condition concern",
  transport_concern: "Transport concern",
  title_concern: "Title concern",
  timing_or_capacity: "Timing or capacity",
  other: "Other",
};
