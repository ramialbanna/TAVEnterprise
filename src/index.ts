import type { Env } from "./types/env";
import { handleIngest } from "./ingest/handleIngest";

const VERSION = "0.1.0";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return handleHealth(VERSION);
    }

    if (request.method === "POST" && url.pathname === "/ingest") {
      return handleIngest(request, env);
    }

    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
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
