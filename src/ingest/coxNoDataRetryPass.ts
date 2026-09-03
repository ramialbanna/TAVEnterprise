/**
 * Item 72 — second identity attempt for listings Manheim would not price.
 *
 * Runs after the ingest item loop via `execCtx.waitUntil`, deliberately outside
 * the batch deadline. The first implementation retried inline and effectively
 * never ran: ingest already spends its whole 23.5s budget and truncates, so the
 * headroom check rejected candidates (`reason: batch_deadline` in production).
 *
 * Each recovered listing appends a hit snapshot. `buildListingDiagnostics`
 * keeps the row with the newest `fetched_at` per listing, so the later hit
 * supersedes the earlier miss while leaving both for audit.
 */
import type { Env } from "../types/env";
import type { SupabaseClient } from "../persistence/supabase";
import type { NormalizedListingInput } from "../types/domain";
import { retryMmrAfterCoxNoData } from "../valuation/workerClient";
import { fromMmrResult } from "../valuation/valuationResult";
import { writeValuationSnapshot } from "../persistence/valuationSnapshots";
import { log, logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";
import {
  buildIngestMaxbuyEvaluateBody,
  scheduleIngestMaxbuyEvaluate,
} from "./ingestMaxbuyEvaluate";

/**
 * Ceiling on retries per ingest slice. `waitUntil` work is not unbounded, and
 * each retry costs a Claude call plus a Manheim call — this caps the blast
 * radius on a batch where most listings miss.
 */
export const MAX_RETRIES_PER_SLICE = 10;

export type CoxNoDataRetryCandidate = {
  normalizedListingId: string;
  vehicleCandidateId?: string;
  listing: NormalizedListingInput;
  /** Listing text for the Claude re-ask; same shape the first attempt used. */
  llmText: {
    description?: string | undefined;
    condition?: string | undefined;
    location?: string | undefined;
    listingMileage?: number | undefined;
  };
  /** Cox tokens Manheim refused. */
  rejectedModel: string;
  rejectedStyle: string;
  /**
   * Canonical make when the rejected pick came from an alias row — presence is
   * what tells the retry to retire that alias.
   */
  rejectedAliasMake?: string | null;
};

export type CoxNoDataRetryPassResult = {
  attempted: number;
  recovered: number;
};

export async function runCoxNoDataRetryPass(params: {
  db: SupabaseClient;
  env: Env;
  execCtx: ExecutionContext;
  candidates: readonly CoxNoDataRetryCandidate[];
  ctx: LogContext;
}): Promise<CoxNoDataRetryPassResult> {
  const { db, env, execCtx, candidates, ctx } = params;

  const slice = candidates.slice(0, MAX_RETRIES_PER_SLICE);
  let recovered = 0;
  let attempted = 0;

  for (const candidate of slice) {
    const { listing } = candidate;
    const listingCtx: LogContext = { ...ctx, listingUrl: listing.url };

    try {
      attempted += 1;
      const outcome = await retryMmrAfterCoxNoData(
        {
          year: listing.year,
          make: listing.make,
          model: listing.model,
          trim: listing.trim,
          mileage: listing.mileage,
          title: listing.title,
          price: listing.price,
          ...candidate.llmText,
        },
        env,
        {
          make: candidate.rejectedAliasMake,
          model: candidate.rejectedModel,
          style: candidate.rejectedStyle,
        },
        { normalizedListingId: candidate.normalizedListingId },
      );

      if (outcome.kind !== "hit") continue;

      await writeValuationSnapshot(db, {
        normalizedListingId: candidate.normalizedListingId,
        ...(candidate.vehicleCandidateId && { vehicleCandidateId: candidate.vehicleCandidateId }),
        listing,
        valuation: fromMmrResult(outcome.result),
      });
      recovered += 1;

      log(
        "valuation.recovered_after_no_data",
        {
          mmr_value: outcome.result.mmrValue,
          lookup_model: outcome.result.lookupModel,
          lookup_trim: outcome.result.lookupTrim,
          kpi: true,
        },
        listingCtx,
      );

      // A recovered listing deserves the same Max buy treatment a first-attempt
      // hit gets (item 59) — otherwise it reaches the queue without a number.
      const maxbuyBody = buildIngestMaxbuyEvaluateBody({
        normalizedListingId: candidate.normalizedListingId,
        listing,
        mmrResult: outcome.result,
      });
      if (maxbuyBody) scheduleIngestMaxbuyEvaluate(execCtx, env, maxbuyBody);
    } catch (err) {
      logError("valuation", "ingest.cox_no_data_retry_failed", err, listingCtx);
    }
  }

  log(
    "ingest.cox_no_data_retry_pass",
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
