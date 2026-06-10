import type { MaxBuyCardSnapshot } from "@/components/maxbuy/types";

import type { MaxbuyEvaluationDisplay } from "./maxbuy-evaluation-section";

const MOCK_RECOMMENDATION_ID = "00000000-0000-4000-8000-000000000001";

type MmrAnchor = {
  mmrValue: number | null;
  adjustedMmr?: number | null;
};

/**
 * Phase 1 mock — replaced by live `postMaxbuyEvaluate` + `mapMaxbuyEvaluateToSnapshot` in Phase 2.
 * Does not map MMR retail/adjusted values to asking price (MLB-5).
 */
export function buildMockMaxbuyEvaluation(
  mmr: MmrAnchor,
  options?: { askingPrice?: number | null; vin?: string },
): MaxbuyEvaluationDisplay {
  const mmrWholesale = mmr.adjustedMmr ?? mmr.mmrValue;
  const askingPrice = options?.askingPrice ?? null;
  const hasDealFit = askingPrice !== null && askingPrice > 0;

  const recommendedMaxBuy =
    mmrWholesale !== null && mmrWholesale > 0
      ? Math.round(mmrWholesale * 0.91)
      : null;

  const deltaToAsk =
    hasDealFit && askingPrice !== null && recommendedMaxBuy !== null
      ? recommendedMaxBuy - askingPrice
      : null;

  const snapshot: MaxBuyCardSnapshot = {
    recommendationId: MOCK_RECOMMENDATION_ID,
    vin: options?.vin ?? "",
    displayState: hasDealFit ? "deal_fit" : "vehicle_fit",
    recommendedMaxBuy,
    askingPrice,
    deltaToAsk,
    mmrWholesale,
    verdict: hasDealFit && recommendedMaxBuy !== null ? "buy" : null,
    dataStrength: mmrWholesale !== null ? "medium" : "low",
    reasonCodes: hasDealFit
      ? ["segment_benchmark", "mmr_anchor", "target_net_met"]
      : mmrWholesale !== null
        ? ["segment_benchmark", "no_asking_price"]
        : ["mmr_unavailable"],
  };

  const expectedSale =
    recommendedMaxBuy !== null ? Math.round(recommendedMaxBuy * 1.12) : null;

  return {
    snapshot,
    economics: {
      expectedSalePrice: expectedSale ?? 0,
      expectedTransport: recommendedMaxBuy !== null ? 425 : 0,
      expectedExpenses: recommendedMaxBuy !== null ? 780 : 0,
      expectedNetGross: hasDealFit && recommendedMaxBuy !== null ? 820 : null,
    },
    tavHistorical: {
      nUnits: recommendedMaxBuy !== null ? 38 : 0,
      avgBuy: recommendedMaxBuy !== null ? recommendedMaxBuy - 400 : null,
      avgSale: expectedSale !== null ? expectedSale - 200 : null,
      avgGross: recommendedMaxBuy !== null ? 910 : null,
      avgDaysToSale: recommendedMaxBuy !== null ? 19 : null,
    },
  };
}
