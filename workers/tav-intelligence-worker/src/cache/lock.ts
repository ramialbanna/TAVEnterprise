/**
 * Anti-stampede lock interface for the MMR cache.
 *
 * Intended flow when serving an MMR lookup:
 *
 *   1. Check the cache. Return on hit.
 *   2. Acquire a lock keyed on the same cache key.
 *   3. If acquired:
 *        a. Fetch from Manheim.
 *        b. Write the result to cache + Postgres.
 *        c. Release the lock.
 *   4. If NOT acquired (someone else is fetching):
 *        a. Wait on the lock until released or `maxWaitMs` elapses.
 *        b. Re-read the cache.
 *   5. If still not cached after waiting, throw `CacheLockError` so the
 *      caller can retry.
 *
 * Implementation lands in Phase G — likely KV-based with TTL'd marker keys
 * and short polling for `wait`.
 */
export interface CacheLock {
  /**
   * Try to acquire the lock. Resolves `true` on success, `false` if already
   * held by someone else.
   *
   * @param key       Lock key — typically the MMR cache key being fetched.
   * @param ttlMs     Maximum time the lock may be held before automatic
   *                  release (covers crashes / dropped connections).
   * @param requestId Owner identifier for ownership checks during release.
   */
  acquire(key: string, ttlMs: number, requestId: string): Promise<boolean>;

  /** Release the lock. No-op if it was never held by this requestId. */
  release(key: string, requestId: string): Promise<void>;

  /** Wait for the lock to be released. Polls at most `maxWaitMs` total. */
  wait(key: string, maxWaitMs: number): Promise<void>;
}
