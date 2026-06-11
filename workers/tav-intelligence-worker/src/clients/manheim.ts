/**
 * Manheim client interface — pinned in Phase F.1.
 *
 * Phase G.1 implementation (`clients/manheimHttp.ts`):
 *   - holds an OAuth password-grant token cache (KV-backed, single-flight)
 *   - retries 429 / 5xx / network errors with exponential backoff + jitter
 *   - honors `Retry-After` on 429
 *   - throws typed `ManheimAuthError` / `ManheimRateLimitError` /
 *     `ManheimUnavailableError` / `ManheimResponseError` on terminal failure
 *   - never writes secrets to logs
 */

export interface ManheimVinResponse {
  /** MMR value for the supplied VIN + mileage. `null` = no result (negative cache). */
  mmr_value: number | null;
  /** Full Manheim payload, stored for audit + future field extraction. */
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp the lookup was performed at. */
  fetched_at: string;
  /** Number of retry attempts beyond the initial request (0 = success on first try). */
  retryCount: number;
}

export interface ManheimYmmResponse {
  mmr_value: number | null;
  payload: Record<string, unknown>;
  fetched_at: string;
  /** Number of retry attempts beyond the initial request (0 = success on first try). */
  retryCount: number;
}

export interface ManheimCatalogResponse {
  /** Catalog labels exactly as returned by Cox, preserving source order. */
  items: string[];
  /** Full Cox payload for internal diagnostics; callers must not log values. */
  payload: Record<string, unknown>;
  fetched_at: string;
  retryCount: number;
}

/** Optional Cox MMR query params for adjustment recompute (#45). */
export type CoxMmrQueryAdjustments = {
  region?:       string;
  grade?:        string;
  color?:        string;
  excludeBuild?: boolean;
  evbh?:         number;
  zipCode?:      string;
};

export interface ManheimClient {
  lookupByVin(args: {
    vin:          string;
    mileage:      number;
    requestId:    string;
    adjustments?: CoxMmrQueryAdjustments;
  }): Promise<ManheimVinResponse>;

  lookupByYmm(args: {
    year:         number;
    make:         string;
    model:        string;
    trim?:        string;
    mileage:      number;
    requestId:    string;
    adjustments?: CoxMmrQueryAdjustments;
  }): Promise<ManheimYmmResponse>;
}
