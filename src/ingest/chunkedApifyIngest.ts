import type { Env } from "../types/env";
import type { IngestRequest } from "../validate";
import { getSupabaseClient } from "../persistence/supabase";
import { withRetry } from "../persistence/retry";
import {
  upsertSourceRun,
  completeSourceRunSafe,
  type SourceRunRecord,
} from "../persistence/sourceRuns";
import { log, logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";
import { sendExcellentLeadSummary } from "../alerts/alerts";
import { ingestCore } from "./handleIngest";
import {
  chunkIngestItems,
  INGEST_CHUNK_SIZE,
  runIngestItemLoop,
} from "./runIngestItemLoop";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Process a large Apify dataset by slicing it into INGEST_CHUNK_SIZE items per
 * ingest slice, each with its own BATCH_TIMEOUT budget. All chunks run
 * synchronously before the webhook returns so the source_run always completes.
 *
 * Small batches (≤ INGEST_CHUNK_SIZE) pass straight through to ingestCore.
 */
export async function dispatchApifyIngest(
  envelope: IngestRequest,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  if (envelope.items.length <= INGEST_CHUNK_SIZE) {
    return ingestCore(envelope, env, execCtx);
  }

  const { source, run_id, region, scraped_at, items } = envelope;
  const ctx: LogContext = { runId: run_id, source, region };
  const db = getSupabaseClient(env);

  let run: SourceRunRecord;
  try {
    run = await withRetry(() =>
      upsertSourceRun(db, {
        source,
        run_id,
        region,
        scraped_at,
        item_count: items.length,
      }),
    );
  } catch (err) {
    logError("persistence", "ingest.source_run_failed", err, ctx);
    return json({ ok: false, error: "service_unavailable" }, 503);
  }

  if (run.status === "completed") {
    log("ingest.idempotent_return", { chunked: true }, ctx);
    return json(
      {
        ok: true,
        source,
        run_id,
        processed: run.processed,
        rejected: run.rejected,
        created_leads: run.created_leads,
        idempotent: true,
      },
      200,
    );
  }

  const chunks = chunkIngestItems(items);
  log(
    "ingest.chunked.started",
    {
      item_count: items.length,
      chunks: chunks.length,
      chunk_size: INGEST_CHUNK_SIZE,
      kpi: true,
    },
    ctx,
  );

  try {
    await runChunkedApifyIngest(envelope, env, execCtx, run);
  } catch (err) {
    logError("persistence", "ingest.chunked_failed", err, ctx);
    await completeSourceRunSafe(
      db,
      run.id,
      {
        processed: 0,
        rejected: 0,
        created_leads: 0,
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      },
      (event, fields) => log(event, fields ?? {}, ctx),
    );
    return json({ ok: false, error: "ingest_failed", run_id }, 500);
  }

  const completed = await withRetry(async () =>
    db
      .from("source_runs")
      .select("processed, rejected, created_leads, status, error_message")
      .eq("id", run.id)
      .single(),
  );
  const row = completed.data as {
    processed: number;
    rejected: number;
    created_leads: number;
    status: string;
    error_message: string | null;
  } | null;

  return json(
    {
      ok: true,
      source,
      run_id,
      item_count: items.length,
      chunks: chunks.length,
      chunk_size: INGEST_CHUNK_SIZE,
      processed: row?.processed ?? 0,
      rejected: row?.rejected ?? 0,
      created_leads: row?.created_leads ?? 0,
      status: row?.status ?? "completed",
      ...(row?.status === "truncated" && row.error_message
        ? {
            truncated: true,
            items_skipped: Number(row.error_message.match(/(\d+)_items_skipped/)?.[1] ?? 0),
          }
        : {}),
    },
    200,
  );
}

/** Exported for unit tests — runs all chunks sequentially in-process. */
export async function runChunkedApifyIngest(
  envelope: IngestRequest,
  env: Env,
  execCtx: ExecutionContext,
  run: SourceRunRecord,
): Promise<void> {
  const { source, run_id, region, scraped_at, items } = envelope;
  const ctx: LogContext = { runId: run_id, source, region };
  const db = getSupabaseClient(env);
  const chunks = chunkIngestItems(items);

  let totalProcessed = 0;
  let totalRejected = 0;
  let totalLeads = 0;
  let anyTruncated = false;
  let totalSkipped = 0;
  const allExcellentLeads: Parameters<typeof sendExcellentLeadSummary>[1] = [];
  let cachedRules = undefined;

  for (let c = 0; c < chunks.length; c++) {
    const chunkItems = chunks[c]!;
    const result = await runIngestItemLoop({
      db,
      run,
      payload: {
        source,
        run_id,
        region,
        scraped_at,
        items: chunkItems,
      },
      env,
      execCtx,
      itemIndexOffset: c * INGEST_CHUNK_SIZE,
      cachedRules,
    });

    cachedRules = result.cachedRules;
    totalProcessed += result.processed;
    totalRejected += result.rejected;
    totalLeads += result.created_leads;
    allExcellentLeads.push(...result.excellentLeads);

    if (result.truncated) {
      anyTruncated = true;
      totalSkipped += result.items_skipped;
      log(
        "ingest.chunked.slice_truncated",
        {
          chunk: c + 1,
          chunks: chunks.length,
          items_skipped: result.items_skipped,
          kpi: true,
        },
        ctx,
      );
    }
  }

  const status = anyTruncated ? "truncated" : "completed";
  const error_message = anyTruncated ? `batch_truncated:${totalSkipped}_items_skipped` : null;

  await completeSourceRunSafe(
    db,
    run.id,
    {
      processed: totalProcessed,
      rejected: totalRejected,
      created_leads: totalLeads,
      status,
      error_message,
    },
    (event, fields) => log(event, fields ?? {}, ctx),
  );

  log(
    "ingest.chunked.complete",
    {
      chunks: chunks.length,
      processed: totalProcessed,
      rejected: totalRejected,
      created_leads: totalLeads,
      truncated: anyTruncated,
      items_skipped: totalSkipped,
      kpi: true,
    },
    ctx,
  );

  if (allExcellentLeads.length > 0) {
    await sendExcellentLeadSummary(env, allExcellentLeads, { runId: run_id, source });
  }
}
