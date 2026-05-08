/**
 * MMR cache interface.
 *
 * Backed by Cloudflare KV in production. The implementation lives in Phase G;
 * this file pins the contract handlers depend on.
 *
 * `value` is always a parsed `MmrResponseEnvelope` — the cache stores the
 * exact response shape returned to clients so a hit can be served verbatim.
 */
import type { MmrResponseEnvelope } from "../validate";

export interface MmrCache {
  /** Read a cached envelope. Resolves `null` on miss. */
  get(cacheKey: string, requestId: string): Promise<MmrResponseEnvelope | null>;

  /**
   * Write an envelope to the cache.
   *
   * @param ttlSeconds TTL applied at the KV level. Negative-cache entries
   *                   may use shorter TTLs than positive results.
   */
  set(
    cacheKey: string,
    value: MmrResponseEnvelope,
    ttlSeconds: number,
    requestId: string,
  ): Promise<void>;

  /** Drop a cache entry. Used by `force_refresh` and admin invalidation. */
  invalidate(cacheKey: string, requestId: string): Promise<void>;
}
