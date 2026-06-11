import {
  marketContextFromMmrResult,
  type MmrMarketContext,
} from "./mmr-market-types";

/** Zone C2/C3 display phase. */
export type MmrLowerSectionPhase = "idle" | "loading" | "ready";

export type MmrLowerSectionsState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; market: MmrMarketContext };

type ViewKind = "empty" | "loading" | "ok" | "unavailable" | "error";

const EMPTY_MARKET: MmrMarketContext = {
  historicalAverages: null,
  projectedAverage: null,
  transactions: [],
};

type MmrResultSlice = {
  historicalAverages?: MmrMarketContext["historicalAverages"];
  projectedAverage?: MmrMarketContext["projectedAverage"];
  transactions?: MmrMarketContext["transactions"];
};

export function lowerSectionsFromView(
  viewKind: ViewKind,
  result: MmrResultSlice | null,
): MmrLowerSectionsState {
  if (viewKind === "loading") return { phase: "loading" };
  if (viewKind === "ok" || viewKind === "unavailable") {
    return {
      phase: "ready",
      market: result ? marketContextFromMmrResult(result) : EMPTY_MARKET,
    };
  }
  return { phase: "idle" };
}

/** @deprecated Use lowerSectionsFromView — kept for tests migrating to new shape. */
export type MmrLowerSectionState = MmrLowerSectionPhase;

export function lowerSectionStateFromView(viewKind: ViewKind): MmrLowerSectionPhase {
  if (viewKind === "loading") return "loading";
  if (viewKind === "ok" || viewKind === "unavailable") return "ready";
  return "idle";
}
