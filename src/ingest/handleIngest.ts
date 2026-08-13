import type { Env } from "../types/env";
import { verifyHmac } from "../auth/hmac";
import { IngestRequestSchema, type IngestRequest } from "../validate";
import { getSupabaseClient } from "../persistence/supabase";
import { withRetry } from "../persistence/retry";
import { upsertSourceRun, completeSourceRunSafe } from "../persistence/sourceRuns";
import { isConfiguredSecret } from "../types/envValidation";
import { log, logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";
import { sendExcellentLeadSummary } from "../alerts/alerts";
import {
  computeIngestLoopDeadline,
  runIngestItemLoop,
} from "./runIngestItemLoop";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

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
    return json(
      {
        ok: true,
        source,
        run_id,
        processed: run.processed,
        rejected: run.rejected,
        created_leads: run.created_leads,
      },
      200,
    );
  }

  let loopResult;
  try {
    loopResult = await runIngestItemLoop({
      db,
      run,
      payload,
      env,
      execCtx,
      loopDeadline: computeIngestLoopDeadline(),
    });
  } catch (err) {
    logError("persistence", "ingest.loop_failed", err, ctx);
    execCtx.waitUntil(
      completeSourceRunSafe(
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
      ),
    );
    return json({ ok: false, error: "ingest_failed" }, 500);
  }

  const {
    processed: rawInserted,
    rejected,
    created_leads: createdLeads,
    truncated,
    items_skipped: itemsSkipped,
    excellentLeads,
  } = loopResult;

  const status = truncated ? "truncated" : "completed";
  const error_message = truncated ? `batch_truncated:${itemsSkipped}_items_skipped` : null;

  execCtx.waitUntil(
    completeSourceRunSafe(
      db,
      run.id,
      {
        processed: rawInserted,
        rejected,
        created_leads: createdLeads,
        status,
        error_message,
      },
      (event, fields) => log(event, fields ?? {}, ctx),
    ),
  );

  log(
    "ingest.complete",
    {
      processed: rawInserted,
      rejected,
      created_leads: createdLeads,
      ...(truncated && { truncated: true, items_skipped: itemsSkipped }),
      kpi: true,
    },
    ctx,
  );

  if (excellentLeads.length > 0) {
    execCtx.waitUntil(sendExcellentLeadSummary(env, excellentLeads, { runId: run_id, source }));
  }

  return json(
    {
      ok: true,
      source,
      run_id,
      processed: rawInserted,
      rejected,
      created_leads: createdLeads,
      ...(truncated && { truncated: true, items_skipped: itemsSkipped }),
    },
    200,
  );
}
