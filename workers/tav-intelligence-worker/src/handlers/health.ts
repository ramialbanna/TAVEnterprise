import { okResponse } from "../types/api";
import type { HandlerArgs } from "./types";

const VERSION = "0.1.0";

/**
 * GET /health — unauthenticated liveness probe.
 *
 * Used by Cloudflare health checks and the Make.com sync polling. No identity
 * required.
 */
export async function handleHealth(args: HandlerArgs): Promise<Response> {
  return okResponse(
    {
      status:  "ok",
      worker:  "tav-intelligence-worker",
      version: VERSION,
    },
    args.requestId,
  );
}
