import type { Env } from "./types/env";
import { handleIngest } from "./ingest/handleIngest";
import { handleApifyWebhook } from "./apify/webhookHandler";
import { handleAdmin } from "./admin/routes";
import { handleApp } from "./app/routes";
import { getSupabaseClient } from "./persistence/supabase";
import { runStaleSweep } from "./stale/engine";
import { recordCronRunSafe } from "./persistence/cronRuns";
import { runCoxCatalogSync } from "./catalog/syncCoxCatalogTree";
import { log, serializeError } from "./logging/logger";
import { VERSION } from "./version";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return handleHealth(VERSION);
    }

    if (request.method === "POST" && url.pathname === "/ingest") {
      return handleIngest(request, env, ctx);
    }

    if (request.method === "POST" && url.pathname === "/apify-webhook") {
      return handleApifyWebhook(request, env, ctx);
    }

    if (url.pathname.startsWith("/admin")) {
      return handleAdmin(request, env);
    }

    if (url.pathname.startsWith("/app/")) {
      return handleApp(request, env, ctx);
    }

    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = getSupabaseClient(env);

    log("cron.stale_sweep.started");
    const staleStartedAt = new Date().toISOString();
    try {
      const { updated } = await runStaleSweep(db);
      await recordCronRunSafe(db, {
        jobName: "stale_sweep",
        startedAt: staleStartedAt,
        finishedAt: new Date().toISOString(),
        status: "ok",
        detail: { updated },
      });
    } catch (err) {
      await recordCronRunSafe(db, {
        jobName: "stale_sweep",
        startedAt: staleStartedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        detail: { error: serializeError(err) },
      });
      throw err;
    }

    log("cron.cox_catalog_sync.started");
    const syncStartedAt = new Date().toISOString();
    try {
      const result = await runCoxCatalogSync(env, db);
      await recordCronRunSafe(db, {
        jobName: "cox_catalog_sync",
        startedAt: syncStartedAt,
        finishedAt: new Date().toISOString(),
        status: "ok",
        detail: result,
      });
      log("cron.cox_catalog_sync.completed", result);
    } catch (err) {
      await recordCronRunSafe(db, {
        jobName: "cox_catalog_sync",
        startedAt: syncStartedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        detail: { error: serializeError(err) },
      });
      log("cron.cox_catalog_sync.failed", { error: serializeError(err) });
    }
  },
};

function handleHealth(version: string): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "tav-enterprise",
      version,
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
