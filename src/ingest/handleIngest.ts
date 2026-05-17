import type { Env } from "../types/env";
import type { BuyBoxRule, ScoredLead } from "../types/domain";
import { verifyHmac } from "../auth/hmac";
import { IngestRequestSchema, type IngestRequest } from "../validate";
import { getSupabaseClient } from "../persistence/supabase";
import { withRetry } from "../persistence/retry";
import { upsertSourceRun, completeSourceRunSafe } from "../persistence/sourceRuns";
import { insertRawListing } from "../persistence/rawListings";
import { writeDeadLetter } from "../persistence/deadLetter";
import { writeFilteredOut } from "../persistence/filteredOut";
import { upsertNormalizedListing } from "../persistence/normalizedListings";
import { upsertVehicleCandidate } from "../persistence/vehicleCandidates";
import { linkNormalizedListingToCandidate } from "../persistence/duplicateGroups";
import { fetchActiveBuyBoxRules } from "../persistence/buyBoxRules";
import { upsertLead } from "../persistence/leads";
import { writeValuationMissSnapshot } from "../persistence/valuationSnapshots";
import { parseFacebookItem, detectFacebookDrift } from "../sources/facebook";
import type { AdapterContext } from "../sources/facebook";
import { writeSchemaDrift } from "../persistence/schemaDrift";
import { computeIdentityKey } from "../dedupe/fingerprint";
import { computeStaleScore } from "../stale/scorer";
import { computeDealScore } from "../scoring/deal";
import { matchBuyBox } from "../scoring/buyBox";
import { computeFreshnessScore, computeSourceConfidenceScore, computeRegionScore, computeFinalScore } from "../scoring/lead";
import { computeHybridBuyBoxScore } from "../scoring/hybrid";
import { computeSegmentProfitScore } from "../scoring/segment";
import { computeRegionDemandScore } from "../scoring/demand";
import { getSegmentAvgMarginPct } from "../persistence/purchaseOutcomes";
import { getDemandScoreForRegion } from "../persistence/marketDemandIndex";
import { insertBuyBoxScoreAttribution } from "../persistence/buyBoxScoreAttributions";
import { getMmrValue } from "../valuation/mmr";
import { getMmrLookupOutcome } from "../valuation/workerClient";
import type { MmrMissReason } from "../valuation/workerClient";
import type { ValuationMethod, NormalizationConfidence } from "../types/domain";
import { getValuationLookupMode } from "../valuation/lookupMode";
import { fromMmrResult } from "../valuation/valuationResult";
import { writeValuationSnapshot } from "../persistence/valuationSnapshots";
import { writeVehicleEnrichment } from "../persistence/vehicleEnrichments";
import { isConfiguredSecret } from "../types/envValidation";
import { log, logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";
import { sendExcellentLeadSummary } from "../alerts/alerts";
import type { ExcellentLeadSummary } from "../alerts/alerts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const BATCH_TIMEOUT_MS = 25_000;
/**
 * Reserved post-loop wall-clock for the `completeSourceRunSafe` update and
 * any cleanup logs. The loop breaks BEFORE consuming this reserve so the
 * source_runs row reliably transitions out of `running` even on a deadline
 * hit, instead of getting stuck while the Worker runtime cancels the
 * inflight Supabase fetch.
 */
const COMPLETION_RESERVE_MS = 1_500;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleIngest(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
  if (!isConfiguredSecret(env.WEBHOOK_HMAC_SECRET)) {
    log("ingest.rejected", { reason: "hmac_secret_not_configured" });
    return json({ ok: false, error: "ingest_auth_not_configured" }, 503);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    log("ingest.rejected", { reason: "payload_too_large", declared_bytes: declaredLength });
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  const bodyBytes = await request.arrayBuffer();

  if (bodyBytes.byteLength > MAX_BODY_BYTES) {
    log("ingest.rejected", { reason: "payload_too_large", actual_bytes: bodyBytes.byteLength });
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  const signature = request.headers.get("x-tav-signature") ?? "";
  const authorized = await verifyHmac(bodyBytes, signature, env.WEBHOOK_HMAC_SECRET);
  if (!authorized) {
    log("ingest.rejected", { reason: "unauthorized" });
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = IngestRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_payload", details: parsed.error.flatten() }, 400);
  }

  return ingestCore(parsed.data, env, execCtx);
}

/**
 * Post-auth ingest pipeline. Accepts an already-validated IngestRequest and
 * executes the source-run idempotency check, raw → normalized → candidate →
 * valuation → scoring → lead loop. Returns the same Response shape as the
 * /ingest route would, so internal callers (e.g. the Apify bridge) can re-emit it.
 *
 * Callers are responsible for authenticating the request and validating the
 * payload against IngestRequestSchema before invoking this function — it does
 * NOT perform HMAC verification or schema parsing.
 */
export async function ingestCore(
  payload: IngestRequest,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const { source, run_id, region, scraped_at, items } = payload;
  const ctx: LogContext = { runId: run_id, source, region };

  log("ingest.started", { item_count: items.length }, ctx);

  const db = getSupabaseClient(env);

  let run;
  try {
    run = await withRetry(() =>
      upsertSourceRun(db, { source, run_id, region, scraped_at, item_count: items.length }),
    );
  } catch (err) {
    logError("persistence", "ingest.source_run_failed", err, ctx);
    return json({ ok: false, error: "service_unavailable" }, 503);
  }

  if (run.status === "completed") {
    log("ingest.idempotent_return", {}, ctx);
    return json({ ok: true, source, run_id, processed: run.processed, rejected: run.rejected, created_leads: run.created_leads }, 200);
  }

  // Deadline-aware loop. We compute a single deadline at loop entry and
  // re-check it BEFORE starting each item — so we never abort an inflight
  // Supabase / Cox call mid-flight, and the `completeSourceRunSafe` write
  // at the bottom always has at least `COMPLETION_RESERVE_MS` to land.
  const loopDeadline = Date.now() + BATCH_TIMEOUT_MS - COMPLETION_RESERVE_MS;

  const adapterCtx: AdapterContext = { region, scrapedAt: scraped_at, sourceRunId: run.id };

  // Buy-box rules cached for this run
  let cachedRules: BuyBoxRule[] | undefined;

  let rawInserted = 0;
  let rejected = 0;
  let createdLeads = 0;
  let itemIndex = 0;
  let truncated = false;
  let itemsSkipped = 0;
  const excellentLeads: ExcellentLeadSummary[] = [];

  try {
    for (const item of items) {
      const i = itemIndex++;
      const itemCtx: LogContext = { ...ctx, itemIndex: i };

      // Hard pre-item deadline check. Items past this point are NOT counted
      // in `rejected` — they simply never attempted. The completion row will
      // record them via `error_message` and `truncated` status instead.
      if (Date.now() >= loopDeadline) {
        truncated = true;
        itemsSkipped = items.length - i;
        log("ingest.batch_deadline_hit", {
          remaining:        itemsSkipped,
          processed_so_far: rawInserted,
          rejected_so_far:  rejected,
          kpi:              true,
        }, ctx);
        break;
      }

      // A: raw insert
      let rawId: string | undefined;
      try {
        const raw = await withRetry(() =>
          insertRawListing(db, { source, source_run_id: run.id, raw_item: item, received_at: new Date().toISOString() }),
        );
        rawId = raw.id;
      } catch (err) {
        logError("persistence", "ingest.raw_insert_failed", err, itemCtx);
        try { await writeDeadLetter(db, env, { source, region, run_id, item_index: i, reason_code: "raw_insert_failed", payload: item, error_message: err instanceof Error ? err.message : String(err) }); } catch { /* never throws */ }
        rejected++;
        continue;
      }

      // B: adapter
      const adapterResult = source === "facebook"
        ? parseFacebookItem(item, adapterCtx)
        : { ok: false as const, reason: "unsupported_source", details: { source } };

      // B.1: schema drift detection — runs regardless of adapter result, never blocks
      if (source === "facebook" && typeof item === "object" && item !== null && !Array.isArray(item)) {
        const driftEvents = detectFacebookDrift(item as Record<string, unknown>);
        if (driftEvents.length > 0) {
          try {
            await Promise.all(
              driftEvents.map(e => writeSchemaDrift(db, { source, source_run_id: run.id, ...e })),
            );
          } catch { /* drift writes are best-effort observability — never block ingest */ }
        }
      }

      if (!adapterResult.ok) {
        await writeFilteredOut(db, env, { source, source_run_id: run_id, reason_code: adapterResult.reason, details: { reason: adapterResult.reason, detail: adapterResult.details, item }, raw_listing_id: rawId });
        rejected++;
        continue;
      }

      const { listing } = adapterResult;
      const listingCtx: LogContext = { ...itemCtx, listingUrl: listing.url };

      // C: normalized listing upsert (atomic RPC)
      let normResult: { id: string; isNew: boolean; priceChanged: boolean; mileageChanged: boolean };
      try {
        normResult = await withRetry(() => upsertNormalizedListing(db, listing, run.id, rawId));
      } catch (err) {
        logError("persistence", "ingest.normalized_upsert_failed", err, listingCtx);
        await writeFilteredOut(db, env, { source, source_run_id: run_id, listing_url: listing.url, reason_code: "normalized_upsert_failed", details: { error: err instanceof Error ? err.message : String(err) }, raw_listing_id: rawId });
        rejected++;
        continue;
      }

      // D: dedupe — link to vehicle_candidate
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
        // Non-fatal: listing is still normalized even without dedupe
      }

      // E: valuation — non-blocking; dealScore stays 0 if MMR is unavailable.
      // MANHEIM_LOOKUP_MODE gates which path runs:
      //   "direct"  → legacy inline Manheim call via src/valuation/mmr.ts (default)
      //   "worker"  → tav-intelligence-worker via src/valuation/workerClient.ts
      //
      // Worker mode returns a discriminated outcome so misses can be persisted
      // with a structured `missing_reason` (mileage_missing, trim_missing,
      // cox_no_data, cox_unavailable, etc.) instead of disappearing silently.
      let mmrResult = null;
      let workerMiss: { reason: MmrMissReason; method: ValuationMethod | null; normalizationConfidence?: NormalizationConfidence } | null = null;
      if (getValuationLookupMode(env) === "direct") {
        try {
          mmrResult = await getMmrValue(
            { vin: listing.vin, year: listing.year, make: listing.make, model: listing.model, mileage: listing.mileage },
            env,
            env.TAV_KV,
          );
        } catch (err) {
          logError("valuation", "ingest.mmr_failed", err, listingCtx);
        }
      } else {
        try {
          const outcome = await getMmrLookupOutcome(
            { vin: listing.vin, year: listing.year, make: listing.make, model: listing.model, trim: listing.trim, mileage: listing.mileage, title: listing.title },
            env,
          );
          if (outcome.kind === "hit") {
            mmrResult = outcome.result;
          } else {
            workerMiss = {
              reason: outcome.reason,
              method: outcome.method,
              ...(outcome.normalizationConfidence && { normalizationConfidence: outcome.normalizationConfidence }),
            };
          }
        } catch (err) {
          logError("valuation", "ingest.mmr_worker_failed", err, listingCtx);
        }
      }

      if (!mmrResult && workerMiss) {
        // Persist the miss for triage. Best-effort — never block ingest.
        try {
          await writeValuationMissSnapshot(db, {
            normalizedListingId: normResult.id,
            vehicleCandidateId:  vcId,
            listing,
            missingReason:       workerMiss.reason,
            method:              workerMiss.method,
            ...(workerMiss.normalizationConfidence && { normalizationConfidence: workerMiss.normalizationConfidence }),
          });
          log("valuation.miss", { missing_reason: workerMiss.reason, method: workerMiss.method, kpi: true }, listingCtx);
        } catch (err) {
          logError("valuation", "ingest.miss_snapshot_failed", err, listingCtx);
        }
      }

      if (mmrResult) {
        try {
          await withRetry(() => writeValuationSnapshot(db, { normalizedListingId: normResult.id, vehicleCandidateId: vcId, listing, valuation: fromMmrResult(mmrResult!) }));
          log("valuation.fetched", { mmr_value: mmrResult.mmrValue, confidence: mmrResult.confidence, kpi: true }, listingCtx);
        } catch (err) {
          logError("valuation", "ingest.snapshot_failed", err, listingCtx);
          try {
            await writeDeadLetter(db, env, { source, region, run_id, item_index: i, reason_code: "valuation_snapshot_failed", payload: { normalizedListingId: normResult.id, mmrValue: mmrResult.mmrValue }, error_message: err instanceof Error ? err.message : String(err) });
          } catch { /* never throws */ }
        }

        // Write normalization enrichment for YMM worker-mode lookups only.
        // Condition: worker mode + YMM path + vcId available + normalization metadata present.
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
                raw_make:               listing.make ?? null,
                raw_model:              listing.model ?? null,
                raw_trim:               listing.trim ?? null,
                lookup_make:            mmrResult.lookupMake ?? null,
                lookup_model:           mmrResult.lookupModel ?? null,
                lookup_trim:            mmrResult.lookupTrim ?? null,
                normalization_confidence: mmrResult.normalizationConfidence,
                trim_sent_to_worker:    false,
              },
            });
          } catch (err) {
            logError("valuation", "ingest.normalization_enrichment_failed", err, listingCtx);
          }
        }
      }

      // F: scoring
      const staleResult = computeStaleScore(new Date(listing.scrapedAt));
      const freshnessScore = computeFreshnessScore(staleResult.score);
      const sourceConfidenceScore = computeSourceConfidenceScore(listing.source);
      const regionScore = computeRegionScore(listing.region);
      const dealScore = computeDealScore(listing.price, mmrResult?.mmrValue);

      if (!cachedRules) {
        try { cachedRules = await fetchActiveBuyBoxRules(db); }
        catch { cachedRules = []; }
      }

      const buyBoxMatch = matchBuyBox(listing, cachedRules, mmrResult?.mmrValue);
      const buyBoxScore = buyBoxMatch?.score ?? 0;

      // Hybrid scoring: when flag is enabled, blend rule score with segment + demand data
      let effectiveBuyBoxScore = buyBoxScore;
      let segmentProfitScore = 50;
      let regionDemandScore = 50;

      if (env.HYBRID_BUYBOX_ENABLED === "true") {
        // Non-blocking: DB failures fall back to neutral (50) — same pattern as MMR
        try {
          const marginPct = await getSegmentAvgMarginPct(db, {
            year: listing.year,
            make: listing.make,
            model: listing.model,
            mileageBucket: listing.mileage != null ? Math.floor(listing.mileage / 10_000) * 10_000 : undefined,
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

        effectiveBuyBoxScore = computeHybridBuyBoxScore(buyBoxScore, segmentProfitScore, regionDemandScore);
      }

      const { finalScore, grade } = computeFinalScore({ dealScore, buyBoxScore: effectiveBuyBoxScore, freshnessScore, regionScore, sourceConfidenceScore });

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

      // F: lead upsert (skip pass-grade listings)
      if (grade !== "pass") {
        try {
          const lead = await withRetry(() =>
            upsertLead(db, { normalizedListingId: normResult.id, vehicleCandidateId: vcId, listing, scored, mmrValue: mmrResult?.mmrValue, matchedRuleDbId: buyBoxMatch?.ruleDbId, scoreComponents }),
          );
          if (lead.created) {
            createdLeads++;
            log("lead.created", { lead_id: lead.id, grade, final_score: finalScore, matched_rule: buyBoxMatch?.ruleId, kpi: true }, listingCtx);
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

            // Non-blocking attribution write — analytics only
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
          // Non-fatal: listing is normalized even if lead write fails
        }
      }

      rawInserted++;
    }
  } finally {
    // Always emit a terminal source_runs row, even on truncation or
    // mid-loop throw. waitUntil keeps the Worker alive past the response
    // so completion has the reserved post-deadline budget.
    const status        = truncated ? "truncated" : "completed";
    const error_message = truncated ? `batch_truncated:${itemsSkipped}_items_skipped` : null;
    execCtx.waitUntil(
      completeSourceRunSafe(
        db,
        run.id,
        {
          processed:     rawInserted,
          rejected,
          created_leads: createdLeads,
          status,
          error_message,
        },
        (event, fields) => log(event, fields ?? {}, ctx),
      ),
    );
  }

  log("ingest.complete", {
    processed: rawInserted,
    rejected,
    created_leads: createdLeads,
    ...(truncated && { truncated: true, items_skipped: itemsSkipped }),
    kpi: true,
  }, ctx);

  if (excellentLeads.length > 0) {
    execCtx.waitUntil(sendExcellentLeadSummary(env, excellentLeads, { runId: run_id, source }));
  }

  return json({
    ok: true,
    source,
    run_id,
    processed: rawInserted,
    rejected,
    created_leads: createdLeads,
    ...(truncated && { truncated: true, items_skipped: itemsSkipped }),
  }, 200);
}
