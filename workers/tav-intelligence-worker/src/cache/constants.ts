/**
 * Cache + lock timing constants. Locked 2026-05-07.
 * See docs/CACHE_STRATEGY.md for rationale and tuning notes.
 *
 * These are the single source of truth — both the MMR cache implementation
 * (Phase G) and the anti-stampede lock implementation (Phase G) read from
 * here. Changing a value requires updating CACHE_STRATEGY.md.
 */

/** TTL for a successful MMR result. 24h — MMR data doesn't change minute-to-minute. */
export const POSITIVE_CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * TTL for a no-result MMR (mmr_value === null). 1h — short enough to recover
 * from transient Manheim outages or VIN-not-yet-ingested cases, long enough
 * to prevent hammering on persistent misses.
 */
export const NEGATIVE_CACHE_TTL_SECONDS = 60 * 60;

/**
 * Maximum time a cache lock may be held before automatic release. Set high
 * enough to cover Manheim's worst-case latency including a token refresh,
 * but bounded so a stuck worker doesn't deadlock all peers indefinitely.
 */
export const LOCK_TIMEOUT_MS = 30_000;

/** Polling interval while waiting for another request to release the lock. */
export const LOCK_RETRY_INTERVAL_MS = 250;

// ── Rate-limit constants ──────────────────────────────────────────────────────

/** Length of the rate-limit window. Must keep KV TTL (2×) ≥ 60s. */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * Maximum live (non-cache) Manheim calls a single user may make per window.
 * Conservative to protect the shared Manheim account quota.
 */
export const RATE_LIMIT_USER_LIVE_PER_WINDOW = 10;

/**
 * Maximum live Manheim calls across all users per window.
 * Set at 6× the per-user limit to leave room for burst from multiple users.
 */
export const RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW = 60;

/**
 * Maximum number of poll attempts before giving up with CacheLockError.
 * Computed from LOCK_TIMEOUT_MS / LOCK_RETRY_INTERVAL_MS so a waiter never
 * blocks longer than the lock could legitimately be held. Phase G may tune
 * this down (e.g. to 8–32) once production latency is measured.
 */
export const LOCK_MAX_RETRIES = Math.floor(LOCK_TIMEOUT_MS / LOCK_RETRY_INTERVAL_MS);
