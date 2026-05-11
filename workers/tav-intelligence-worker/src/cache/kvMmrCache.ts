/**
 * KV-backed implementation of the `MmrCache` interface.
 *
 * Phase G.1 stores cached MMR envelopes exclusively in Cloudflare KV.
 * A Postgres mirror (`tav.mmr_cache`) lands in Phase G.2 and will be wired
 * behind the same `MmrCache` interface so callers do not change.
 *
 * Key layout:
 *   - `mmr:${cacheKey}` — JSON-stringified `MmrResponseEnvelope`.
 *
 * TTL handling: KV requires `expirationTtl >= 60` seconds. `set()` clamps
 * the supplied TTL to that floor. Negative-cache entries (1h) and
 * positive-cache entries (24h) both clear that floor — the clamp exists as
 * a safety net for callers who forget the constraint.
 *
 * Logging: every operation emits a structured log line including the
 * inbound `requestId` for trace correlation. Cache misses are NOT errors;
 * they are the common path on cold lookups.
 */

import type { MmrResponseEnvelope } from "../validate";
import type { MmrCache } from "./mmrCache";
import { log } from "../utils/logger";

const KEY_PREFIX = "mmr:";
/** KV refuses TTLs shorter than 60s. */
const KV_MIN_TTL_SECONDS = 60;

export class KvMmrCache implements MmrCache {
  constructor(private kv: KVNamespace) {}

  async get(
    cacheKey: string,
    requestId: string,
  ): Promise<MmrResponseEnvelope | null> {
    const fullKey = `${KEY_PREFIX}${cacheKey}`;
    let raw: MmrResponseEnvelope | null;
    try {
      raw = await this.kv.get<MmrResponseEnvelope>(fullKey, { type: "json" });
    } catch (err) {
      // KV `get` with malformed JSON throws — treat as a miss to avoid
      // poisoning the read path with corrupted entries.
      log("mmr.cache.miss", {
        requestId,
        cacheKey,
        reason: "json_parse_error",
        error_message: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    if (raw === null) {
      log("mmr.cache.miss", { requestId, cacheKey });
      return null;
    }

    log("mmr.cache.hit", { requestId, cacheKey });
    return raw;
  }

  async set(
    cacheKey: string,
    value: MmrResponseEnvelope,
    ttlSeconds: number,
    requestId: string,
  ): Promise<void> {
    const fullKey = `${KEY_PREFIX}${cacheKey}`;
    const effectiveTtl = Math.max(KV_MIN_TTL_SECONDS, Math.floor(ttlSeconds));
    await this.kv.put(fullKey, JSON.stringify(value), {
      expirationTtl: effectiveTtl,
    });
    log("mmr.cache.set", {
      requestId,
      cacheKey,
      ttl_seconds: effectiveTtl,
    });
  }

  async invalidate(cacheKey: string, requestId: string): Promise<void> {
    const fullKey = `${KEY_PREFIX}${cacheKey}`;
    await this.kv.delete(fullKey);
    log("mmr.cache.invalidate", { requestId, cacheKey });
  }
}
