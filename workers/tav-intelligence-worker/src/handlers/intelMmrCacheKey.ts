import { okResponse, errorResponse } from "../types/api";
import { AuthError, ValidationError, PersistenceError } from "../errors";
import { getSupabaseClient } from "../persistence/supabase";
import type { HandlerArgs } from "./types";

/**
 * GET /intel/mmr/:cacheKey — inspect a Postgres-mirrored MMR cache entry.
 *
 * Reads from tav.mmr_cache by cache_key. The key format mirrors the KV key:
 *   vin:<VIN>                         (VIN path)
 *   ymm:<year>:<make>:<model>:<miles> (YMM path)
 *
 * Returns 404 when the key is not in the Postgres mirror (KV may still hold
 * an entry if the Postgres write failed silently — use KV directly for cache
 * reads; this endpoint is for observability only).
 */
export async function handleIntelMmrCacheKey(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const cacheKey = args.pathParams?.["cacheKey"];
  if (typeof cacheKey !== "string" || cacheKey.length === 0) {
    throw new ValidationError("Missing :cacheKey path parameter");
  }

  const db = getSupabaseClient(args.env);
  const { data, error } = await db
    .from("mmr_cache")
    .select("*")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    throw new PersistenceError("mmr_cache lookup failed", {
      code:    error.code,
      message: error.message,
    });
  }

  if (data === null) {
    return errorResponse("not_found", `No cache entry for key: ${cacheKey}`, args.requestId, 404);
  }

  return okResponse(data, args.requestId);
}
