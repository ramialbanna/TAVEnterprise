/**
 * Manheim client interface — pinned in Phase F.1, implemented in Phase G.
 *
 * The Phase G impl will:
 *   - hold an OAuth client-credentials token cache (KV)
 *   - retry 429 / 5xx with exponential backoff
 *   - throw `ExternalApiError` on terminal failure
 *   - never write secrets to logs
 */

export interface ManheimVinResponse {
  /** MMR value for the supplied VIN + mileage. `null` = no result (negative cache). */
  mmr_value: number | null;
  /** Full Manheim payload, stored for audit + future field extraction. */
  payload: Record<string, unknown>;
  /** ISO-8601 timestamp the lookup was performed at. */
  fetched_at: string;
}

export interface ManheimYmmResponse {
  mmr_value: number | null;
  payload: Record<string, unknown>;
  fetched_at: string;
}

export interface ManheimClient {
  lookupByVin(args: {
    vin:       string;
    mileage:   number;
    requestId: string;
  }): Promise<ManheimVinResponse>;

  lookupByYmm(args: {
    year:      number;
    make:      string;
    model:     string;
    trim?:     string;
    mileage:   number;
    requestId: string;
  }): Promise<ManheimYmmResponse>;
}
