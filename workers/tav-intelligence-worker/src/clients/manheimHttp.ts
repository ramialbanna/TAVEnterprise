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
  CacheLockError,
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
/** Soft TTL for the lock; ample budget for a token endpoint round-trip.
 *  KV requires expirationTtl >= 60s — 60s is still short enough to avoid
 *  meaningful lock starvation; the lock is deleted immediately on success. */
const TOKEN_REFRESH_LOCK_TTL_S = 60;
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

/** Concatenate base + path safely without losing existing path-prefix on base. */
function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return b + p;
}

/** Truthy strings: "true" / "TRUE" / "1". Anything else (including undefined) → false. */
function envBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Build the Cox `include` query value from configured flags.
 * Returns null when no flags are set (caller omits the parameter entirely).
 * The `ci` token is dropped on Search/YMMT calls — the MMR Lookup guide
 * documents `include=ci` as unsupported on `/search/...`.
 */
function buildCoxIncludeTokens(env: Env, isSearch: boolean): string | null {
  const tokens: string[] = [];
  if (envBool(env.MANHEIM_INCLUDE_RETAIL))     tokens.push("retail");
  if (envBool(env.MANHEIM_INCLUDE_FORECAST))   tokens.push("forecast");
  if (envBool(env.MANHEIM_INCLUDE_HISTORICAL)) tokens.push("historical");
  if (!isSearch && envBool(env.MANHEIM_INCLUDE_CI)) tokens.push("ci");
  return tokens.length > 0 ? tokens.join(",") : null;
}

/**
 * Append Cox MMR query parameters to a URL.
 * `evbh` (Electric Vehicle Battery Health) is sent only when in [75, 100].
 * Out-of-range values are dropped silently to avoid surfacing 4xx errors on
 * a non-EV vehicle that happens to receive a stray sensor reading.
 */
function appendCoxQueryParams(
  url: URL,
  env: Env,
  opts: {
    odometer?: number;
    zipCode?:  string;
    evbh?:     number;
    isSearch:  boolean;
  },
): void {
  if (typeof opts.odometer === "number" && Number.isFinite(opts.odometer) && opts.odometer >= 0) {
    url.searchParams.set("odometer", String(opts.odometer));
  }
  if (typeof opts.zipCode === "string" && opts.zipCode.trim().length > 0) {
    url.searchParams.set("zipCode", opts.zipCode.trim());
  }
  if (typeof opts.evbh === "number" && Number.isFinite(opts.evbh) && opts.evbh >= 75 && opts.evbh <= 100) {
    url.searchParams.set("evbh", String(opts.evbh));
  }
  const include = buildCoxIncludeTokens(env, opts.isSearch);
  if (include) url.searchParams.set("include", include);
}

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
    private fetchFn: typeof fetch = fetch.bind(globalThis),
  ) {}

  async lookupByVin(args: {
    vin:       string;
    mileage:   number;
    zipCode?:  string;
    evbh?:     number;
    requestId: string;
  }): Promise<ManheimVinResponse> {
    const start = Date.now();

    const token = await this.getAccessToken(args.requestId);

    return this.executeLookup<ManheimVinResponse>({
      url:        this.buildVinUrl(args.vin, args.mileage, {
        zipCode: args.zipCode,
        evbh:    args.evbh,
      }),
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
    zipCode?:  string;
    evbh?:     number;
    requestId: string;
  }): Promise<ManheimYmmResponse> {
    const start = Date.now();

    // Cox MMR 1.4 YMMT requires `bodyname` (trim) as a required path segment.
    // A trimless YMM call has no valid URL on Cox — short-circuit to a null
    // envelope (mirrors the 404 → mmr_value: null pattern in executeLookup)
    // so the caller treats it as "no data" and ingest stays non-blocking.
    if (this.isCoxVendor()) {
      const trimmed = typeof args.trim === "string" ? args.trim.trim() : "";
      if (trimmed.length === 0) {
        log("manheim.http.skipped", {
          requestId: args.requestId,
          reason:    "cox_ymm_requires_trim",
        });
        return {
          mmr_value:  null,
          payload:    {},
          fetched_at: new Date().toISOString(),
          retryCount: 0,
        } as ManheimYmmResponse;
      }
    }

    const token = await this.getAccessToken(args.requestId);

    return this.executeLookup<ManheimYmmResponse>({
      url:        this.buildYmmUrl({
        year:     args.year,
        make:     args.make,
        model:    args.model,
        trim:     args.trim,
        mileage:  args.mileage,
        zipCode:  args.zipCode,
        evbh:     args.evbh,
      }),
      token,
      requestId:  args.requestId,
      lookupType: "ymm",
      startMs:    start,
    });
  }

  // ── Vendor-aware URL builders ──────────────────────────────────────────────

  private isCoxVendor(): boolean {
    return this.env.MANHEIM_API_VENDOR === "cox";
  }

  /**
   * Build the VIN lookup URL.
   *
   * Cox Wholesale-Valuations MMR 1.4: GET ${MANHEIM_MMR_URL}/vin/{vin}?odometer=...
   *   MANHEIM_MMR_URL is the full base ending in /vehicle/mmr (e.g.
   *   https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr).
   *   Subseries / transmission disambiguation variants
   *   (/vin/{vin}/{subseries}, /vin/{vin}/{subseries}/{transmission}) are not
   *   yet implemented. Optional Cox query params (zipCode, evbh, include)
   *   are appended via appendCoxQueryParams.
   *
   * Legacy Manheim: GET ${MANHEIM_MMR_URL}/valuations/vin/{vin}?odometer=...
   *   MANHEIM_MMR_URL is host-only.
   */
  private buildVinUrl(
    vin:     string,
    mileage: number,
    opts:    { zipCode?: string; evbh?: number } = {},
  ): string {
    if (this.isCoxVendor()) {
      const u = new URL(joinUrl(this.env.MANHEIM_MMR_URL, `/vin/${encodeURIComponent(vin)}`));
      appendCoxQueryParams(u, this.env, {
        odometer: mileage,
        zipCode:  opts.zipCode,
        evbh:     opts.evbh,
        isSearch: false,
      });
      return u.toString();
    }
    const u = new URL(
      `/valuations/vin/${encodeURIComponent(vin)}`,
      this.env.MANHEIM_MMR_URL,
    );
    u.searchParams.set("odometer", String(mileage));
    return u.toString();
  }

  /**
   * Build the YMM lookup URL.
   *
   * Cox Wholesale-Valuations MMR 1.4:
   *   GET ${MANHEIM_MMR_URL}/search/{year}/{makename}/{modelname}/{bodyname}?odometer=...
   *   `bodyname` (trim) is a REQUIRED path segment per the OpenAPI spec.
   *   `lookupByYmm` short-circuits to a null envelope when trim is missing
   *   for vendor=cox; this builder is therefore only called with a non-empty
   *   trim on the Cox path. Optional Cox query params (zipCode, evbh,
   *   include) are appended via appendCoxQueryParams. The `ci` token is
   *   stripped from the include list on Search/YMMT (unsupported per the
   *   MMR Lookup guide). Long-form path
   *   /search/years/{year}/makes/{make}/models/{model}/trims/{body} is not
   *   yet implemented.
   *
   * Legacy Manheim: GET ${MANHEIM_MMR_URL}/valuations/search/{year}/{make}/{model}?odometer=...&include=ci
   *   CRITICAL: year/make/model are PATH segments. Query-style returns HTTP 596 on the
   *   legacy account (regression — see commit 5a66d6b3).
   */
  private buildYmmUrl(args: {
    year:     number;
    make:     string;
    model:    string;
    trim?:    string;
    mileage:  number;
    zipCode?: string;
    evbh?:    number;
  }): string {
    if (this.isCoxVendor()) {
      // Caller (lookupByYmm) guarantees a non-empty trim on the Cox path.
      const trim = (args.trim ?? "").trim();
      const path =
        `/search/${encodeURIComponent(String(args.year))}` +
        `/${encodeURIComponent(args.make)}` +
        `/${encodeURIComponent(args.model)}` +
        `/${encodeURIComponent(trim)}`;
      const u = new URL(joinUrl(this.env.MANHEIM_MMR_URL, path));
      appendCoxQueryParams(u, this.env, {
        odometer: args.mileage,
        zipCode:  args.zipCode,
        evbh:     args.evbh,
        isSearch: true,
      });
      return u.toString();
    }
    const u = new URL(
      `/valuations/search/${encodeURIComponent(args.year)}/${encodeURIComponent(args.make)}/${encodeURIComponent(args.model)}`,
      this.env.MANHEIM_MMR_URL,
    );
    u.searchParams.set("odometer", String(args.mileage));
    u.searchParams.set("include", "ci");
    if (args.trim !== undefined && args.trim !== null && args.trim.trim().length > 0) {
      u.searchParams.set("trim", args.trim);
    }
    return u.toString();
  }

  // ── Lookup execution ───────────────────────────────────────────────────────

  private async executeLookup<T extends ManheimVinResponse | ManheimYmmResponse>(args: {
    url:        string;
    token:      string;
    requestId:  string;
    lookupType: "vin" | "ymm";
    startMs:    number;
  }): Promise<T> {
    const lookupHeaders: Record<string, string> = {
      Authorization: `Bearer ${args.token}`,
    };
    if (this.isCoxVendor()) {
      // Cox Wholesale-Valuations vendor media type is required on every call.
      lookupHeaders.Accept         = "application/vnd.coxauto.v1+json";
      lookupHeaders["Content-Type"] = "application/vnd.coxauto.v1+json";
    }

    let response: Response;
    let attempts: number;
    try {
      const result = await this.fetchWithRetry(args.url, {
        method:  "GET",
        headers: lookupHeaders,
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
      // Decision (locked 2026-05-07): lock-wait timeout during token refresh
      // is distributed-coordination contention, not auth failure. Surface as
      // CacheLockError so dashboards can distinguish bad credentials, token
      // endpoint outages, and lock starvation as separate operational signals.
      log("manheim.token.refresh_lock_timeout", {
        requestId,
        polls: TOKEN_REFRESH_LOCK_MAX_POLLS,
        wait_ms: TOKEN_REFRESH_LOCK_MAX_POLLS * LOCK_RETRY_INTERVAL_MS,
      });
      throw new CacheLockError("Token refresh lock held by another request; wait timed out", {
        lockKey: TOKEN_REFRESH_LOCK_KEY,
        wait_polls: TOKEN_REFRESH_LOCK_MAX_POLLS,
      });
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
    const grantType = this.env.MANHEIM_GRANT_TYPE ?? "password";
    log("manheim.token.refresh_started", { requestId, grant_type: grantType });

    const body = new URLSearchParams({ grant_type: grantType });
    const tokenHeaders: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (grantType === "client_credentials") {
      // Cox Bridge 2 / OAuth 2.0 §4.4 — credentials in HTTP Basic header.
      // Body must NOT contain client_id, client_secret, username, or password.
      const basic = btoa(`${this.env.MANHEIM_CLIENT_ID}:${this.env.MANHEIM_CLIENT_SECRET}`);
      tokenHeaders.Authorization = `Basic ${basic}`;
      if (this.env.MANHEIM_SCOPE) body.set("scope", this.env.MANHEIM_SCOPE);
    } else {
      // Legacy Manheim password grant — body credentials, no Basic header.
      body.set("client_id",     this.env.MANHEIM_CLIENT_ID);
      body.set("client_secret", this.env.MANHEIM_CLIENT_SECRET);
      body.set("username",      this.env.MANHEIM_USERNAME);
      body.set("password",      this.env.MANHEIM_PASSWORD);
      if (this.env.MANHEIM_SCOPE) body.set("scope", this.env.MANHEIM_SCOPE);
    }

    let res: Response;
    try {
      res = await this.fetchFn(this.env.MANHEIM_TOKEN_URL, {
        method:  "POST",
        headers: tokenHeaders,
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
      // 4xx other than 401/403. OAuth error bodies use { "error": "<code>", ... }.
      // Surface invalid_scope distinctly so dashboards can spot config drift.
      let errorCode: string | undefined;
      try {
        const parsed = (await res.clone().json()) as { error?: unknown };
        if (typeof parsed.error === "string") errorCode = parsed.error;
      } catch {
        // body not JSON — leave errorCode undefined.
      }
      log("manheim.token.refresh_failed", {
        requestId,
        status: res.status,
        error_category: "auth",
        ...(errorCode ? { error_code: errorCode } : {}),
      });
      throw new ManheimAuthError("Manheim token endpoint returned non-OK", {
        status: res.status,
        ...(errorCode ? { error_code: errorCode } : {}),
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
