import type { Env } from "../types/env";
import { resolveAppUser } from "../auth/resolveAppUser";
import { isConfiguredSecret } from "../types/envValidation";
import { log, serializeError } from "../logging/logger";

const MAXBUY_SERVICE_BINDING_BASE = "https://maxbuy-worker.internal";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function proxyToMaxbuyWorker(
  env: Env,
  request: Request,
  pathname: string,
  userId: string | null,
): Promise<Response> {
  if (env.MAXBUY_EVALUATE_ENABLED !== "true") {
    return json({ ok: false, error: "maxbuy_disabled" }, 503);
  }

  const hasBinding = env.MAXBUY_WORKER !== undefined;
  const baseUrl =
    env.MAXBUY_WORKER_URL || (hasBinding ? MAXBUY_SERVICE_BINDING_BASE : "");

  if (!baseUrl || !isConfiguredSecret(env.MAXBUY_WORKER_SECRET)) {
    return json({ ok: false, error: "maxbuy_not_configured" }, 503);
  }

  const headers = new Headers(request.headers);
  headers.set("x-tav-service-secret", env.MAXBUY_WORKER_SECRET);
  if (userId) headers.set("x-tav-user-id", userId);

  const targetUrl = `${baseUrl}${pathname}${new URL(request.url).search}`;
  const init: RequestInit = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
  };

  try {
    const response = hasBinding
      ? await env.MAXBUY_WORKER!.fetch(targetUrl, init)
      : await fetch(targetUrl, init);
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    log("app.maxbuy_proxy.error", { pathname, error: serializeError(err) });
    return json({ ok: false, error: "maxbuy_unavailable" }, 503);
  }
}

export async function handleMaxbuyAppRoute(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const user = await resolveAppUser(request, env);
  const userId = user?.id ?? null;

  if (pathname.startsWith("/app/maxbuy/")) {
    const workerPath = pathname.replace(/^\/app/, "");
    if (
      request.method === "POST"
      && (workerPath === "/maxbuy/evaluate"
        || workerPath === "/maxbuy/overrides"
        || workerPath === "/maxbuy/passes")
    ) {
      if (!userId) return json({ ok: false, error: "user_required" }, 401);
    }
    return proxyToMaxbuyWorker(env, request, workerPath, userId);
  }

  return json({ ok: false, error: "not_found" }, 404);
}

export function maxbuySystemStatus(env: Env): {
  enabled: boolean;
  binding: boolean;
  url: string | null;
} {
  return {
    enabled: env.MAXBUY_EVALUATE_ENABLED === "true",
    binding: env.MAXBUY_WORKER !== undefined,
    url: env.MAXBUY_WORKER_URL || null,
  };
}
