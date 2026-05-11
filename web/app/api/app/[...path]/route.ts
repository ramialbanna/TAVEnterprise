import "server-only";
import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";

/**
 * Catch-all proxy for the Cloudflare Worker `/app/*` product API.
 *
 *   browser → /api/app/<...segments>?<query>
 *           → ${APP_API_BASE_URL}/app/<...segments>?<query>   (origin only in the env var; the
 *             proxy appends "/app")
 *
 * - Injects `Authorization: Bearer ${APP_API_SECRET}` server-side. The secret and the Worker URL
 *   never reach the browser. The browser's own Cookie / Authorization headers are NOT forwarded.
 * - Forwards the method (GET/POST/PUT/PATCH/DELETE) and, for non-GET/HEAD, the raw request body.
 * - Returns the upstream status + JSON body verbatim. Non-JSON from the Worker → a safe
 *   `{ ok:false, error:"upstream_non_json" }` envelope. Network/timeout error reaching the Worker →
 *   `{ ok:false, error:"upstream_unavailable" }` with 503. Invalid /web env → `{ ok:false,
 *   error:"proxy_misconfigured" }` with 500 (no upstream call). Secrets are never logged.
 *
 * Auth: `proxy.ts` already gates `/api/app/*` (unauthenticated → 401 JSON before this handler runs).
 * This handler assumes authenticated traffic but adds no auth of its own.
 */

// Bound the upstream call. Keep <= the Vercel function execution limit (10s on Hobby; longer on Pro).
const PROXY_TIMEOUT_MS = 12_000;

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const startedAt = Date.now();
  const { path } = await ctx.params;
  const { search } = new URL(req.url);
  const method = req.method;
  const pathForLog = `/app/${path.join("/")}`; // path segments only — never log the query string

  let env: ReturnType<typeof serverEnv>;
  try {
    env = serverEnv();
  } catch (err) {
    // serverEnv() reports field NAMES only (never values) — safe to log the message.
    console.error("[/api/app] proxy misconfigured:", err instanceof Error ? err.message : String(err));
    return Response.json({ ok: false, error: "proxy_misconfigured" }, { status: 500 });
  }

  const target = `${env.APP_API_BASE_URL}/app/${path.join("/")}${search}`;

  // Clean header set: inject the server-side Bearer; carry Content-Type through for bodied
  // requests; advertise JSON. Deliberately do NOT forward the browser's Cookie / Authorization / Host.
  const headers = new Headers();
  headers.set("authorization", `Bearer ${env.APP_API_SECRET}`);
  headers.set("accept", "application/json");
  const incomingContentType = req.headers.get("content-type");
  if (incomingContentType) headers.set("content-type", incomingContentType);

  const init: RequestInit = { method, headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await req.text(); // forward the raw body verbatim (e.g. JSON for /app/mmr/vin)
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(target, { ...init, signal: controller.signal });
  } catch (err) {
    console.error(
      `[/api/app] ${method} ${pathForLog} -> upstream_unavailable (${Date.now() - startedAt}ms)`,
      err instanceof Error ? err.name : "",
    );
    return Response.json({ ok: false, error: "upstream_unavailable" }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    console.error(
      `[/api/app] ${method} ${pathForLog} -> upstream_non_json status=${upstream.status} (${Date.now() - startedAt}ms)`,
    );
    return Response.json(
      { ok: false, error: "upstream_non_json" },
      { status: upstream.status >= 400 ? upstream.status : 502 },
    );
  }

  const body = await upstream.text();
  return new Response(body, { status: upstream.status, headers: { "content-type": "application/json" } });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
