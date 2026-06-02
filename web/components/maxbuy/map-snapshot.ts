import type { MaxbuyEvaluateOk } from "@/lib/app-api/schemas";

import type { MaxBuyCardSnapshot, MaxBuyVerdict } from "./types";

const VERDICT_FROM_API: Record<
  NonNullable<MaxbuyEvaluateOk["verdict"]["verdict"]>,
  NonNullable<MaxBuyVerdict>
> = {
  STRONG_BUY: "strong_buy",
  BUY: "buy",
  REVIEW: "review",
  PASS: "pass",
};

/** Map evaluate API payload to MaxBuyCard snapshot (Phase 6). */
export function mapMaxbuyEvaluateToSnapshot(
  data: MaxbuyEvaluateOk,
  askingPrice: number | null,
): MaxBuyCardSnapshot {
  const apiVerdict = data.verdict.verdict;
  return {
    displayState: data.verdict.display_state,
    recommendedMaxBuy: data.verdict.recommended_max_buy,
    askingPrice,
    deltaToAsk: data.verdict.delta_to_ask,
    mmrWholesale: data.mmr.value,
    verdict: apiVerdict ? VERDICT_FROM_API[apiVerdict] : null,
    dataStrength: data.verdict.data_strength,
    reasonCodes: data.verdict.reason_codes,
  };
}
