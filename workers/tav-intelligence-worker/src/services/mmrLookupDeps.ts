import type { Env } from "../types/env";
import type { MmrLookupDeps } from "./mmrLookup";
import { ManheimHttpClient } from "../clients/manheimHttp";
import { KvMmrCache } from "../cache/kvMmrCache";
import { KvCacheLock } from "../cache/kvLock";
import { KvRateLimiter } from "../rateLimit/kvRateLimiter";
import { getSupabaseClient } from "../persistence/supabase";
import { createMmrQueriesRepository } from "../persistence/mmrQueriesRepository";
import { createMmrCacheRepository } from "../persistence/mmrCacheRepository";
import { createUserActivityRepository } from "../persistence/userActivityRepository";

/**
 * Assemble all infrastructure dependencies for a Manheim MMR lookup.
 * Called once per request in each MMR handler. All Postgres writers are
 * best-effort — their absence never blocks a response.
 */
export function buildMmrLookupDeps(env: Env): MmrLookupDeps {
  const supabase = getSupabaseClient(env);
  return {
    client:       new ManheimHttpClient(env, env.TAV_INTEL_KV),
    cache:        new KvMmrCache(env.TAV_INTEL_KV),
    lock:         new KvCacheLock(env.TAV_INTEL_KV),
    rateLimiter:  new KvRateLimiter(env.TAV_INTEL_KV),
    queryRepo:    createMmrQueriesRepository(supabase),
    cacheRepo:    createMmrCacheRepository(supabase),
    activityRepo: createUserActivityRepository(supabase),
  };
}
