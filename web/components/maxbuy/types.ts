/** MaxBuy card display modes — Phase 4 shell; Phase 6 wires live evaluate. */
export type MaxBuyCardMode = "disabled" | "awaiting_vin" | "ready";

export type MaxBuyDisplayState = "deal_fit" | "vehicle_fit";

export type MaxBuyVerdict = "strong_buy" | "buy" | "review" | "pass" | null;

export type MaxBuyDataStrength = "high" | "medium" | "low" | null;

export type MaxBuyCardSnapshot = {
  recommendationId: string;
  vin: string;
  displayState: MaxBuyDisplayState;
  recommendedMaxBuy: number | null;
  askingPrice: number | null;
  deltaToAsk: number | null;
  mmrWholesale: number | null;
  verdict: MaxBuyVerdict;
  dataStrength: MaxBuyDataStrength;
  reasonCodes: string[];
};

/** Context for Phase 7 actions (overrides, passes, workflow hand-off). */
export type MaxBuyCardActionContext = {
  recommendationId: string;
  vin: string;
  normalizedListingId?: string;
};
