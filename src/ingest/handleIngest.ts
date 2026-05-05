import type { Env } from "../types/env";
import type { BuyBoxRule, ScoredLead } from "../types/domain";
import { verifyHmac } from "../auth/hmac";
import { IngestRequestSchema } from "../validate";
import { getSupabaseClient } from "../persistence/supabase";
import { withRetry } from "../persistence/retry";
import { upsertSourceRun, completeSourceRun } from "../persistence/sourceRuns";
import { insertRawListing } from "../persistence/rawListings";
import { writeDeadLetter } from "../persistence/deadLetter";
import { writeFilteredOut } from "../persistence/filteredOut";
import { upsertNormalizedListing } from "../persistence/normalizedListings";
import { upsertVehicleCandidate } from "../persistence/vehicleCandidates";
import { linkNormalizedListingToCandidate } from "../persistence/duplicateGroups";
import { fetchActiveBuyBoxRules } from "../persistence/buyBoxRules";
import { upsertLead } from "../persistence/leads";
import { parseFacebookItem, detectFacebookDrift } from "../sources/facebook";
import type { AdapterContext } from "../sources/facebook";
import { writeSchemaDrift } from "../persistence/schemaDrift";
import { computeIdentityKey } from "../dedupe/fingerprint";
import { computeStaleScore } from "../stale/scorer";
import { computeDealScore } from "../scoring/deal";
import { matchBuyBox } from "../scoring/buybox";
import { computeFreshnessScore, computeSourceConfidenceScore, computeRegionScore, computeFinalScore } from "../scoring/lead";
import { log, logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const BATCH_TIMEOUT_MS = 25_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleIngest(request: Request, env: Env): Promise<Response> {
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

  const { source, run_id, region, scraped_at, items } = parsed.data;
  const ctx: LogContext = { runId: run_id, source, region };

  log("ingest.started", { item_count: items.length }, ctx);

  const db = getSupabaseClient(env);

  let run;
  try {
    run = await upsertSourceRun(db, { source, run_id, region, scraped_at, item_count: items.length });
  } catch (err) {
    logError("persistence", "ingest.source_run_failed", err, ctx);
    return json({ ok: false, error: "service_unavailable" }, 503);
  }

  if (run.status === "completed") {
    log("ingest.idempotent_return", {}, ctx);
    return json({ ok: true, source, run_id, processed: run.processed, rejected: run.rejected, created_leads: run.created_leads }, 200);
  }

  const controller = new AbortController();
  const batchTimer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);

  const adapterCtx: AdapterContext = { region, scrapedAt: scraped_at, sourceRunId: run.id };

  // Buy-box rules cached for this run
  let cachedRules: BuyBoxRule[] | undefined;

  let rawInserted = 0;
  let rejected = 0;
  let createdLeads = 0;
  let itemIndex = 0;

  try {
    for (const item of items) {
      const i = itemIndex++;
      const itemCtx: LogContext = { ...ctx, itemIndex: i };

      if (controller.signal.aborted) {
        try {
          await writeDeadLetter(db, env, { source, region, run_id, item_index: i, reason_code: "batch_timeout", payload: item, error_message: "batch loop aborted: timeout exceeded" });
        } catch { /* never throws */ }
        rejected++;
        continue;
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

      // E: scoring
      const staleResult = computeStaleScore(new Date(listing.scrapedAt));
      const freshnessScore = computeFreshnessScore(staleResult.score);
      const sourceConfidenceScore = computeSourceConfidenceScore(listing.source);
      const regionScore = computeRegionScore(listing.region);
      const dealScore = computeDealScore(listing.price, undefined); // MMR not yet available

      if (!cachedRules) {
        try { cachedRules = await fetchActiveBuyBoxRules(db); }
        catch { cachedRules = []; }
      }

      const buyBoxMatch = matchBuyBox(listing, cachedRules);
      const buyBoxScore = buyBoxMatch?.score ?? 0;

      const { finalScore, grade } = computeFinalScore({ dealScore, buyBoxScore, freshnessScore, regionScore, sourceConfidenceScore });

      const scored: ScoredLead = {
        dealScore,
        buyBoxScore,
        freshnessScore,
        regionScore,
        sourceConfidenceScore,
        finalScore,
        grade,
        reasonCodes: [],
        matchedRuleId: buyBoxMatch?.ruleId,
        matchedRuleVersion: buyBoxMatch?.ruleVersion,
        valuationConfidence: "none",
      };

      // F: lead upsert (skip pass-grade listings)
      if (grade !== "pass") {
        try {
          const lead = await withRetry(() =>
            upsertLead(db, { normalizedListingId: normResult.id, vehicleCandidateId: vcId, listing, scored, matchedRuleDbId: buyBoxMatch?.ruleDbId }),
          );
          if (lead.created) {
            createdLeads++;
            log("lead.created", { lead_id: lead.id, grade, final_score: finalScore, matched_rule: buyBoxMatch?.ruleId, kpi: true }, listingCtx);
          }
        } catch (err) {
          logError("lead", "ingest.lead_upsert_failed", err, listingCtx);
          // Non-fatal: listing is normalized even if lead write fails
        }
      }

      rawInserted++;
    }
  } finally {
    clearTimeout(batchTimer);
  }

  try {
    await withRetry(() => completeSourceRun(db, run.id, { processed: rawInserted, rejected, created_leads: createdLeads }));
  } catch (err) {
    logError("persistence", "ingest.run_complete_failed", err, ctx);
  }

  log("ingest.complete", { processed: rawInserted, rejected, created_leads: createdLeads, kpi: true }, ctx);

  return json({ ok: true, source, run_id, processed: rawInserted, rejected, created_leads: createdLeads }, 200);
}

