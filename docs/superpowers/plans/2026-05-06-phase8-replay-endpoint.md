# Phase 8 Plan — Replay Endpoint (POST /replay)

**Goal:** Let an operator (or the normalizer service) re-push raw listings already in the DB back through the normalize → dedupe → score → lead pipeline without re-scraping. Primary use cases: adapter logic fix applied retroactively, buy-box rule change that should re-grade existing listings.

**Auth:** `Authorization: Bearer NORMALIZER_SECRET` — distinct from `ADMIN_API_SECRET` so the normalizer service has its own credential surface.

**Verified pre-conditions:** All persistence functions used here (upsertNormalizedListing, upsertVehicleCandidate, upsertLead, etc.) are idempotent. Replay is safe to call multiple times on the same raw listing IDs.

---

## 1. Zod Schema — `src/validate.ts`

Add after `IngestRequestSchema`:

```typescript
export const ReplayRequestSchema = z.object({
  // Exactly one of these must be present.
  raw_listing_ids: z.array(z.string().uuid()).min(1).max(500).optional(),
  source_run_id:   z.string().uuid().optional(),
  // Pass true to skip Manheim API calls (saves quota during bulk re-grades).
  skip_valuation:  z.boolean().optional().default(false),
}).refine(
  (d) => (d.raw_listing_ids != null) !== (d.source_run_id != null),
  { message: "Provide exactly one of raw_listing_ids or source_run_id" },
);

export type ReplayRequest = z.infer<typeof ReplayRequestSchema>;
```

---

## 2. New Persistence Functions — `src/persistence/rawListings.ts`

Append two fetch functions. Both join source_runs to pull region + scraped_at — the adapter needs these and they're not stored on the raw_listing row itself.

```typescript
export interface RawListingForReplay {
  id: string;
  source: string;
  rawItem: unknown;
  receivedAt: string;
  region: string;
  scrapedAt: string;
  runId: string;
  sourceRunId: string;
}

function toReplayRow(row: Record<string, unknown>): RawListingForReplay {
  const sr = row["source_runs"] as Record<string, unknown>;
  return {
    id:          row["id"] as string,
    source:      row["source"] as string,
    rawItem:     row["raw_item"],
    receivedAt:  row["received_at"] as string,
    region:      sr["region"] as string,
    scrapedAt:   sr["scraped_at"] as string,
    runId:       sr["run_id"] as string,
    sourceRunId: row["source_run_id"] as string,
  };
}

export async function getRawListingsByIds(
  db: SupabaseClient,
  ids: string[],
): Promise<RawListingForReplay[]> {
  const { data, error } = await db
    .from("raw_listings")
    .select("id, source, raw_item, received_at, source_run_id, source_runs!inner(region, scraped_at, run_id)")
    .in("id", ids);
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(toReplayRow);
}

export async function getRawListingsBySourceRunId(
  db: SupabaseClient,
  sourceRunId: string,
): Promise<RawListingForReplay[]> {
  const { data, error } = await db
    .from("raw_listings")
    .select("id, source, raw_item, received_at, source_run_id, source_runs!inner(region, scraped_at, run_id)")
    .eq("source_run_id", sourceRunId);
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(toReplayRow);
}
```

---

## 3. Handler — `src/ingest/handleReplay.ts`

New file. Mirrors handleIngest item-loop structure; skip stages A (raw insert) and the source-run upsert.

```typescript
import type { Env } from "../types/env";
import type { BuyBoxRule, ScoredLead } from "../types/domain";
import { ReplayRequestSchema } from "../validate";
import { getSupabaseClient } from "../persistence/supabase";
import { withRetry } from "../persistence/retry";
import { getRawListingsByIds, getRawListingsBySourceRunId } from "../persistence/rawListings";
import { writeDeadLetter } from "../persistence/deadLetter";
import { writeFilteredOut } from "../persistence/filteredOut";
import { upsertNormalizedListing } from "../persistence/normalizedListings";
import { upsertVehicleCandidate } from "../persistence/vehicleCandidates";
import { linkNormalizedListingToCandidate } from "../persistence/duplicateGroups";
import { fetchActiveBuyBoxRules } from "../persistence/buyBoxRules";
import { upsertLead } from "../persistence/leads";
import { writeSchemaDrift } from "../persistence/schemaDrift";
import { parseFacebookItem, detectFacebookDrift } from "../sources/facebook";
import type { AdapterContext } from "../sources/facebook";
import { computeIdentityKey } from "../dedupe/fingerprint";
import { computeStaleScore } from "../stale/scorer";
import { computeDealScore } from "../scoring/deal";
import { matchBuyBox } from "../scoring/buybox";
import { computeFreshnessScore, computeSourceConfidenceScore, computeRegionScore, computeFinalScore } from "../scoring/lead";
import { computeHybridBuyBoxScore } from "../scoring/hybrid";
import { computeSegmentProfitScore } from "../scoring/segment";
import { computeRegionDemandScore } from "../scoring/demand";
import { getSegmentAvgMarginPct } from "../persistence/purchaseOutcomes";
import { getDemandScoreForRegion } from "../persistence/marketDemandIndex";
import { insertBuyBoxScoreAttribution } from "../persistence/buyBoxScoreAttributions";
import { getMmrValue } from "../valuation/mmr";
import { writeValuationSnapshot } from "../persistence/valuationSnapshots";
import { log, logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";
import { sendExcellentLeadSummary } from "../alerts/alerts";
import type { ExcellentLeadSummary } from "../alerts/alerts";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function verifyAuth(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization") ?? "";
  return auth === `Bearer ${env.NORMALIZER_SECRET}`;
}

export async function handleReplay(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  if (!verifyAuth(request, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = ReplayRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_payload", details: parsed.error.flatten() }, 400);
  }

  const { raw_listing_ids, source_run_id, skip_valuation } = parsed.data;
  const db = getSupabaseClient(env);

  let rawListings;
  try {
    rawListings = raw_listing_ids
      ? await withRetry(() => getRawListingsByIds(db, raw_listing_ids))
      : await withRetry(() => getRawListingsBySourceRunId(db, source_run_id!));
  } catch (err) {
    logError("persistence", "replay.fetch_raw_failed", err);
    return json({ ok: false, error: "service_unavailable" }, 503);
  }

  if (rawListings.length === 0) {
    return json({ ok: false, error: "no_listings_found" }, 404);
  }

  const ctx: LogContext = { source: rawListings[0].source };
  log("replay.started", { count: rawListings.length }, ctx);

  let cachedRules: BuyBoxRule[] | undefined;
  let replayed = 0;
  let rejected = 0;
  let createdLeads = 0;
  const excellentLeads: ExcellentLeadSummary[] = [];

  for (const raw of rawListings) {
    const itemCtx: LogContext = { source: raw.source, region: raw.region };
    const adapterCtx: AdapterContext = {
      region: raw.region,
      scrapedAt: raw.scrapedAt,
      sourceRunId: raw.sourceRunId,
    };

    // B: adapter
    const adapterResult = raw.source === "facebook"
      ? parseFacebookItem(raw.rawItem, adapterCtx)
      : { ok: false as const, reason: "unsupported_source", details: { source: raw.source } };

    // B.1: schema drift detection
    if (raw.source === "facebook" && typeof raw.rawItem === "object" && raw.rawItem !== null && !Array.isArray(raw.rawItem)) {
      const driftEvents = detectFacebookDrift(raw.rawItem as Record<string, unknown>);
      if (driftEvents.length > 0) {
        try {
          await Promise.all(
            driftEvents.map(e => writeSchemaDrift(db, { source: raw.source, source_run_id: raw.sourceRunId, ...e })),
          );
        } catch { /* best-effort */ }
      }
    }

    if (!adapterResult.ok) {
      await writeFilteredOut(db, env, { source: raw.source, source_run_id: raw.runId, reason_code: adapterResult.reason, details: { reason: adapterResult.reason, detail: adapterResult.details }, raw_listing_id: raw.id });
      rejected++;
      continue;
    }

    const { listing } = adapterResult;
    const listingCtx: LogContext = { ...itemCtx, listingUrl: listing.url };

    // C: normalized listing upsert
    let normResult: { id: string; isNew: boolean; priceChanged: boolean; mileageChanged: boolean };
    try {
      normResult = await withRetry(() => upsertNormalizedListing(db, listing, raw.sourceRunId, raw.id));
    } catch (err) {
      logError("persistence", "replay.normalized_upsert_failed", err, listingCtx);
      rejected++;
      continue;
    }

    // D: dedupe
    let vcId: string | undefined;
    try {
      const identityKey = computeIdentityKey(listing);
      const vc = await withRetry(() => upsertVehicleCandidate(db, identityKey, listing));
      vcId = vc.id;
      await withRetry(() => linkNormalizedListingToCandidate(db, vc.id, normResult.id, "exact", 1.0, vc.isNew));
    } catch (err) {
      logError("dedupe", "replay.dedupe_failed", err, listingCtx);
    }

    // E: valuation
    let mmrResult = null;
    if (!skip_valuation) {
      try {
        mmrResult = await getMmrValue(
          { vin: listing.vin, year: listing.year, make: listing.make, model: listing.model, mileage: listing.mileage },
          env,
          env.TAV_KV,
        );
      } catch (err) {
        logError("valuation", "replay.mmr_failed", err, listingCtx);
      }

      if (mmrResult) {
        try {
          await withRetry(() => writeValuationSnapshot(db, { normalizedListingId: normResult.id, vehicleCandidateId: vcId, listing, mmrResult: mmrResult! }));
        } catch (err) {
          logError("valuation", "replay.snapshot_failed", err, listingCtx);
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

    let effectiveBuyBoxScore = buyBoxScore;
    let segmentProfitScore = 50;
    let regionDemandScore = 50;

    if (env.HYBRID_BUYBOX_ENABLED === "true") {
      try {
        const marginPct = await getSegmentAvgMarginPct(db, {
          year: listing.year, make: listing.make, model: listing.model,
          mileageBucket: listing.mileage != null ? Math.floor(listing.mileage / 10_000) * 10_000 : undefined,
        });
        segmentProfitScore = computeSegmentProfitScore(marginPct);
      } catch (err) {
        logError("scoring", "replay.segment_score_failed", err, listingCtx);
      }

      try {
        const demandScore = await getDemandScoreForRegion(db, listing.region ?? "", null);
        regionDemandScore = computeRegionDemandScore(demandScore);
      } catch (err) {
        logError("scoring", "replay.demand_score_failed", err, listingCtx);
      }

      effectiveBuyBoxScore = computeHybridBuyBoxScore(buyBoxScore, segmentProfitScore, regionDemandScore);
    }

    const { finalScore, grade } = computeFinalScore({ dealScore, buyBoxScore: effectiveBuyBoxScore, freshnessScore, regionScore, sourceConfidenceScore });

    const scoreComponents: Record<string, unknown> = {
      rule_score: buyBoxScore, segment_score: segmentProfitScore, demand_score: regionDemandScore,
      hybrid_score: effectiveBuyBoxScore, deal_score: dealScore, freshness_score: freshnessScore,
      region_score: regionScore, source_confidence_score: sourceConfidenceScore,
    };

    const scored: ScoredLead = {
      dealScore, buyBoxScore: effectiveBuyBoxScore, freshnessScore, regionScore, sourceConfidenceScore,
      finalScore, grade, reasonCodes: [],
      matchedRuleId: buyBoxMatch?.ruleId, matchedRuleVersion: buyBoxMatch?.ruleVersion,
      valuationConfidence: mmrResult?.confidence ?? "none",
    };

    // G: lead upsert
    if (grade !== "pass") {
      try {
        const lead = await withRetry(() =>
          upsertLead(db, { normalizedListingId: normResult.id, vehicleCandidateId: vcId, listing, scored, mmrValue: mmrResult?.mmrValue, matchedRuleDbId: buyBoxMatch?.ruleDbId, scoreComponents }),
        );
        if (lead.created) {
          createdLeads++;
          log("lead.created", { lead_id: lead.id, grade, final_score: finalScore, replay: true, kpi: true }, listingCtx);
          if (grade === "excellent") {
            excellentLeads.push({
              leadId: lead.id, finalScore,
              year: listing.year, make: listing.make, model: listing.model,
              region: listing.region ?? raw.region,
              listingUrl: listing.url, listingPrice: listing.price,
            });
          }
          try {
            await insertBuyBoxScoreAttribution(db, {
              leadId: lead.id, ruleId: buyBoxMatch?.ruleId ?? null, ruleVersion: buyBoxMatch?.ruleVersion ?? null,
              ruleScore: buyBoxScore,
              segmentScore: env.HYBRID_BUYBOX_ENABLED === "true" ? segmentProfitScore : null,
              demandScore: env.HYBRID_BUYBOX_ENABLED === "true" ? regionDemandScore : null,
              hybridScore: effectiveBuyBoxScore, components: scoreComponents,
            });
          } catch (err) {
            logError("scoring", "replay.attribution_failed", err, listingCtx);
          }
        }
      } catch (err) {
        logError("lead", "replay.lead_upsert_failed", err, listingCtx);
      }
    }

    replayed++;
  }

  log("replay.complete", { replayed, rejected, created_leads: createdLeads, kpi: true }, ctx);

  if (excellentLeads.length > 0) {
    execCtx.waitUntil(
      sendExcellentLeadSummary(env, excellentLeads, { runId: source_run_id ?? "replay", source: rawListings[0].source }),
    );
  }

  return json({ ok: true, replayed, rejected, created_leads: createdLeads }, 200);
}
```

---

## 4. Wire in `src/index.ts`

```typescript
// add import at top:
import { handleReplay } from "./ingest/handleReplay";

// add route before the admin block:
if (request.method === "POST" && url.pathname === "/replay") {
  return handleReplay(request, env, ctx);
}
```

---

## 5. Tests — `test/replay.test.ts`

Mirror the ingest test structure. Key cases:

| Test | Assertion |
|---|---|
| valid request with raw_listing_ids | 200, `replayed: 1`, correct DB call sequence |
| valid request with source_run_id | 200, fetches by run ID not ids |
| both raw_listing_ids + source_run_id | 400 invalid_payload |
| neither provided | 400 invalid_payload |
| missing Authorization header | 401 |
| wrong Bearer token | 401 |
| getRawListingsByIds returns empty | 404 no_listings_found |
| DB fetch throws | 503 |
| adapter returns !ok | replayed=0, rejected=1, writeFilteredOut called |
| grade excellent → waitUntil + sendExcellentLeadSummary | assert waitUntil spy called |
| grade good → NO waitUntil | assert waitUntil spy NOT called |
| skip_valuation: true → getMmrValue NOT called | mock getMmrValue, assert not called |
| normalized upsert throws → rejected++ but continues | replayed=0, rejected=1, 200 |

Mocks needed (same pattern as ingest.test.ts):
- `../src/persistence/supabase`
- `../src/persistence/rawListings` — mock `getRawListingsByIds`, `getRawListingsBySourceRunId`
- `../src/persistence/normalizedListings`
- `../src/persistence/vehicleCandidates`
- `../src/persistence/duplicateGroups`
- `../src/persistence/buyBoxRules`
- `../src/persistence/leads`
- `../src/persistence/schemaDrift`
- `../src/persistence/buyBoxScoreAttributions`
- `../src/persistence/filteredOut`
- `../src/persistence/deadLetter`
- `../src/persistence/valuationSnapshots`
- `../src/persistence/purchaseOutcomes`
- `../src/persistence/marketDemandIndex`
- `../src/valuation/mmr`
- `../src/alerts/alerts`
- `../src/scoring/lead` (partial, preserve actual via vi.importActual)

Default mock return for `getRawListingsByIds`:
```typescript
const RAW = {
  id: "raw-uuid",
  source: "facebook",
  rawItem: { url: "https://fb.com/item/123", title: "2020 Toyota Camry SE, 62k miles, $18,500" },
  receivedAt: new Date().toISOString(),
  region: "dallas_tx",
  scrapedAt: new Date().toISOString(),
  runId: "run-001",
  sourceRunId: "source-run-uuid",
};
vi.mocked(getRawListingsByIds).mockResolvedValue([RAW]);
vi.mocked(getRawListingsBySourceRunId).mockResolvedValue([RAW]);
```

---

## 6. Commit Plan

```
feat: phase 8 — replay endpoint POST /replay
  - ReplayRequestSchema in src/validate.ts
  - getRawListingsByIds + getRawListingsBySourceRunId in src/persistence/rawListings.ts
  - src/ingest/handleReplay.ts
  - Route wired in src/index.ts
  - test/replay.test.ts (13 tests)
```

Single commit after verification loop passes.

---

## 7. Edge Cases and Decisions

**raw_listing_ids not found in DB:** `getRawListingsByIds` returns fewer rows than requested — no error, just processes what's there. The caller gets back an accurate `replayed` count.

**source_run_id with no source_run record:** Supabase returns 0 rows → 404 `no_listings_found`.

**Mixed sources in a source_run:** Currently only facebook is supported. Non-facebook items hit the `unsupported_source` branch, get written to filtered_out, increment rejected. No crash.

**Timeout risk:** No BATCH_TIMEOUT_MS guard here — replay is a synchronous admin/service operation, not a real-time ingest. If the batch is large (max 500), p99 latency is acceptable. Add a note in RUNBOOK.md.

**`skip_valuation: true` use case:** Bulk re-grading after a buy-box rule change where MMR data is already in valuation_snapshots. Saves Manheim API quota.

**`created_leads` vs updated leads:** `upsertLead` uses ON CONFLICT DO UPDATE — if the listing was previously pass-grade and is now excellent after a rule change, `created: true` only fires on first insert. A future `updated_leads` counter would require `upsertLead` to return an `updated` flag. Not in scope for Phase 8.
