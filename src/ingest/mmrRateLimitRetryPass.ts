/**
 * Item 72 action 8 — re-price listings Manheim rate-limited on the first pass.
 *
 * Same placement as `coxNoDataRetryPass`: after the ingest item loop via
 * `execCtx.waitUntil`, outside the batch deadline. Identity is already
 * resolved — this only retries the Cox call with a short stagger so 429s
 * can clear.
 */
import type { Env } from "../types/env";
import type { SupabaseClient } from "../persistence/supabase";
import type { NormalizedListingInput } from "../types/domain";
import type { LlmYmmsResolution } from "../valuation/resolveListingWithLLM";
import { getMmrLookupOutcome } from "../valuation/workerClient";
import { fromMmrResult } from "../valuation/valuationResult";
import { writeValuationSnapshot } from "../persistence/valuationSnapshots";
import { log, logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";
import {
  buildIngestMaxbuyEvaluateBody,
  scheduleIngestMaxbuyEvaluate,
} from "./ingestMaxbuyEvaluate";

/** Same blast-radius cap as the cox_no_data retry pass. */
export const MAX_RATE_LIMIT_RETRIES_PER_SLICE = 10;

/** Stagger between retries so a burst of 429s does not immediately re-hit. */
export const RATE_LIMIT_RETRY_DELAY_MS = 2_000;

export type MmrRateLimitRetryCandidate = {
  normalizedListingId: string;
  vehicleCandidateId?: string;
  listing: NormalizedListingInput;
  llmResolution: LlmYmmsResolution;
  llmText: {
    description?: string | undefined;
    condition?: string | undefined;
    location?: string | undefined;
    listingMileage?: number | undefined;
  };
};

export type MmrRateLimitRetryPassResult = {
  attempted: number;
  recovered: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMmrRateLimitRetryPass(params: {
  db: SupabaseClient;
  env: Env;
  execCtx: ExecutionContext;
  candidates: readonly MmrRateLimitRetryCandidate[];
  ctx: LogContext;
}): Promise<MmrRateLimitRetryPassResult> {
  const { db, env, execCtx, candidates, ctx } = params;

  const slice = candidates.slice(0, MAX_RATE_LIMIT_RETRIES_PER_SLICE);
  let recovered = 0;
  let attempted = 0;

  for (const candidate of slice) {
    const { listing } = candidate;
    const listingCtx: LogContext = { ...ctx, listingUrl: listing.url };

    if (attempted > 0) {
      await sleep(RATE_LIMIT_RETRY_DELAY_MS);
    }

    try {
      attempted += 1;
      const outcome = await getMmrLookupOutcome(
        {
          vin: listing.vin,
          year: listing.year,
          make: listing.make,
          model: listing.model,
          trim: listing.trim,
          mileage: listing.mileage,
          title: listing.title,
          price: listing.price,
          description: candidate.llmText.description ?? undefined,
          condition: candidate.llmText.condition ?? undefined,
          location: candidate.llmText.location ?? undefined,
          listingMileage: candidate.llmText.listingMileage ?? undefined,
        },
        env,
        {
          llmResolution: candidate.llmResolution,
          normalizedListingId: candidate.normalizedListingId,
        },
      );

      if (outcome.kind !== "hit") {
        log("ingest.mmr_rate_limit_retry_skipped", {
          reason: outcome.reason,
          kpi: true,
        }, listingCtx);
        continue;
      }

      await writeValuationSnapshot(db, {
        normalizedListingId: candidate.normalizedListingId,
        ...(candidate.vehicleCandidateId && { vehicleCandidateId: candidate.vehicleCandidateId }),
        listing,
        valuation: fromMmrResult(outcome.result),
      });
      recovered += 1;

      log(
        "valuation.recovered_after_rate_limit",
        {
          mmr_value: outcome.result.mmrValue,
          lookup_model: outcome.result.lookupModel,
          lookup_trim: outcome.result.lookupTrim,
          kpi: true,
        },
        listingCtx,
      );

      const maxbuyBody = buildIngestMaxbuyEvaluateBody({
        normalizedListingId: candidate.normalizedListingId,
        listing,
        mmrResult: outcome.result,
      });
      if (maxbuyBody) scheduleIngestMaxbuyEvaluate(execCtx, env, maxbuyBody);
    } catch (err) {
      logError("valuation", "ingest.mmr_rate_limit_retry_failed", err, listingCtx);
    }
  }

  log(
    "ingest.mmr_rate_limit_retry_pass",
    {
      candidates: candidates.length,
      attempted,
      recovered,
      skipped_over_cap: Math.max(0, candidates.length - slice.length),
      kpi: true,
    },
    ctx,
  );

  return { attempted, recovered };
}
