/**
 * KV-backed fixed-window rate limiter for live Manheim calls.
 *
 * Window keys:
 *   rate:live:user:<email>:<window>   — per-user counter
 *   rate:live:global:<window>         — global counter
 *
 * where <window> = Math.floor(epoch_ms / window_ms).
 *
 * Race caveat (identical to KvCacheLock): KV has no CAS primitive, so two
 * simultaneous callers can both read N and both write N+1. This is acceptable
 * for an internal portal rate limiter — the race window is ~50ms and the
 * worst case is a small overshoot, not a correctness failure.
 *
 * Rejected calls do NOT increment the counter — only admitted calls count.
 * KV TTL is 2× the window (120s), satisfying the platform minimum of 60s.
 */

import type { RateLimiter } from "./rateLimiter";
import { RateLimitError } from "../errors";
import {
  RATE_LIMIT_WINDOW_SECONDS,
  RATE_LIMIT_USER_LIVE_PER_WINDOW,
  RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW,
} from "../cache/constants";
import { log } from "../utils/logger";

const KV_TTL_SECONDS = RATE_LIMIT_WINDOW_SECONDS * 2; // 120s — above KV 60s minimum

export class KvRateLimiter implements RateLimiter {
  constructor(private kv: KVNamespace) {}

  async check(userEmail: string | null, requestId: string): Promise<void> {
    const window = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));

    if (userEmail !== null) {
      const userKey = `rate:live:user:${userEmail}:${window}`;
      const raw = await this.kv.get(userKey);
      const count = raw === null ? 0 : parseInt(raw, 10);

      if (count >= RATE_LIMIT_USER_LIVE_PER_WINDOW) {
        log("mmr.rate_limit.user_exceeded", {
          requestId, userEmail, count,
          limit: RATE_LIMIT_USER_LIVE_PER_WINDOW, window,
        });
        throw new RateLimitError(
          `Live lookup rate limit exceeded: max ${RATE_LIMIT_USER_LIVE_PER_WINDOW} per ${RATE_LIMIT_WINDOW_SECONDS}s window`,
          { limit: RATE_LIMIT_USER_LIVE_PER_WINDOW, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
        );
      }

      await this.kv.put(userKey, String(count + 1), { expirationTtl: KV_TTL_SECONDS });
    }

    const globalKey = `rate:live:global:${window}`;
    const rawGlobal = await this.kv.get(globalKey);
    const globalCount = rawGlobal === null ? 0 : parseInt(rawGlobal, 10);

    if (globalCount >= RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW) {
      log("mmr.rate_limit.global_exceeded", {
        requestId, globalCount,
        limit: RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW, window,
      });
      throw new RateLimitError(
        `Global live lookup rate limit exceeded: max ${RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW} per ${RATE_LIMIT_WINDOW_SECONDS}s window`,
        { limit: RATE_LIMIT_GLOBAL_LIVE_PER_WINDOW, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
      );
    }

    await this.kv.put(globalKey, String(globalCount + 1), { expirationTtl: KV_TTL_SECONDS });
  }
}
