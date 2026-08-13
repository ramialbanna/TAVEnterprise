import type { Env } from "../types/env";
import type { BuyBoxRule, ScoredLead } from "../types/domain";
import type { SupabaseClient } from "../persistence/supabase";
import { withRetry } from "../persistence/retry";
import type { SourceRunRecord } from "../persistence/sourceRuns";
import { insertRawListing } from "../persistence/rawListings";
import { writeDeadLetter } from "../persistence/deadLetter";
import { writeFilteredOut } from "../persistence/filteredOut";
import {
  setNormalizedListingEntryMethod,
  upsertNormalizedListing,
} from "../persistence/normalizedListings";
import { upsertVehicleCandidate } from "../persistence/vehicleCandidates";
import { linkNormalizedListingToCandidate } from "../persistence/duplicateGroups";
import { fetchActiveBuyBoxRules } from "../persistence/buyBoxRules";
import { upsertLead } from "../persistence/leads";
import { writeValuationMissSnapshot } from "../persistence/valuationSnapshots";
import { parseFacebookItem, detectFacebookDrift } from "../sources/facebook";
import { parseCraigslistItem, detectCraigslistDrift } from "../sources/craigslist";
import type { AdapterContext } from "../sources/facebook";
import { writeSchemaDrift } from "../persistence/schemaDrift";
import { computeIdentityKey } from "../dedupe/fingerprint";
import { computeStaleScore } from "../stale/scorer";
import { computeDealScore } from "../scoring/deal";
import { matchBuyBox } from "../scoring/buyBox";
import {
  computeFreshnessScore,
  computeSourceConfidenceScore,
  computeRegionScore,
  computeFinalScore,
} from "../scoring/lead";
import { computeHybridBuyBoxScore } from "../scoring/hybrid";
import { computeSegmentProfitScore } from "../scoring/segment";
import { computeRegionDemandScore } from "../scoring/demand";
import { getSegmentAvgMarginPct } from "../persistence/purchaseOutcomes";
import { getDemandScoreForRegion } from "../persistence/marketDemandIndex";
import { insertBuyBoxScoreAttribution } from "../persistence/buyBoxScoreAttributions";
import { getMmrValue } from "../valuation/mmr";
import { getMmrLookupOutcome, createLlmYmmsPrefetch } from "../valuation/workerClient";
import type { MmrMissReason, LlmYmmsPrefetch } from "../valuation/workerClient";
import { buildLlmYmmsPrefetchInputs, buildLlmYmmsResolutionInput } from "./llmYmmsPrefetchInputs";
import {
  isBlockedSeller,
  loadBlockedSellerLookup,
  type BlockedSellerLookup,
} from "../persistence/blockedSellers";
import type { CatalogMatchSuggestion } from "../valuation/resolveListingToCatalog";
import { upsertCatalogMatchSuggestions } from "../persistence/catalogMatchSuggestions";
import type { ValuationMethod, NormalizationConfidence } from "../types/domain";
import { getValuationLookupMode } from "../valuation/lookupMode";
import { fromMmrResult } from "../valuation/valuationResult";
import { writeValuationSnapshot } from "../persistence/valuationSnapshots";
import { writeVehicleEnrichment } from "../persistence/vehicleEnrichments";
import { log, logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";
import type { ExcellentLeadSummary } from "../alerts/alerts";
import {
  buildIngestMaxbuyEvaluateBody,
  scheduleIngestMaxbuyEvaluate,
} from "./ingestMaxbuyEvaluate";
import type { IngestRequest } from "../validate";

/** Wall-clock budget per ingest slice (single /ingest call or one Apify chunk). */
export const BATCH_TIMEOUT_MS = 25_000;

/** Reserved time for source_run completion after the item loop. */
export const COMPLETION_RESERVE_MS = 1_500;

/**
 * Max items per Apify webhook slice. Sized so LLM+MMR per listing (~3s each)
 * fits inside BATCH_TIMEOUT_MS with headroom. Applies to all Apify sources.
 */
export const INGEST_CHUNK_SIZE = 7;

export type IngestLoopResult = {
  processed: number;
  rejected: number;
  created_leads: number;
  truncated: boolean;
  items_skipped: number;
  excellentLeads: ExcellentLeadSummary[];
  cachedRules?: BuyBoxRule[];
};

export type RunIngestItemLoopParams = {
  db: SupabaseClient;
  run: SourceRunRecord;
  payload: IngestRequest;
  env: Env;
  execCtx: ExecutionContext;
  /** Global item index of the first item in `payload.items` (chunk mode). */
  itemIndexOffset?: number;
  /** Reuse buy-box rules fetched by a prior chunk in the same run. */
  cachedRules?: BuyBoxRule[];
  /** Override deadline; defaults to BATCH_TIMEOUT_MS from now. */
  loopDeadline?: number;
};

export function computeIngestLoopDeadline(nowMs: number = Date.now()): number {
  return nowMs + BATCH_TIMEOUT_MS - COMPLETION_RESERVE_MS;
}

/**
 * Raw → normalized → candidate → valuation → scoring → lead loop for one batch
 * of items. Does not upsert or complete the source_run — callers own lifecycle.
 */
export async function runIngestItemLoop(
  params: RunIngestItemLoopParams,
): Promise<IngestLoopResult> {
  const {
    db,
    run,
    payload,
    env,
    execCtx,
    itemIndexOffset = 0,
    cachedRules: initialCachedRules,
    loopDeadline = computeIngestLoopDeadline(),
  } = params;

  const { source, run_id, region, scraped_at, items } = payload;
  const ctx: LogContext = { runId: run_id, source, region };

  const adapterCtx: AdapterContext = { region, scrapedAt: scraped_at, sourceRunId: run.id };

  let blockedSellerLookup: BlockedSellerLookup | null = null;
  try {
    blockedSellerLookup = await loadBlockedSellerLookup(db, source, region);
  } catch (err) {
    logError("persistence", "ingest.blocked_sellers_load_failed", err, ctx);
  }

  const llmPrefetch: LlmYmmsPrefetch | null =
    getValuationLookupMode(env) === "worker"
      ? createLlmYmmsPrefetch(
          buildLlmYmmsPrefetchInputs(items, source, adapterCtx, blockedSellerLookup),
          env,
        )
      : null;

  let cachedRules = initialCachedRules;

  let rawInserted = 0;
  let rejected = 0;
  let createdLeads = 0;
  let localIndex = 0;
  let truncated = false;
  let itemsSkipped = 0;
  const excellentLeads: ExcellentLeadSummary[] = [];

  for (const item of items) {
    const i = itemIndexOffset + localIndex++;
    const itemCtx: LogContext = { ...ctx, itemIndex: i };

    if (Date.now() >= loopDeadline) {
      truncated = true;
      itemsSkipped = items.length - (localIndex - 1);
      log(
        "ingest.batch_deadline_hit",
        {
          remaining: itemsSkipped,
          processed_so_far: rawInserted,
          rejected_so_far: rejected,
          item_index_offset: itemIndexOffset,
          kpi: true,
        },
        ctx,
      );
      break;
    }

    let rawId: string | undefined;
    try {
      const raw = await withRetry(() =>
        insertRawListing(db, {
          source,
          source_run_id: run.id,
          raw_item: item,
          received_at: new Date().toISOString(),
        }),
      );
      rawId = raw.id;
    } catch (err) {
      logError("persistence", "ingest.raw_insert_failed", err, itemCtx);
      try {
        await writeDeadLetter(db, env, {
          source,
          region,
          run_id,
          item_index: i,
          reason_code: "raw_insert_failed",
          payload: item,
          error_message: err instanceof Error ? err.message : String(err),
        });
      } catch {
        /* never throws */
      }
      rejected++;
      continue;
    }

    const adapterResult =
      source === "facebook"
        ? parseFacebookItem(item, adapterCtx)
        : source === "craigslist"
          ? parseCraigslistItem(item, adapterCtx)
          : { ok: false as const, reason: "unsupported_source", details: { source } };

    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      const itemRec = item as Record<string, unknown>;
      const driftEvents =
        source === "facebook"
          ? detectFacebookDrift(itemRec)
          : source === "craigslist"
            ? detectCraigslistDrift(itemRec)
            : [];
      if (driftEvents.length > 0) {
        try {
          await Promise.all(
            driftEvents.map((e) => writeSchemaDrift(db, { source, source_run_id: run.id, ...e })),
          );
        } catch {
          /* best-effort */
        }
      }
    }

    if (!adapterResult.ok) {
      await writeFilteredOut(db, env, {
        source,
        source_run_id: run_id,
        reason_code: adapterResult.reason,
        details: { reason: adapterResult.reason, detail: adapterResult.details, item },
        raw_listing_id: rawId,
      });
      rejected++;
      continue;
    }

    const { listing } = adapterResult;
    const listingCtx: LogContext = { ...itemCtx, listingUrl: listing.url };

    if (
      blockedSellerLookup &&
      isBlockedSeller(blockedSellerLookup, listing.sellerUrl, listing.sellerName)
    ) {
      log(
        "ingest.dealer_blocked",
        {
          seller_url: listing.sellerUrl ?? null,
          seller_name: listing.sellerName ?? null,
          kpi: true,
        },
        listingCtx,
      );
      await writeFilteredOut(db, env, {
        source,
        source_run_id: run_id,
        listing_url: listing.url,
        reason_code: "blocked_dealer",
        details: {
          seller_url: listing.sellerUrl ?? null,
          seller_name: listing.sellerName ?? null,
        },
        raw_listing_id: rawId,
      });
      rejected++;
      continue;
    }

    let normResult: { id: string; isNew: boolean; priceChanged: boolean; mileageChanged: boolean };
    try {
      normResult = await withRetry(() => upsertNormalizedListing(db, listing, run.id, rawId));
    } catch (err) {
      logError("persistence", "ingest.normalized_upsert_failed", err, listingCtx);
      await writeFilteredOut(db, env, {
        source,
        source_run_id: run_id,
        listing_url: listing.url,
        reason_code: "normalized_upsert_failed",
        details: { error: err instanceof Error ? err.message : String(err) },
        raw_listing_id: rawId,
      });
      rejected++;
      continue;
    }

    if (normResult.isNew) {
      try {
        await withRetry(() => setNormalizedListingEntryMethod(db, normResult.id, "scraper"));
      } catch (err) {
        logError("persistence", "ingest.entry_method_failed", err, listingCtx);
      }
    }

    let vcId: string | undefined;
    try {
      const identityKey = computeIdentityKey(listing);
      const vc = await withRetry(() => upsertVehicleCandidate(db, identityKey, listing));
      vcId = vc.id;
      await withRetry(() =>
        linkNormalizedListingToCandidate(db, vc.id, normResult.id, "exact", 1.0, vc.isNew),
      );
      log("dedupe.linked", { identity_key: identityKey, is_new: vc.isNew, kpi: true }, listingCtx);
    } catch (err) {
      logError("dedupe", "ingest.dedupe_failed", err, listingCtx);
    }

    let mmrResult = null;
    let catalogMatchSuggestions: CatalogMatchSuggestion[] | undefined;
    let workerMiss: {
      reason: MmrMissReason;
      method: ValuationMethod | null;
      normalizationConfidence?: NormalizationConfidence;
      mileageUsed?: number | null;
      isInferredMileage?: boolean;
    } | null = null;

    const prefetchIndex = localIndex - 1;

    if (getValuationLookupMode(env) === "direct") {
      try {
        mmrResult = await getMmrValue(
          {
            vin: listing.vin,
            year: listing.year,
            make: listing.make,
            model: listing.model,
            mileage: listing.mileage,
          },
          env,
          env.TAV_KV,
        );
      } catch (err) {
        logError("valuation", "ingest.mmr_failed", err, listingCtx);
      }
    } else {
      try {
        const llmResolution = await llmPrefetch!.consume(prefetchIndex);
        const llmText = buildLlmYmmsResolutionInput(item, listing);
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
            description: llmText.description ?? undefined,
            condition: llmText.condition ?? undefined,
            location: llmText.location ?? undefined,
            listingMileage: llmText.listingMileage ?? undefined,
          },
          env,
          { llmResolution },
        );
        if (outcome.kind === "hit") {
          mmrResult = outcome.result;
          catalogMatchSuggestions = outcome.catalogMatchSuggestions;
        } else {
          workerMiss = {
            reason: outcome.reason,
            method: outcome.method,
            ...(outcome.normalizationConfidence && {
              normalizationConfidence: outcome.normalizationConfidence,
            }),
            ...(outcome.mileageUsed !== undefined && { mileageUsed: outcome.mileageUsed }),
            ...(outcome.isInferredMileage !== undefined && {
              isInferredMileage: outcome.isInferredMileage,
            }),
          };
          catalogMatchSuggestions = outcome.catalogMatchSuggestions;
        }
      } catch (err) {
        logError("valuation", "ingest.mmr_worker_failed", err, listingCtx);
      }
    }

    if (catalogMatchSuggestions?.length) {
      try {
        await upsertCatalogMatchSuggestions(db, normResult.id, catalogMatchSuggestions);
      } catch (err) {
        logError("valuation", "ingest.catalog_match_suggestions_failed", err, listingCtx);
      }
    }

    if (!mmrResult && workerMiss) {
      try {
        await writeValuationMissSnapshot(db, {
          normalizedListingId: normResult.id,
          vehicleCandidateId: vcId,
          listing,
          missingReason: workerMiss.reason,
          method: workerMiss.method,
          ...(workerMiss.normalizationConfidence && {
            normalizationConfidence: workerMiss.normalizationConfidence,
          }),
          ...(workerMiss.mileageUsed !== undefined && { mileageUsed: workerMiss.mileageUsed }),
          ...(workerMiss.isInferredMileage !== undefined && {
            isInferredMileage: workerMiss.isInferredMileage,
          }),
        });
        log(
          "valuation.miss",
          { missing_reason: workerMiss.reason, method: workerMiss.method, kpi: true },
          listingCtx,
        );
      } catch (err) {
        logError("valuation", "ingest.miss_snapshot_failed", err, listingCtx);
      }
    }

    if (mmrResult) {
      try {
        await withRetry(() =>
          writeValuationSnapshot(db, {
            normalizedListingId: normResult.id,
            vehicleCandidateId: vcId,
            listing,
            valuation: fromMmrResult(mmrResult!),
          }),
        );
        log(
          "valuation.fetched",
          { mmr_value: mmrResult.mmrValue, confidence: mmrResult.confidence, kpi: true },
          listingCtx,
        );
      } catch (err) {
        logError("valuation", "ingest.snapshot_failed", err, listingCtx);
        try {
          await writeDeadLetter(db, env, {
            source,
            region,
            run_id,
            item_index: i,
            reason_code: "valuation_snapshot_failed",
            payload: { normalizedListingId: normResult.id, mmrValue: mmrResult.mmrValue },
            error_message: err instanceof Error ? err.message : String(err),
          });
        } catch {
          /* never throws */
        }
      }

      if (
        getValuationLookupMode(env) === "worker" &&
        mmrResult.method === "year_make_model" &&
        mmrResult.normalizationConfidence !== undefined &&
        vcId
      ) {
        try {
          await writeVehicleEnrichment(db, {
            vehicleCandidateId: vcId,
            enrichmentSource: "mmr_normalization",
            enrichmentType: "normalization",
            payload: {
              raw_make: listing.make ?? null,
              raw_model: listing.model ?? null,
              raw_trim: listing.trim ?? null,
              lookup_make: mmrResult.lookupMake ?? null,
              lookup_model: mmrResult.lookupModel ?? null,
              lookup_trim: mmrResult.lookupTrim ?? null,
              normalization_confidence: mmrResult.normalizationConfidence,
              trim_sent_to_worker: false,
            },
          });
        } catch (err) {
          logError("valuation", "ingest.normalization_enrichment_failed", err, listingCtx);
        }
      }

      const maxbuyBody = buildIngestMaxbuyEvaluateBody({
        normalizedListingId: normResult.id,
        listing,
        mmrResult,
      });
      if (maxbuyBody) {
        scheduleIngestMaxbuyEvaluate(execCtx, env, maxbuyBody);
      }
    }

    const staleResult = computeStaleScore(new Date(listing.scrapedAt));
    const freshnessScore = computeFreshnessScore(staleResult.score);
    const sourceConfidenceScore = computeSourceConfidenceScore(listing.source);
    const regionScore = computeRegionScore(listing.region);
    const dealScore = computeDealScore(listing.price, mmrResult?.mmrValue);

    if (!cachedRules) {
      try {
        cachedRules = await fetchActiveBuyBoxRules(db);
      } catch {
        cachedRules = [];
      }
    }

    const buyBoxMatch = matchBuyBox(listing, cachedRules, mmrResult?.mmrValue);
    const buyBoxScore = buyBoxMatch?.score ?? 0;

    let effectiveBuyBoxScore = buyBoxScore;
    let segmentProfitScore = 50;
    let regionDemandScore = 50;

    if (env.HYBRID_BUYBOX_ENABLED === "true") {
      try {
        const marginPct = await getSegmentAvgMarginPct(db, {
          year: listing.year,
          make: listing.make,
          model: listing.model,
          mileageBucket:
            listing.mileage != null ? Math.floor(listing.mileage / 10_000) * 10_000 : undefined,
        });
        segmentProfitScore = computeSegmentProfitScore(marginPct);
      } catch (err) {
        logError("scoring", "ingest.segment_score_failed", err, listingCtx);
      }

      try {
        const demandScore = await getDemandScoreForRegion(db, listing.region ?? "", null);
        regionDemandScore = computeRegionDemandScore(demandScore);
      } catch (err) {
        logError("scoring", "ingest.demand_score_failed", err, listingCtx);
      }

      effectiveBuyBoxScore = computeHybridBuyBoxScore(
        buyBoxScore,
        segmentProfitScore,
        regionDemandScore,
      );
    }

    const { finalScore, grade } = computeFinalScore({
      dealScore,
      buyBoxScore: effectiveBuyBoxScore,
      freshnessScore,
      regionScore,
      sourceConfidenceScore,
    });

    const scoreComponents: Record<string, unknown> = {
      rule_score: buyBoxScore,
      segment_score: segmentProfitScore,
      demand_score: regionDemandScore,
      hybrid_score: effectiveBuyBoxScore,
      deal_score: dealScore,
      freshness_score: freshnessScore,
      region_score: regionScore,
      source_confidence_score: sourceConfidenceScore,
    };

    const scored: ScoredLead = {
      dealScore,
      buyBoxScore: effectiveBuyBoxScore,
      freshnessScore,
      regionScore,
      sourceConfidenceScore,
      finalScore,
      grade,
      reasonCodes: [],
      matchedRuleId: buyBoxMatch?.ruleId,
      matchedRuleVersion: buyBoxMatch?.ruleVersion,
      valuationConfidence: mmrResult?.confidence ?? "none",
    };

    if (grade !== "pass") {
      try {
        const lead = await withRetry(() =>
          upsertLead(db, {
            normalizedListingId: normResult.id,
            vehicleCandidateId: vcId,
            listing,
            scored,
            mmrValue: mmrResult?.mmrValue,
            matchedRuleDbId: buyBoxMatch?.ruleDbId,
            scoreComponents,
          }),
        );
        if (lead.created) {
          createdLeads++;
          log(
            "lead.created",
            {
              lead_id: lead.id,
              grade,
              final_score: finalScore,
              matched_rule: buyBoxMatch?.ruleId,
              kpi: true,
            },
            listingCtx,
          );
          if (grade === "excellent") {
            excellentLeads.push({
              leadId: lead.id,
              finalScore,
              year: listing.year,
              make: listing.make,
              model: listing.model,
              region: listing.region ?? region,
              listingUrl: listing.url,
              listingPrice: listing.price,
            });
          }

          try {
            await insertBuyBoxScoreAttribution(db, {
              leadId: lead.id,
              ruleId: buyBoxMatch?.ruleId ?? null,
              ruleVersion: buyBoxMatch?.ruleVersion ?? null,
              ruleScore: buyBoxScore,
              segmentScore: env.HYBRID_BUYBOX_ENABLED === "true" ? segmentProfitScore : null,
              demandScore: env.HYBRID_BUYBOX_ENABLED === "true" ? regionDemandScore : null,
              hybridScore: effectiveBuyBoxScore,
              components: scoreComponents,
            });
          } catch (err) {
            logError("scoring", "ingest.attribution_failed", err, listingCtx);
          }
        }
      } catch (err) {
        logError("lead", "ingest.lead_upsert_failed", err, listingCtx);
      }
    }

    rawInserted++;
  }

  return {
    processed: rawInserted,
    rejected,
    created_leads: createdLeads,
    truncated,
    items_skipped: itemsSkipped,
    excellentLeads,
    cachedRules,
  };
}

export function chunkIngestItems<T>(items: T[], chunkSize: number = INGEST_CHUNK_SIZE): T[][] {
  if (chunkSize < 1) throw new Error("chunkSize must be >= 1");
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
