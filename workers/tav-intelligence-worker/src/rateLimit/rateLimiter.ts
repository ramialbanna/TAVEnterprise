/**
 * Rate limiter interface for live Manheim calls.
 *
 * Implementations count live upstream calls within a fixed time window and
 * throw `RateLimitError` when either the per-user or global ceiling is hit.
 * Cache hits never reach this layer — callers invoke `check()` only when
 * they are about to make a real Manheim HTTP call.
 */
export interface RateLimiter {
  /**
   * Increment the live-call counter for `userEmail` and the global window.
   * Throws `RateLimitError` if either limit is already at its ceiling.
   * Pass `null` for `userEmail` to skip the per-user check.
   */
  check(userEmail: string | null, requestId: string): Promise<void>;
}
