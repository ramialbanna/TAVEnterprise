/**
 * Item 71 — classify listing seller before Y/M/M/S and MMR.
 *
 * Heuristics always run (free). Haiku runs when text is inconclusive or a
 * listing photo exists (Facebook dealer ads are often a bare title + a lot
 * photo). Any LLM failure fails open.
 */
import type { Env } from "../types/env";
import {
  classifyListingSellerHeuristic,
  shouldAutoRejectDealer,
  type SellerClassification,
  type SellerClassifyInput,
} from "../ingest/dealerHeuristics";
import { callAnthropicForSellerClassify } from "../llm/sellerClassifyClient";
import { selectSellerClassifyImageUrls } from "../apify/listingMedia";
import { log } from "../logging/logger";

export {
  DEALER_AUTO_REJECT_CONFIDENCE,
  classifyListingSellerHeuristic,
  shouldAutoRejectDealer,
} from "../ingest/dealerHeuristics";
export type { SellerClassification, SellerClassifyInput, SellerType } from "../ingest/dealerHeuristics";

export type ClassifyListingSellerOpts = {
  /** Skip Haiku when the ingest slice is already against the wall. */
  allowLlm?: boolean;
};

function llmToClassification(
  proposal: {
    seller_type: SellerClassification["sellerType"];
    confidence: number;
    reasoning: string;
    signals: string[];
  },
): SellerClassification {
  return {
    sellerType: proposal.seller_type,
    confidence: proposal.confidence,
    reasoning: proposal.reasoning,
    signals: proposal.signals,
    source: "llm",
  };
}

export async function classifyListingSeller(
  input: SellerClassifyInput,
  env: Env,
  opts: ClassifyListingSellerOpts = {},
): Promise<SellerClassification> {
  const heuristic = classifyListingSellerHeuristic(input);
  if (shouldAutoRejectDealer(heuristic)) {
    return heuristic;
  }

  const imageUrls = selectSellerClassifyImageUrls(input.images);
  // Text with no dealer language and no photo: nothing for Haiku to look at.
  if (heuristic.signals.length === 0 && imageUrls.length === 0) {
    return heuristic;
  }

  if (opts.allowLlm === false) return heuristic;

  const llm = await callAnthropicForSellerClassify({
    env,
    title: input.title,
    description: input.description,
    sellerName: input.sellerName,
    imageUrls,
  });
  if (llm.kind !== "ok") {
    log("ingest.seller_classify_llm_skipped", { reason: llm.kind, heuristic_signals: heuristic.signals });
    return heuristic;
  }

  log("ingest.seller_classify_llm", {
    seller_type: llm.proposal.seller_type,
    confidence: llm.proposal.confidence,
    latency_ms: llm.latencyMs,
    model: llm.model,
    image_count: imageUrls.length,
    kpi: true,
  });
  return llmToClassification(llm.proposal);
}
