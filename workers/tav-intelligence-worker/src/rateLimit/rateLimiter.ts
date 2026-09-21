/**
 * Rate limiter interface for live Manheim calls.
 *
 * Implementations count live upstream calls within a fixed time window and
 * throw `RateLimitError` when either the per-user or global ceiling is hit.
 * Cache hits never reach this layer — callers invoke `check()` only when
 * they are about to make a real Manheim HTTP call.
 */
export type RateLimitBucket = "shared" | "refresh";

export interface RateLimiter {
  /**
   * Increment the live-call counter for `userEmail`.
   * `shared` also counts the global window used by ingest.
   * `refresh` counts only that buyer's Refresh valuation clicks.
   * Throws `RateLimitError` when the chosen ceiling is already hit.
   * Pass `null` for `userEmail` on `shared` to skip the per-user check.
   */
  check(userEmail: string | null, requestId: string, bucket?: RateLimitBucket): Promise<void>;
}
