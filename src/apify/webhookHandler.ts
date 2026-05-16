import type { Env } from "../types/env";
import { IngestRequestSchema, MAX_INGEST_ITEMS, type IngestRequest } from "../validate";
import { ApifyWebhookPayloadSchema, isSucceededEvent } from "./payloadSchema";
import { mapApifyTaskToRegion } from "./regionMap";
import {
  fetchApifyDatasetItems,
  fetchApifyRunDefaultDataset,
  ApifyAuthError,
  ApifyDatasetFetchError,
  MAX_ITEMS_PER_RUN,
} from "./datasetFetch";
import { mapRaidrApiItem } from "./payloadAdapter";
import { ingestCore } from "../ingest/handleIngest";
import { isConfiguredSecret } from "../types/envValidation";
import { verifyBearer } from "../auth/bearerAuth";
import { log, logError } from "../logging/logger";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /apify-webhook — bridge from Apify task webhooks to the canonical
 * /ingest pipeline.
 *
 * Flow:
 *   1. Feature flag + bearer auth.
 *   2. Validate Apify webhook payload schema (no HMAC — Apify doesn't sign).
 *   3. Filter event type: only ACTOR.RUN.SUCCEEDED triggers ingest; others noop.
 *   4. Map actorTaskId → TAV region; unmapped tasks noop.
 *   5. Resolve datasetId from payload, falling back to GET /actor-runs/{id}.
 *   6. Fetch dataset items (paginated, capped).
 *   7. Empty dataset → noop (matches existing IngestRequestSchema `min(1)`).
 *   8. Build IngestRequest envelope and call ingestCore.
 *
 * All non-2xx responses log a structured event; secrets and full Apify
 * payloads are never logged.
 */
export async function handleApifyWebhook(
  request: Request,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  // 1a. Feature flag.
  if (env.APIFY_WEBHOOK_ENABLED !== "true") {
    log("apify.bridge.disabled");
    return json({ ok: false, error: "apify_bridge_disabled" }, 503);
  }

  // 1b. Bearer secret configured?
  if (!isConfiguredSecret(env.APIFY_WEBHOOK_SECRET)) {
    log("apify.bridge.rejected", { reason: "secret_not_configured" });
    return json({ ok: false, error: "apify_auth_not_configured" }, 503);
  }

  // 1c. Verify Authorization: Bearer <APIFY_WEBHOOK_SECRET> via the shared
  //     constant-time helper.
  if (!verifyBearer(request, env.APIFY_WEBHOOK_SECRET)) {
    log("apify.bridge.rejected", { reason: "bad_bearer" });
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // 2. Parse + validate Apify payload.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    log("apify.bridge.rejected", { reason: "invalid_json" });
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = ApifyWebhookPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    log("apify.bridge.rejected", { reason: "invalid_payload", issues: parsed.error.issues.slice(0, 5) });
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  const { eventType, resource } = parsed.data;
  const runId = resource.id;
  const actorTaskId = resource.actorTaskId;

  log("apify.bridge.received", { event_type: eventType, run_id: runId, actor_task_id: actorTaskId });

  // 3. Event filter — only SUCCEEDED triggers ingest.
  if (!isSucceededEvent(eventType)) {
    log("apify.bridge.event_skipped", { event_type: eventType, run_id: runId });
    return json({ ok: true, skipped: "event_type_ignored", event_type: eventType }, 200);
  }

  // 4. Task → region map.
  if (!actorTaskId) {
    log("apify.bridge.rejected", { reason: "missing_actor_task_id", run_id: runId });
    return json({ ok: false, error: "missing_actor_task_id" }, 400);
  }
  const region = mapApifyTaskToRegion(actorTaskId);
  if (region === null) {
    log("apify.bridge.unmapped_task", { actor_task_id: actorTaskId, run_id: runId });
    return json({ ok: true, skipped: "unmapped_task", actor_task_id: actorTaskId }, 200);
  }

  // 5. Resolve datasetId (payload first, then fallback to run detail).
  let datasetId = resource.defaultDatasetId;
  if (!datasetId) {
    try {
      datasetId = await fetchApifyRunDefaultDataset(runId, env);
      log("apify.bridge.dataset_resolved_via_run", { run_id: runId, dataset_id: datasetId });
    } catch (err) {
      return handleApifyFetchError(err, runId);
    }
  }

  // 6. Fetch dataset items.
  let items: unknown[];
  let truncated = false;
  try {
    const result = await fetchApifyDatasetItems(datasetId, env);
    items = result.items;
    truncated = result.truncated;
  } catch (err) {
    return handleApifyFetchError(err, runId);
  }
  if (truncated) {
    log("apify.bridge.truncated", { run_id: runId, dataset_id: datasetId, cap: MAX_ITEMS_PER_RUN });
  }

  // 7. Empty dataset → noop.
  if (items.length === 0) {
    log("apify.bridge.empty_dataset", { run_id: runId, dataset_id: datasetId });
    return json({ ok: true, skipped: "empty_dataset", run_id: runId, dataset_id: datasetId }, 200);
  }

  // 8. Map each raidr-api dataset item into the v1 flat shape the Facebook
  //    adapter expects. Without this, every item rejects at the adapter's
  //    extractUrl gate with missing_identifier because the rented actor
  //    emits Facebook GraphQL fields (marketplace_listing_title,
  //    listing_price.amount, listing_date_ms, …) instead of url/title/price.
  const mappedItems = items.map(mapRaidrApiItem);

  // 9. Enforce the shared ingest contract. The bridge previously handed up to
  //    MAX_ITEMS_PER_RUN items straight to ingestCore, bypassing
  //    IngestRequestSchema's MAX_INGEST_ITEMS cap. Cap here, log when we do,
  //    then validate the envelope through the same schema the HTTP /ingest
  //    path uses so the bridge can never silently exceed the limit.
  const cappedItems =
    mappedItems.length > MAX_INGEST_ITEMS
      ? mappedItems.slice(0, MAX_INGEST_ITEMS)
      : mappedItems;
  if (mappedItems.length > MAX_INGEST_ITEMS) {
    log("apify.bridge.item_cap_applied", {
      run_id:     runId,
      dataset_id: datasetId,
      received:   mappedItems.length,
      cap:        MAX_INGEST_ITEMS,
    });
  }

  // scraped_at falls back to now() when Apify didn't stamp finishedAt
  // (defensive — finishedAt should always be present on a SUCCEEDED run).
  const scrapedAt = resource.finishedAt ?? new Date().toISOString();
  const candidate = {
    source:     "facebook",
    run_id:     runId,
    region,
    scraped_at: scrapedAt,
    items:      cappedItems,
  };

  const validated = IngestRequestSchema.safeParse(candidate);
  if (!validated.success) {
    log("apify.bridge.contract_violation", {
      run_id: runId,
      issues: validated.error.issues.slice(0, 5),
    });
    return json({ ok: false, error: "ingest_contract_violation", run_id: runId }, 400);
  }
  const envelope: IngestRequest = validated.data;

  log("apify.bridge.dispatched", {
    run_id:     runId,
    region,
    item_count: envelope.items.length,
    dataset_id: datasetId,
  });

  return ingestCore(envelope, env, execCtx);
}

/**
 * Maps an Apify fetch error to an HTTP response without leaking internals.
 * Caller has already chosen to bail out; this just standardizes the response
 * and logs the failure.
 */
function handleApifyFetchError(err: unknown, runId: string): Response {
  if (err instanceof ApifyAuthError) {
    logError("apify", "apify.bridge.upstream_auth_failed", err, { runId });
    return json({ ok: false, error: "apify_upstream_auth_failed", run_id: runId }, 502);
  }
  if (err instanceof ApifyDatasetFetchError) {
    logError("apify", "apify.bridge.upstream_failed", err, { runId });
    return json({ ok: false, error: "apify_upstream_failed", run_id: runId }, 502);
  }
  logError("apify", "apify.bridge.unexpected_fetch_error", err, { runId });
  return json({ ok: false, error: "apify_upstream_error", run_id: runId }, 502);
}
