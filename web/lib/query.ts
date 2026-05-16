import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query configuration for the dashboard.
 *
 * Retry policy & `ApiResult`: the typed `/app/*` client (`lib/app-api/client.ts`) returns
 * an `ApiResult` discriminated union and does **not** throw on expected API/transport
 * failures. A query function built on it therefore decides for itself whether `!result.ok`
 * is "error enough" to `throw` (so React Query shows an error state). When it does throw the
 * `ApiResult` error object, `isRetryableError` inspects `kind` and only retries the
 * transient kinds (`unavailable`, `proxy`). `unauthorized` and `invalid` never retry. An
 * unexpected thrown value (e.g. a raw network `Error` from the server-side fetch helper, or
 * a bug) is treated as transient and retried up to `MAX_QUERY_RETRIES`.
 */

/** Poll interval for `GET /app/system-status` (the header health pill). */
export const SYSTEM_STATUS_REFETCH_MS = 30_000;

const DEFAULT_STALE_TIME_MS = 30_000;
const MAX_QUERY_RETRIES = 2;

export type HistoricalSalesKeyFilter = {
  limit?: number;
  year?: number;
  make?: string;
  model?: string;
  since?: string;
};

export type IngestRunsKeyFilter = {
  limit?: number;
  source?: string;
  region?: string;
  status?: string;
};

/** Stable query-key factory. Object/array identity is irrelevant to TanStack — it deep-compares. */
export const queryKeys = {
  systemStatus: ["system-status"] as const,
  kpis: ["kpis"] as const,
  importBatches: (limit?: number) => ["import-batches", limit ?? null] as const,
  historicalSales: (filter?: HistoricalSalesKeyFilter) => ["historical-sales", filter ?? {}] as const,
  ingestRuns: (filter?: IngestRunsKeyFilter) => ["ingest-runs", filter ?? {}] as const,
  ingestRun: (id: string) => ["ingest-run", id] as const,
} as const;

function looksLikeApiError(error: unknown): error is { ok: false; kind: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "ok" in error &&
    (error as { ok: unknown }).ok === false &&
    "kind" in error &&
    typeof (error as { kind: unknown }).kind === "string"
  );
}

/** True when a thrown query error should be retried. */
export function isRetryableError(error: unknown): boolean {
  if (looksLikeApiError(error)) {
    return error.kind === "unavailable" || error.kind === "proxy";
  }
  // Unknown throw — assume a transient network/runtime blip.
  return true;
}

/** The shared retry predicate (exported for tests). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error);
}

/** Build a fresh `QueryClient` with the dashboard's defaults. One per browser session. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
