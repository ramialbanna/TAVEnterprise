import type { Env } from "../types/env";
import { verifyHmac } from "../auth/hmac";
import { IngestRequestSchema } from "../validate";
import { getSupabaseClient } from "../persistence/supabase";
import { withRetry } from "../persistence/retry";
import { upsertSourceRun, completeSourceRun } from "../persistence/sourceRuns";
import { insertRawListing } from "../persistence/rawListings";
import { writeDeadLetter } from "../persistence/deadLetter";
import { writeFilteredOut } from "../persistence/filteredOut";
import { upsertNormalizedListing } from "../persistence/normalizedListings";
import { parseFacebookItem } from "../sources/facebook";
import type { AdapterContext } from "../sources/facebook";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleIngest(request: Request, env: Env): Promise<Response> {
  // 1. Fast-path size guard via Content-Length header (before reading body).
  //    Checked before HMAC to prevent buffering unbounded payloads.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.rejected", reason: "payload_too_large", declared_bytes: declaredLength }));
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  // 2. Read body once — reused for both HMAC and JSON parse.
  const bodyBytes = await request.arrayBuffer();

  // 3. Actual size guard (Content-Length may be absent or spoofed).
  if (bodyBytes.byteLength > MAX_BODY_BYTES) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.rejected", reason: "payload_too_large", actual_bytes: bodyBytes.byteLength }));
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  // 4. HMAC verification — timing-safe, before any data is parsed or written.
  const signature = request.headers.get("x-tav-signature") ?? "";
  const authorized = await verifyHmac(bodyBytes, signature, env.WEBHOOK_HMAC_SECRET);
  if (!authorized) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.rejected", reason: "unauthorized" }));
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // 5. JSON parse.
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // 6. Wrapper schema validation.
  const parsed = IngestRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_payload", details: parsed.error.flatten() }, 400);
  }

  const { source, run_id, region, scraped_at, items } = parsed.data;

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "ingest.started", source, run_id, region, item_count: items.length }));

  const db = getSupabaseClient(env);

  // 7. Upsert source_run. Failure here is fatal for the request. No retry —
  //    the SELECT+upsert pair is not idempotent-safe to retry blindly.
  let run;
  try {
    run = await upsertSourceRun(db, { source, run_id, region, scraped_at, item_count: items.length });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.error", reason: "source_run_failed", error: String(err) }));
    return json({ ok: false, error: "service_unavailable" }, 503);
  }

  // 8. Idempotency gate — return stored counters for a completed run.
  if (run.status === "completed") {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.idempotent_return", source, run_id }));
    return json({
      ok: true,
      source,
      run_id,
      processed: run.processed,
      rejected: run.rejected,
      created_leads: run.created_leads,
    }, 200);
  }

  // 9. Batch loop — raw insert → adapter → normalized_listing or filtered_out.
  //    Aborts after 25 s to stay within CF Worker CPU budget.
  //    Item failures go to dead_letters; the batch always runs to completion.
  const BATCH_TIMEOUT_MS = 25_000;
  const controller = new AbortController();
  const batchTimer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);

  const adapterCtx: AdapterContext = { region, scrapedAt: scraped_at, sourceRunId: run.id };

  let rawInserted = 0;
  let rejected = 0;

  let itemIndex = 0;
  try {
    for (const item of items) {
      const i = itemIndex++;

      if (controller.signal.aborted) {
        try {
          await writeDeadLetter(db, env, {
            source, region, run_id, item_index: i,
            reason_code: "batch_timeout", payload: item,
            error_message: "batch loop aborted: timeout exceeded",
          });
        } catch { /* never throws */ }
        rejected++;
        continue;
      }

      // Step A: persist raw listing (audit trail, always first).
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
        try {
          await writeDeadLetter(db, env, {
            source, region, run_id, item_index: i,
            reason_code: "raw_insert_failed", payload: item,
            error_message: err instanceof Error ? err.message : String(err),
          });
        } catch { /* never throws */ }
        rejected++;
        continue;
      }

      // Step B: run source adapter (pure, no I/O).
      const adapterResult = source === "facebook"
        ? parseFacebookItem(item, adapterCtx)
        : { ok: false as const, reason: "unsupported_source", details: { source } };

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

      // Step C: upsert normalized listing.
      try {
        await withRetry(() =>
          upsertNormalizedListing(db, adapterResult.listing, run.id),
        );
        rawInserted++;
      } catch (err) {
        await writeFilteredOut(db, env, {
          source,
          source_run_id: run_id,
          listing_url: adapterResult.listing.url,
          reason_code: "normalized_upsert_failed",
          details: { error: err instanceof Error ? err.message : String(err) },
          raw_listing_id: rawId,
        });
        rejected++;
      }
    }
  } finally {
    clearTimeout(batchTimer);
  }

  // 10. Mark run complete. Non-fatal if this fails — response still returns.
  try {
    await withRetry(() =>
      completeSourceRun(db, run.id, { processed: rawInserted, rejected, created_leads: 0 }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.run_complete_failed", source, run_id, error: String(err) }));
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "ingest.complete", source, run_id, processed: rawInserted, rejected, created_leads: 0 }));

  return json({ ok: true, source, run_id, processed: rawInserted, rejected, created_leads: 0 }, 200);
}
