/**
 * KV-backed best-effort cache lock.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * IMPORTANT: this lock is BEST-EFFORT, not strongly consistent.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Cloudflare KV has **no native compare-and-swap** primitive. The `acquire`
 * flow performs a read-then-write sequence:
 *
 *   1. read  `lock:${key}`  — if present, return false.
 *   2. write `lock:${key}` = requestId, ttl ≥ 60s.
 *   3. wait ~50ms (KV settle window — writes are visible to subsequent reads
 *      within the same colo within tens of ms, but NOT atomically).
 *   4. read `lock:${key}` again — if value !== requestId, someone else won
 *      the race; return false.
 *
 * Two simultaneous callers can both observe step 1 as "absent," both write
 * in step 2, and only one will see their own requestId in step 4. The
 * race window is ~100ms (write propagation + settle).
 *
 * Why this is acceptable for the MMR cache use case:
 *   (a) Manheim lookups are idempotent — duplicating one is a cost, not a
 *       correctness violation.
 *   (b) Cache writes are last-write-wins — a duplicate write produces the
 *       same envelope (within the same instant of time).
 *   (c) The downside of a lost race is one extra Manheim API call. The
 *       upside (true atomicity) would require Durable Objects, which adds
 *       deployment complexity and cost not justified for Phase G.1.
 *
 * If we ever need true single-flight (e.g. Manheim charges per-call, or we
 * exceed our rate budget), upgrade this implementation to a Durable Object
 * lock. Interface stays the same.
 *
 * Token-refresh single-flight uses a similar pattern in `manheimHttp.ts`
 * with the same caveats.
 */

import type { CacheLock } from "./lock";
import { LOCK_RETRY_INTERVAL_MS } from "./constants";
import { log } from "../utils/logger";

const KEY_PREFIX = "lock:";
/** KV requires expirationTtl >= 60s — clamp to satisfy the platform. */
const KV_MIN_TTL_SECONDS = 60;
/** Settle window before re-reading our own write to verify ownership. */
const KV_SETTLE_MS = 50;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class KvCacheLock implements CacheLock {
  constructor(private kv: KVNamespace) {}

  async acquire(
    key: string,
    ttlMs: number,
    requestId: string,
  ): Promise<boolean> {
    const fullKey = `${KEY_PREFIX}${key}`;

    const existing = await this.kv.get(fullKey);
    if (existing !== null) {
      log("mmr.lock.held_by_other", { requestId, key, holder: existing });
      return false;
    }

    const ttlSeconds = Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlMs / 1000));
    await this.kv.put(fullKey, requestId, { expirationTtl: ttlSeconds });

    // Settle window — KV writes are eventually consistent within a colo.
    await sleep(KV_SETTLE_MS);

    const verify = await this.kv.get(fullKey);
    const won = verify === requestId;
    if (won) {
      log("mmr.lock.acquired", {
        requestId,
        key,
        ttl_seconds: ttlSeconds,
      });
    } else {
      log("mmr.lock.race_lost", {
        requestId,
        key,
        observed_owner: verify,
      });
    }
    return won;
  }

  async release(key: string, requestId: string): Promise<void> {
    const fullKey = `${KEY_PREFIX}${key}`;
    const current = await this.kv.get(fullKey);
    if (current === requestId) {
      await this.kv.delete(fullKey);
      log("mmr.lock.released", { requestId, key });
    } else {
      // Releasing a lock we don't own is a no-op. Most often this means the
      // lock TTL'd out before we got here — not an error.
      log("mmr.lock.release_skipped", {
        requestId,
        key,
        observed_owner: current,
      });
    }
  }

  async wait(key: string, maxWaitMs: number): Promise<void> {
    const fullKey = `${KEY_PREFIX}${key}`;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const current = await this.kv.get(fullKey);
      if (current === null) return;
      await sleep(LOCK_RETRY_INTERVAL_MS);
    }
    // Timeout: caller decides what this means (typically: re-check cache,
    // and if still empty, throw CacheLockError).
  }
}
