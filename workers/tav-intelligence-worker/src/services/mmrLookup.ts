/**
 * MMR lookup orchestration.
 *
 * Single-purpose entrypoint that handlers (and the future bulk replay job)
 * call to retrieve an `MmrResponseEnvelope`. It owns the cache-then-lock
 * dance defined in `archive/2026-05-doc-consolidation/manheim-integration-architecture.md §4`:
 *
 *   1. Resolve mileage via the shared inferred-mileage helper.
 *   2. Derive the cache key (VIN- or YMM-namespaced).
 *   3. Read the cache (skipped on `force_refresh`).
 *   4. On miss, attempt to acquire the anti-stampede lock.
 *      - acquired → re-check cache, then call Manheim, write cache,
 *        release lock.
 *      - lock held by another → wait, re-read cache; throw `CacheLockError`
 *        on timeout.
 *
 * Event vocabulary (locked 2026-05-07; see archive/2026-05-doc-consolidation/api-error-handling.md and
 * archive/2026-05-doc-consolidation/manheim-runtime-behavior.md):
 *   mmr.lookup.start        — entry, before any I/O
 *   mmr.lookup.cache_hit    — any cache read returned a populated envelope
 *   mmr.lookup.cache_miss   — initial cache read returned null
 *   mmr.lookup.lock_wait    — lock held by another; waiting
 *   mmr.lookup.complete     — final success path (KPI)
 *   mmr.lookup.failure      — final error path (KPI); error rethrown
 *
 * No I/O lives here other than the calls into the injected dependencies.
 * Each dependency is small and mockable, which keeps unit tests pure.
 *
 * Phase G.2 wires three optional Postgres repos (queryRepo, cacheRepo,
 * activityRepo) as best-effort writes — they never block the response.
 */

import type { MmrLookupAdjustments } from "../../../../src/types/intelligence";
import { hasMmrLookupAdjustments } from "../../../../src/types/intelligence";
import type { MmrResponseEnvelope } from "../validate";
import type { CoxMmrQueryAdjustments, ManheimClient } from "../clients/manheim";
import type { MmrCache } from "../cache/mmrCache";
import type { CacheLock } from "../cache/lock";
import type { UserContext } from "../auth/userContext";
import type { MmrQueriesRepository } from "../persistence/mmrQueriesRepository";
import type { MmrCacheRepository } from "../persistence/mmrCacheRepository";
import type { UserActivityRepository } from "../persistence/userActivityRepository";
import type { RateLimiter } from "../rateLimit/rateLimiter";
import { deriveVinCacheKey, deriveYmmCacheKey } from "../cache/mmrCacheKey";
import {
  POSITIVE_CACHE_TTL_SECONDS,
  NEGATIVE_CACHE_TTL_SECONDS,
  LOCK_TIMEOUT_MS,
} from "../cache/constants";
import { getMmrMileageData } from "../../../../src/scoring/mmrMileage";
import { CacheLockError, IntelligenceError } from "../errors";
import { log } from "../utils/logger";
import type { LogFields } from "../utils/logger";

export type MmrLookupInput =
  | {
      kind:    "vin";
      vin:     string;
      /**
       * Optional. The VIN itself is the canonical identity for year/make/model on the
       * Cox MMR side — `lookupByVin` does NOT forward year to Cox. When absent, no
       * odometer is sent to Cox (Manheim uses the vehicle's own mileage data).
       */
      year?:         number;
      mileage?:      number;
      adjustments?:  MmrLookupAdjustments;
    }
  | {
      kind:         "ymm";
      year:         number;
      make:         string;
      model:        string;
      trim?:        string;
      /** When omitted, Cox prices at the segment average odometer (no ?odometer=). */
      mileage?:     number;
      adjustments?: MmrLookupAdjustments;
    };

function toCoxAdjustments(adjustments?: MmrLookupAdjustments): CoxMmrQueryAdjustments | undefined {
  if (!hasMmrLookupAdjustments(adjustments)) return undefined;
  const adj = adjustments!;
  return {
    ...(adj.region !== undefined ? { region: adj.region } : {}),
    ...(adj.grade !== undefined ? { grade: adj.grade } : {}),
    ...(adj.color !== undefined ? { color: adj.color } : {}),
    ...(adj.exclude_build !== undefined ? { excludeBuild: adj.exclude_build } : {}),
    ...(adj.evbh !== undefined ? { evbh: adj.evbh } : {}),
  };
}

export interface MmrLookupArgs {
  input:         MmrLookupInput;
  requestId:     string;
  forceRefresh?: boolean;
  /** Cloudflare Access identity — used to populate audit records. */
  userContext?:  UserContext;
  /** Override clock for deterministic mileage inference in tests. */
  now?:          () => Date;
}

export interface MmrLookupDeps {
  client:       ManheimClient;
  cache:        MmrCache;
  lock:         CacheLock;
  /** Postgres audit log of every MMR lookup. Best-effort — absence skips write. */
  queryRepo?:    MmrQueriesRepository;
  /** Postgres mirror of the KV cache entry. Best-effort — absence skips write. */
  cacheRepo?:    MmrCacheRepository;
  /** Portal presence + activity feed. Best-effort — absence skips write. */
  activityRepo?: UserActivityRepository;
  /**
   * Live-call rate limiter. Checked just before any real Manheim HTTP call —
   * never on cache hits. Absence disables rate limiting (e.g. in tests).
   */
  rateLimiter?:  RateLimiter;
}

const NULL_USER_CONTEXT: UserContext = {
  userId: null, email: null, name: null, roles: [],
};

/** Resolved mileage for cache keys, Cox calls, and the response envelope. */
interface LookupMileage {
  /** Stored in `mileage_used`; null when no odometer was supplied or inferred. */
  envelopeValue: number | null;
  isInferred:    boolean;
  /** Passed to Manheim; undefined omits the odometer query param on VIN lookups. */
  clientValue:   number | undefined;
  /** Included in the cache key when defined. */
  cacheValue:    number | undefined;
}

function resolveLookupMileage(input: MmrLookupInput, now: Date): LookupMileage {
  if (input.mileage === undefined) {
    return {
      envelopeValue: null,
      isInferred:    false,
      clientValue:   undefined,
      cacheValue:    undefined,
    };
  }

  const inferenceYear =
    input.kind === "ymm"
      ? input.year
      : input.year ?? now.getFullYear();
  const data = getMmrMileageData(inferenceYear, input.mileage, now);
  return {
    envelopeValue: data.value,
    isInferred:    data.isInferred,
    clientValue:   data.value,
    cacheValue:    data.value,
  };
}

/**
 * Run a cached, single-flight Manheim MMR lookup.
 *
 * Resolution order:
 *   1. Cache hit (unless `forceRefresh`) → returned with `cache_hit: true`.
 *   2. Lock acquired → fetch from Manheim, persist to cache, return.
 *   3. Lock held → wait for release, re-read cache. Throws `CacheLockError`
 *      if the cache is still empty after the wait window.
 *
 * Errors from `client.lookup*` (e.g. `ManheimUnavailableError`,
 * `ManheimRateLimitError`) bubble unchanged so the handler layer can map
 * them to HTTP responses via the standard error envelope. The orchestrator
 * emits `mmr.lookup.failure` before rethrowing — handlers do NOT need to
 * log the failure again unless they add domain context.
 */
export async function performMmrLookup(
  args: MmrLookupArgs,
  deps: MmrLookupDeps,
): Promise<MmrResponseEnvelope> {
  const start       = Date.now();
  const requestId   = args.requestId;
  const adjustments = args.input.adjustments;
  const skipCache   = hasMmrLookupAdjustments(adjustments);
  const forceRefresh = args.forceRefresh === true || skipCache;
  const userCtx     = args.userContext ?? NULL_USER_CONTEXT;
  const coxAdj      = toCoxAdjustments(adjustments);

  // 1. Resolve mileage — skip inference when caller did not supply mileage (VIN and YMM).
  const nowDate = args.now?.() ?? new Date();
  const lookupMileage = resolveLookupMileage(args.input, nowDate);

  // 2. Derive cache key.
  // Use the exact mileage (no 5,000-mile bucket) when the caller supplied a
  // real odometer value. Bucketing is reserved for estimated/inferred mileage
  // where ±2,500-mile imprecision is acceptable. User-entered or listing-actual
  // mileages need distinct keys so every unique value gets the right Cox adjustment.
  const exactMileage = !lookupMileage.isInferred && lookupMileage.cacheValue !== undefined;
  const cacheKey =
    args.input.kind === "vin"
      ? deriveVinCacheKey(args.input.vin, lookupMileage.cacheValue, exactMileage)
      : deriveYmmCacheKey({
          year:    args.input.year,
          make:    args.input.make,
          model:   args.input.model,
          trim:    args.input.trim ?? null,
          mileage: lookupMileage.cacheValue,
          exact:   exactMileage,
        });

  log("mmr.lookup.start", {
    requestId,
    route:           args.input.kind,
    cacheKey,
    forceRefresh,
    inferredMileage: lookupMileage.isInferred,
  });

  try {
    // 3. Cache read (skipped on force_refresh).
    if (!forceRefresh) {
      const cached = await deps.cache.get(cacheKey, requestId);
      if (cached !== null) {
        const latencyMs = Date.now() - start;
        log("mmr.lookup.cache_hit", { requestId, cacheKey, path: "initial" });
        log("mmr.lookup.complete", {
          requestId,
          route:           args.input.kind,
          cacheHit:        true,
          lockAttempted:   false,
          cacheKey,
          inferredMileage: lookupMileage.isInferred,
          retryCount:      0,
          latencyMs,
          kpi: true,
        });
        const envelope: MmrResponseEnvelope = { ...cached, cache_hit: true };
        await writePersistenceRecords(deps, {
          requestId, input: args.input, userCtx, envelope,
          cacheHit: true, forceRefresh, retryCount: 0, latencyMs, outcome: "hit",
          writeCacheMirror: false, cacheKey,
        });
        return envelope;
      }
      log("mmr.lookup.cache_miss", { requestId, cacheKey });
    }

    // 4. Lock acquire.
    //
    // Adjustment recomputes (skipCache=true) bypass the lock entirely. They
    // are force-refresh by definition — they neither read nor write the
    // cache, so the lock serves no purpose and only causes contention when
    // a buyer changes color/grade while an odometer recompute is in flight.
    // Two concurrent adjustment calls now each issue their own live Cox
    // request and return independently, which is exactly what the UI expects.
    const acquired = skipCache || await deps.lock.acquire(cacheKey, LOCK_TIMEOUT_MS, requestId);

    if (acquired) {
      try {
        // Re-check cache — another request may have populated it between our
        // miss and our acquire.
        if (!forceRefresh) {
          const recheck = await deps.cache.get(cacheKey, requestId);
          if (recheck !== null) {
            const latencyMs = Date.now() - start;
            log("mmr.lookup.cache_hit", { requestId, cacheKey, path: "recheck" });
            log("mmr.lookup.complete", {
              requestId,
              route:           args.input.kind,
              cacheHit:        true,
              lockAttempted:   true,
              cacheKey,
              inferredMileage: lookupMileage.isInferred,
              retryCount:      0,
              latencyMs,
              kpi: true,
            });
            const envelope: MmrResponseEnvelope = { ...recheck, cache_hit: true };
            await writePersistenceRecords(deps, {
              requestId, input: args.input, userCtx, envelope,
              cacheHit: true, forceRefresh, retryCount: 0, latencyMs, outcome: "hit",
              writeCacheMirror: false, cacheKey,
            });
            return envelope;
          }
        }

        // Rate-limit guard — only fires on live upstream calls, never on
        // cache hits (the early-return paths above bypass this entirely).
        await deps.rateLimiter?.check(userCtx.email, requestId);

        // Live Manheim call.
        const result =
          args.input.kind === "vin"
            ? await deps.client.lookupByVin({
                vin:          args.input.vin,
                ...(lookupMileage.clientValue !== undefined
                  ? { mileage: lookupMileage.clientValue }
                  : {}),
                requestId,
                ...(coxAdj !== undefined ? { adjustments: coxAdj } : {}),
              })
            : await deps.client.lookupByYmm({
                year:         args.input.year,
                make:         args.input.make,
                model:        args.input.model,
                ...(args.input.trim !== undefined ? { trim: args.input.trim } : {}),
                ...(lookupMileage.clientValue !== undefined
                  ? { mileage: lookupMileage.clientValue }
                  : {}),
                requestId,
                ...(coxAdj !== undefined ? { adjustments: coxAdj } : {}),
              });

        const ttl =
          result.mmr_value === null
            ? NEGATIVE_CACHE_TTL_SECONDS
            : POSITIVE_CACHE_TTL_SECONDS;
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

        const envelope: MmrResponseEnvelope = {
          ok:                  result.mmr_value !== null,
          mmr_value:           result.mmr_value,
          mileage_used:        lookupMileage.envelopeValue,
          is_inferred_mileage: lookupMileage.isInferred,
          cache_hit:           false,
          source:              "manheim",
          fetched_at:          result.fetched_at,
          expires_at:          expiresAt,
          mmr_payload:         result.payload,
          error_code:          null,
          error_message:       null,
        };

        // Adjustment lookups skip cache — do not overwrite the base VIN/YMM entry.
        if (!skipCache) {
          try {
            await deps.cache.set(cacheKey, envelope, ttl, requestId);
          } catch (err) {
            log("mmr.lookup.cache_set_failed", {
              requestId,
              cacheKey,
              error_message: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const latencyMs = Date.now() - start;
        log("mmr.lookup.complete", {
          requestId,
          route:           args.input.kind,
          cacheHit:        false,
          lockAttempted:   !skipCache,
          cacheKey,
          inferredMileage: lookupMileage.isInferred,
          retryCount:      result.retryCount,
          latencyMs,
          kpi: true,
        });

        await writePersistenceRecords(deps, {
          requestId, input: args.input, userCtx, envelope,
          cacheHit: false, forceRefresh, retryCount: result.retryCount,
          latencyMs, outcome: "miss", writeCacheMirror: !skipCache, cacheKey,
        });

        return envelope;
      } finally {
        // Release ONLY when we actually acquired the lock. Adjustment
        // recomputes skip acquire and therefore must skip release too,
        // otherwise they could delete a lock owned by a concurrent
        // cache-miss lookup.
        if (!skipCache) {
          await deps.lock.release(cacheKey, requestId);
        }
      }
    }

    // 5. Lock held by someone else — wait, then re-read.
    // Unreachable when skipCache=true (acquired is always true above), but
    // kept for the normal cache-miss path.
    log("mmr.lookup.lock_wait", { requestId, cacheKey });
    await deps.lock.wait(cacheKey, LOCK_TIMEOUT_MS);
    const afterWait = await deps.cache.get(cacheKey, requestId);
    if (afterWait !== null) {
      const latencyMs = Date.now() - start;
      log("mmr.lookup.cache_hit", { requestId, cacheKey, path: "after_wait" });
      log("mmr.lookup.complete", {
        requestId,
        route:           args.input.kind,
        cacheHit:        true,
        lockAttempted:   true,
        cacheKey,
        inferredMileage: lookupMileage.isInferred,
        retryCount:      0,
        latencyMs,
        kpi: true,
      });
      const envelope: MmrResponseEnvelope = { ...afterWait, cache_hit: true };
      await writePersistenceRecords(deps, {
        requestId, input: args.input, userCtx, envelope,
        cacheHit: true, forceRefresh, retryCount: 0, latencyMs, outcome: "hit",
        writeCacheMirror: false, cacheKey,
      });
      return envelope;
    }

    // Cache still empty after the wait window — surface as 503 so the caller
    // can decide whether to retry.
    throw new CacheLockError("Lock contention exceeded wait window", { cacheKey });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorCode =
      err instanceof IntelligenceError ? err.code :
      err instanceof Error             ? err.name :
      "unknown";
    const errorMessage = err instanceof Error ? err.message : String(err);

    log("mmr.lookup.failure", {
      requestId,
      route:           args.input.kind,
      cacheKey,
      inferredMileage: lookupMileage.isInferred,
      error_code:      errorCode,
      error_message:   errorMessage,
      latencyMs,
      kpi: true,
    });

    await silentWrite(
      () =>
        deps.queryRepo?.insert({
          requestId, input: args.input, userContext: userCtx,
          envelope:     null,
          cacheHit:     false,
          forceRefresh,
          retryCount:   0,
          latencyMs,
          outcome:      "error",
          errorCode,
          errorMessage,
        }) ?? Promise.resolve(),
      "mmr.persist.query_write_failed",
      { requestId, cacheKey },
    );

    throw err;
  }
}

// ── Persistence helpers ───────────────────────────────────────────────────────

interface PersistArgs {
  requestId:       string;
  input:           MmrLookupInput;
  userCtx:         UserContext;
  envelope:        MmrResponseEnvelope;
  cacheHit:        boolean;
  forceRefresh:    boolean;
  retryCount:      number;
  latencyMs:       number;
  outcome:         "hit" | "miss" | "error";
  writeCacheMirror: boolean;
  cacheKey:        string;
}

async function writePersistenceRecords(
  deps: MmrLookupDeps,
  p: PersistArgs,
): Promise<void> {
  // Activity record — every lookup, presence TTL of 5 min.
  await silentWrite(
    () => {
      const base = {
        userContext:      p.userCtx,
        activityType:     "mmr_search" as const,
        activityPayload:  { lookupType: p.input.kind, cacheHit: p.cacheHit, forceRefresh: p.forceRefresh },
        activeUntil:      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
      const extraFields = p.input.kind === "vin"
        ? { vin: p.input.vin, year: p.input.year }
        : { year: p.input.year, make: p.input.make, model: p.input.model };
      return deps.activityRepo?.insert({ ...base, ...extraFields }) ?? Promise.resolve();
    },
    "mmr.persist.activity_write_failed",
    { requestId: p.requestId, cacheKey: p.cacheKey },
  );

  // Audit record.
  await silentWrite(
    () =>
      deps.queryRepo?.insert({
        requestId:   p.requestId,
        input:       p.input,
        userContext: p.userCtx,
        envelope:    p.envelope,
        cacheHit:    p.cacheHit,
        forceRefresh: p.forceRefresh,
        retryCount:  p.retryCount,
        latencyMs:   p.latencyMs,
        outcome:     p.outcome,
      }) ?? Promise.resolve(),
    "mmr.persist.query_write_failed",
    { requestId: p.requestId, cacheKey: p.cacheKey },
  );

  // Postgres cache mirror — only on live Manheim calls.
  if (p.writeCacheMirror) {
    await silentWrite(
      () =>
        deps.cacheRepo?.upsert({
          cacheKey: p.cacheKey,
          input:    p.input,
          envelope: p.envelope,
        }) ?? Promise.resolve(),
      "mmr.persist.cache_write_failed",
      { requestId: p.requestId, cacheKey: p.cacheKey },
    );
  }
}

async function silentWrite(
  fn: () => Promise<void>,
  event:  string,
  fields: LogFields,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log(event, {
      ...fields,
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}
