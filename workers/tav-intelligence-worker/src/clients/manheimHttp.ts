/**
 * Real Manheim MMR HTTP client (Phase G.1).
 *
 * Responsibilities:
 *   - OAuth password-grant token caching (KV-backed, single-flight)
 *   - VIN and YMM lookups against Manheim's MMR endpoints
 *   - Retry on 429 / 5xx / network errors with exponential backoff + jitter
 *   - Honor `Retry-After` on 429
 *   - Map HTTP / network failures to typed `Manheim*Error` subclasses
 *   - Emit structured logs with the inbound `requestId`; never log secrets
 *
 * No business decisions live here. Cache lookup, lock acquisition, mileage
 * inference, and audit persistence are owned by `services/mmrLookup.ts`.
 */

import type { Env } from "../types/env";
import type {
  ManheimClient,
  ManheimVinResponse,
  ManheimYmmResponse,
} from "./manheim";
import {
  ManheimAuthError,
  ManheimRateLimitError,
  ManheimResponseError,
  ManheimUnavailableError,
} from "../errors";
import { log } from "../utils/logger";
import { retryWithBackoff } from "../utils/retry";

// ── Tuning constants ─────────────────────────────────────────────────────────
//
// Backoff matches the Phase G architecture doc (~6.5s ceiling across 4 attempts).
// Adjust here if production tuning warrants — single source of truth for the
// HTTP layer.

/** Token cache key in TAV_INTEL_KV. */
const TOKEN_KV_KEY = "manheim:token";
/** Lock key for single-flight token refresh. */
const TOKEN_REFRESH_LOCK_KEY = "lock:manheim:token:refresh";
/** Soft TTL for the lock; ample budget for a token endpoint round-trip. */
const TOKEN_REFRESH_LOCK_TTL_S = 10;
/** Buffer before token's true expiry — refresh early to avoid edge races. */
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
/** Sleep between re-reads while another request is refreshing the token. */
const LOCK_RETRY_INTERVAL_MS = 250;
/** Max poll attempts (~2.5s) waiting on the token-refresh single-flight lock. */
const TOKEN_REFRESH_LOCK_MAX_POLLS = 10;

const HTTP_RETRY_OPTS = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs:  8000,
  jitterRatio: 0.3,
} as const;

// ── Internal types ────────────────────────────────────────────────────────────

interface CachedToken {
  access_token: string;
  expires_at:   number; // ms epoch
}

interface FetchAttemptResult {
  response:    Response;
  attempts:    number; // total attempts including the first
}

/**
 * Sentinel error used internally so `retryWithBackoff` can distinguish a
 * retryable HTTP response (still a Response object — fetch resolved) from an
 * actual thrown network error.
 */
class RetryableHttpError extends Error {
  constructor(public response: Response, public retryAfterMs: number | null) {
    super(`Manheim retryable HTTP ${response.status}`);
    this.name = "RetryableHttpError";
  }
}

/** Network failures (fetch threw) are always retryable. */
class NetworkError extends Error {
  constructor(public cause: unknown) {
    super("Manheim network error");
    this.name = "NetworkError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SLEEP = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Categorize an unknown error for log dashboards without leaking detail. */
function errorCategory(err: unknown): string {
  if (err instanceof ManheimAuthError)        return "auth";
  if (err instanceof ManheimRateLimitError)   return "rate_limited";
  if (err instanceof ManheimUnavailableError) return "unavailable";
  if (err instanceof ManheimResponseError)    return "response_shape";
  if (err instanceof NetworkError)            return "network";
  return "unknown";
}

/**
 * Extract the wholesale mileage-adjusted MMR value from Manheim's response.
 * Field names vary by endpoint and API version — the priority order mirrors
 * `src/valuation/mmr.ts` and is the result of empirical testing against the
 * production Manheim account.
 */
function extractMmrValue(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  const candidate = Array.isArray(d.items) ? d.items[0] : d;
  if (!candidate || typeof candidate !== "object") return null;

  const t = candidate as Record<string, unknown>;

  if (t.adjustedPricing && typeof t.adjustedPricing === "object") {
    const ap = t.adjustedPricing as Record<string, unknown>;
    if (ap.wholesale && typeof ap.wholesale === "object") {
      const w = ap.wholesale as Record<string, unknown>;
      if (typeof w.average === "number" && w.average > 0) return Math.round(w.average);
    }
  }

  for (const key of [
    "adjustedWholesaleAverage",
    "wholesaleMileageAdjusted",
    "wholesaleAverage",
    "mmrValue",
    "average",
    "value",
  ]) {
    const v = t[key];
    if (typeof v === "number" && v > 0) return Math.round(v);
  }

  if (t.wholesale && typeof t.wholesale === "object") {
    const w = t.wholesale as Record<string, unknown>;
    if (typeof w.average === "number" && w.average > 0) return Math.round(w.average);
  }

  return null;
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number.parseInt(headerValue, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return null;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class ManheimHttpClient implements ManheimClient {
  constructor(
    private env: Env,
    private kv:  KVNamespace,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async lookupByVin(args: {
    vin:       string;
    mileage:   number;
    requestId: string;
  }): Promise<ManheimVinResponse> {
    const start = Date.now();

    const token = await this.getAccessToken(args.requestId);
    const url = new URL(
      `/valuations/vin/${encodeURIComponent(args.vin)}`,
      this.env.MANHEIM_MMR_URL,
    );
    url.searchParams.set("odometer", String(args.mileage));

    return this.executeLookup<ManheimVinResponse>({
      url:        url.toString(),
      token,
      requestId:  args.requestId,
      lookupType: "vin",
      startMs:    start,
    });
  }

  async lookupByYmm(args: {
    year:      number;
    make:      string;
    model:     string;
    trim?:     string;
    mileage:   number;
    requestId: string;
  }): Promise<ManheimYmmResponse> {
    const start = Date.now();

    const token = await this.getAccessToken(args.requestId);

    // CRITICAL (regression — see commit 5a66d6b3 / src/valuation/mmr.ts):
    // Manheim's YMM endpoint takes year/make/model as PATH segments. Passing
    // them as query params returns HTTP 596 ("URL may be malformed"). Do not
    // refactor to query-style without verifying with a live call.
    const url = new URL(
      `/valuations/search/${encodeURIComponent(args.year)}/${encodeURIComponent(args.make)}/${encodeURIComponent(args.model)}`,
      this.env.MANHEIM_MMR_URL,
    );
    url.searchParams.set("odometer", String(args.mileage));
    url.searchParams.set("include", "ci");
    if (args.trim !== undefined && args.trim !== null && args.trim.trim().length > 0) {
      url.searchParams.set("trim", args.trim);
    }

    return this.executeLookup<ManheimYmmResponse>({
      url:        url.toString(),
      token,
      requestId:  args.requestId,
      lookupType: "ymm",
      startMs:    start,
    });
  }

  // ── Lookup execution ───────────────────────────────────────────────────────

  private async executeLookup<T extends ManheimVinResponse | ManheimYmmResponse>(args: {
    url:        string;
    token:      string;
    requestId:  string;
    lookupType: "vin" | "ymm";
    startMs:    number;
  }): Promise<T> {
    let response: Response;
    let attempts: number;
    try {
      const result = await this.fetchWithRetry(args.url, {
        method:  "GET",
        headers: { Authorization: `Bearer ${args.token}` },
      }, args.requestId);
      response = result.response;
      attempts = result.attempts;
    } catch (err) {
      log("manheim.http.failure", {
        requestId: args.requestId,
        error_category: errorCategory(err),
        error_code: err instanceof Error ? err.name : "unknown",
        attempts: HTTP_RETRY_OPTS.maxAttempts,
      });
      throw err;
    }

    const fetchedAt = new Date().toISOString();
    const retryCount = attempts - 1;
    const latencyMs = Date.now() - args.startMs;

    // 404 = "no MMR data for this VIN/YMM" — a valid result, not an error.
    if (response.status === 404) {
      log("manheim.http.complete", {
        requestId: args.requestId,
        mmr_value: null,
        latency_ms: latencyMs,
        attempts,
        kpi: true,
      });
      return {
        mmr_value: null,
        payload:   {},
        fetched_at: fetchedAt,
        retryCount,
      } as T;
    }

    // Auth failure surfaced from MMR endpoint — caller will refresh on next call.
    if (response.status === 401 || response.status === 403) {
      log("manheim.http.failure", {
        requestId: args.requestId,
        error_category: "auth",
        error_code: "manheim_auth_error",
        attempts,
      });
      throw new ManheimAuthError("Manheim MMR endpoint rejected bearer token", {
        status: response.status,
      });
    }

    if (!response.ok) {
      // Non-retryable 4xx (other than 429 which is handled in the retry loop).
      log("manheim.http.failure", {
        requestId: args.requestId,
        error_category: "response_shape",
        error_code: "manheim_response_error",
        attempts,
      });
      throw new ManheimResponseError("Manheim returned non-OK status", {
        status: response.status,
      });
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch (err) {
      log("manheim.http.failure", {
        requestId: args.requestId,
        error_category: "response_shape",
        error_code: "manheim_response_error",
        attempts,
      });
      throw new ManheimResponseError("Manheim returned malformed JSON body", {
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    const mmrValue = extractMmrValue(payload);

    log("manheim.http.complete", {
      requestId: args.requestId,
      mmr_value: mmrValue,
      latency_ms: latencyMs,
      attempts,
      kpi: true,
    });

    return {
      mmr_value: mmrValue,
      payload,
      fetched_at: fetchedAt,
      retryCount,
    } as T;
  }

  // ── HTTP retry wrapper ─────────────────────────────────────────────────────

  /**
   * Fetch with retry on 429 / 5xx / network errors. Honors `Retry-After` on
   * 429 (uses max of header and computed backoff). Returns the final
   * `Response` (success or non-retryable error) plus attempt count.
   *
   * Status 4xx other than 429 is NOT retryable — surfaced via the returned
   * Response so the caller can map the error semantically.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    requestId: string,
  ): Promise<FetchAttemptResult> {
    let attempts = 0;
    let pendingRetryAfterMs: number | null = null;

    const result = await retryWithBackoff<Response>(
      async () => {
        attempts++;
        const attemptStart = Date.now();
        let res: Response;
        try {
          res = await this.fetchFn(url, init);
        } catch (err) {
          log(attempts === 1 ? "manheim.http.request" : "manheim.http.retry", {
            requestId,
            attempt: attempts,
            status:  null,
            latency_ms: Date.now() - attemptStart,
          });
          throw new NetworkError(err);
        }

        log(attempts === 1 ? "manheim.http.request" : "manheim.http.retry", {
          requestId,
          attempt: attempts,
          status:  res.status,
          latency_ms: Date.now() - attemptStart,
        });

        if (res.status === 429) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
          pendingRetryAfterMs = retryAfterMs;
          throw new RetryableHttpError(res, retryAfterMs);
        }

        if (res.status >= 500 && res.status < 600) {
          throw new RetryableHttpError(res, null);
        }

        // Success or non-retryable client error — return as-is.
        return res;
      },
      {
        maxAttempts: HTTP_RETRY_OPTS.maxAttempts,
        baseDelayMs: HTTP_RETRY_OPTS.baseDelayMs,
        maxDelayMs:  HTTP_RETRY_OPTS.maxDelayMs,
        jitterRatio: HTTP_RETRY_OPTS.jitterRatio,
        shouldRetry: (err) =>
          err instanceof RetryableHttpError || err instanceof NetworkError,
        onRetry: (err, attempt, nextDelayMs) => {
          // Honor Retry-After on 429: take whichever is larger.
          if (err instanceof RetryableHttpError && pendingRetryAfterMs !== null) {
            const honored = Math.max(nextDelayMs, pendingRetryAfterMs);
            // We can't override the scheduled delay from here; emit a log so
            // operators can see the requested floor. The retry helper's
            // computed delay is a soft lower bound when backoff < Retry-After
            // — in practice, with baseDelayMs=500 and ratios ≤2, the gap is
            // never large enough to exceed Manheim's typical 1–5s asks.
            log("manheim.http.retry_after_observed", {
              requestId,
              attempt,
              retry_after_ms: pendingRetryAfterMs,
              scheduled_delay_ms: nextDelayMs,
              honored_delay_ms:   honored,
            });
          }
          pendingRetryAfterMs = null;
        },
      },
    ).catch((err) => {
      // retryWithBackoff exhausted attempts — map to the right typed error.
      if (err instanceof RetryableHttpError) {
        if (err.response.status === 429) {
          throw new ManheimRateLimitError("Manheim rate limited; retries exhausted", {
            retry_after_ms: err.retryAfterMs,
            attempts,
          });
        }
        throw new ManheimUnavailableError("Manheim 5xx; retries exhausted", {
          status:   err.response.status,
          attempts,
        });
      }
      if (err instanceof NetworkError) {
        throw new ManheimUnavailableError("Manheim network error; retries exhausted", {
          cause: err.cause instanceof Error ? err.cause.message : String(err.cause),
          attempts,
        });
      }
      throw err;
    });

    return { response: result, attempts };
  }

  // ── Token caching + single-flight refresh ──────────────────────────────────

  private async getAccessToken(requestId: string): Promise<string> {
    const cached = await this.kv.get<CachedToken>(TOKEN_KV_KEY, { type: "json" });
    const now = Date.now();

    if (cached && cached.expires_at > now + TOKEN_EXPIRY_BUFFER_MS) {
      log("manheim.token.cached", {
        requestId,
        age_seconds: Math.max(0, Math.floor((now - (cached.expires_at - TOKEN_EXPIRY_BUFFER_MS)) / 1000)),
      });
      return cached.access_token;
    }

    return this.refreshTokenSingleFlight(requestId);
  }

  /**
   * Refresh the OAuth token under a best-effort KV lock. If another request
   * holds the lock, poll the token cache until it appears (up to ~2.5s);
   * fall back to throwing `ManheimAuthError` if neither path produced a
   * token.
   *
   * NOTE: KV has no native compare-and-swap, so two simultaneous callers can
   * both "acquire" the lock in the same ~50ms window. The token endpoint is
   * idempotent and the KV write is last-write-wins, so the worst case is one
   * extra OAuth call — acceptable.
   */
  private async refreshTokenSingleFlight(requestId: string): Promise<string> {
    // Try to acquire the refresh lock.
    const existing = await this.kv.get(TOKEN_REFRESH_LOCK_KEY);
    if (existing && existing !== requestId) {
      // Someone else is refreshing — wait for them, then re-read the cache.
      for (let i = 0; i < TOKEN_REFRESH_LOCK_MAX_POLLS; i++) {
        await SLEEP(LOCK_RETRY_INTERVAL_MS);
        const refreshed = await this.kv.get<CachedToken>(TOKEN_KV_KEY, { type: "json" });
        if (refreshed && refreshed.expires_at > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
          log("manheim.token.cached", { requestId, age_seconds: 0 });
          return refreshed.access_token;
        }
      }
      log("manheim.token.refresh_failed", {
        requestId,
        status: null,
        error_category: "lock_wait_timeout",
      });
      throw new ManheimAuthError("Token refresh lock held by other request; wait timed out");
    }

    // Acquire (best-effort).
    await this.kv.put(TOKEN_REFRESH_LOCK_KEY, requestId, {
      expirationTtl: TOKEN_REFRESH_LOCK_TTL_S,
    });

    try {
      return await this.fetchAndStoreToken(requestId);
    } finally {
      // Release only if we still own it.
      const owner = await this.kv.get(TOKEN_REFRESH_LOCK_KEY);
      if (owner === requestId) {
        await this.kv.delete(TOKEN_REFRESH_LOCK_KEY);
      }
    }
  }

  private async fetchAndStoreToken(requestId: string): Promise<string> {
    log("manheim.token.refresh_started", { requestId });

    const body = new URLSearchParams({
      grant_type:    "password",
      username:      this.env.MANHEIM_USERNAME,
      password:      this.env.MANHEIM_PASSWORD,
      client_id:     this.env.MANHEIM_CLIENT_ID,
      client_secret: this.env.MANHEIM_CLIENT_SECRET,
    });

    let res: Response;
    try {
      res = await this.fetchFn(this.env.MANHEIM_TOKEN_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    body.toString(),
      });
    } catch (err) {
      log("manheim.token.refresh_failed", {
        requestId,
        status: null,
        error_category: "network",
      });
      throw new ManheimUnavailableError("Manheim token endpoint network error", {
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    if (res.status === 401 || res.status === 403) {
      log("manheim.token.refresh_failed", {
        requestId,
        status: res.status,
        error_category: "auth",
      });
      throw new ManheimAuthError("Manheim rejected OAuth credentials", {
        status: res.status,
      });
    }

    if (!res.ok) {
      // Decision (2026-05-07): 5xx and network failures from the token
      // endpoint surface as ManheimUnavailableError (infrastructure
      // availability), not ManheimAuthError (credentials/configuration).
      // Dashboards and retry behavior must distinguish them.
      if (res.status >= 500 && res.status < 600) {
        log("manheim.token.refresh_failed", {
          requestId,
          status: res.status,
          error_category: "upstream",
        });
        throw new ManheimUnavailableError("Manheim token endpoint 5xx", {
          status: res.status,
        });
      }
      log("manheim.token.refresh_failed", {
        requestId,
        status: res.status,
        error_category: "response_shape",
      });
      throw new ManheimAuthError("Manheim token endpoint returned non-OK", {
        status: res.status,
      });
    }

    let parsed: { access_token?: string; expires_in?: number };
    try {
      parsed = (await res.json()) as { access_token?: string; expires_in?: number };
    } catch (err) {
      log("manheim.token.refresh_failed", {
        requestId,
        status: res.status,
        error_category: "response_shape",
      });
      throw new ManheimAuthError("Manheim token response was not JSON", {
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    if (!parsed.access_token || typeof parsed.expires_in !== "number") {
      log("manheim.token.refresh_failed", {
        requestId,
        status: res.status,
        error_category: "response_shape",
      });
      throw new ManheimAuthError("Manheim token response missing access_token / expires_in");
    }

    const expiresAt = Date.now() + parsed.expires_in * 1000;
    const cached: CachedToken = {
      access_token: parsed.access_token,
      expires_at:   expiresAt,
    };

    // KV requires expirationTtl >= 60s. Subtract the early-refresh buffer.
    const kvTtl = Math.max(60, parsed.expires_in - 60);
    await this.kv.put(TOKEN_KV_KEY, JSON.stringify(cached), { expirationTtl: kvTtl });

    log("manheim.token.refresh_complete", {
      requestId,
      expires_in: parsed.expires_in,
    });

    return parsed.access_token;
  }
}
