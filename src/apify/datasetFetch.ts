import { log } from "../logging/logger";

const APIFY_API_BASE = "https://api.apify.com/v2";
const PAGE_SIZE = 1000;

/**
 * Defensive upper bound on items per run. Anything beyond this is truncated
 * and logged. Sized to comfortably hold a single Apify FB Marketplace task
 * default `maxResults: 100` plus headroom for future bumps. The /ingest Zod
 * schema independently caps at 500; truncation here is layered defense.
 */
export const MAX_ITEMS_PER_RUN = 5_000;

export class ApifyAuthError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Apify API returned HTTP ${status} (auth)`);
    this.name = "ApifyAuthError";
    this.status = status;
  }
}

export class ApifyDatasetFetchError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`Apify dataset fetch failed: HTTP ${status}`);
    this.name = "ApifyDatasetFetchError";
    this.status = status;
    // Body is logged separately and capped — keep it off the Error message
    // so secrets in headers can't leak through nested error messages.
    void body;
  }
}

interface AuthRequiredEnv {
  APIFY_TOKEN: string;
}

function authHeaders(env: AuthRequiredEnv): Record<string, string> {
  return { Authorization: `Bearer ${env.APIFY_TOKEN}` };
}

/**
 * Per-request timeout for every Apify API call. Without this a hung Apify
 * connection would consume the whole Worker request budget and the
 * source_runs row would never reach a terminal state.
 */
const FETCH_TIMEOUT_MS = 10_000;

function reqInit(env: AuthRequiredEnv): RequestInit {
  return {
    headers: authHeaders(env),
    signal:  AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };
}

/**
 * Fetches the run record for `runId` and returns its `defaultDatasetId`.
 * Used as a fallback when the inbound webhook payload omits the dataset id.
 *
 * Throws ApifyAuthError on 401/403, ApifyDatasetFetchError on any other
 * non-2xx. The runId is logged but never the token.
 */
export async function fetchApifyRunDefaultDataset(
  runId: string,
  env: AuthRequiredEnv,
): Promise<string> {
  if (!env.APIFY_TOKEN) {
    throw new ApifyAuthError(401);
  }

  const url = `${APIFY_API_BASE}/actor-runs/${encodeURIComponent(runId)}`;
  const res = await fetch(url, reqInit(env));

  if (res.status === 401 || res.status === 403) {
    log("apify.bridge.run_auth_failed", { run_id: runId, status: res.status });
    throw new ApifyAuthError(res.status);
  }
  if (!res.ok) {
    const text = await safeReadCapped(res, 500);
    log("apify.bridge.run_fetch_failed", { run_id: runId, status: res.status, body_preview: text });
    throw new ApifyDatasetFetchError(res.status, text);
  }

  const body = await res.json() as { data?: { defaultDatasetId?: string } };
  const id = body?.data?.defaultDatasetId;
  if (!id) {
    log("apify.bridge.run_dataset_missing", { run_id: runId });
    throw new ApifyDatasetFetchError(200, "defaultDatasetId missing on run record");
  }
  return id;
}

/**
 * Fetches all clean items from an Apify dataset, paginated, capped at
 * MAX_ITEMS_PER_RUN. Returns the raw item objects — schema validation happens
 * downstream in the Facebook adapter.
 *
 * Throws ApifyAuthError on 401/403, ApifyDatasetFetchError on any other
 * non-2xx. The datasetId is logged but never the token.
 */
export async function fetchApifyDatasetItems(
  datasetId: string,
  env: AuthRequiredEnv,
): Promise<{ items: unknown[]; truncated: boolean }> {
  if (!env.APIFY_TOKEN) {
    throw new ApifyAuthError(401);
  }

  const collected: unknown[] = [];
  let offset = 0;
  let truncated = false;

  while (collected.length < MAX_ITEMS_PER_RUN) {
    const remaining = MAX_ITEMS_PER_RUN - collected.length;
    const limit = Math.min(PAGE_SIZE, remaining);
    const url =
      `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items` +
      `?clean=true&format=json&limit=${limit}&offset=${offset}`;

    const res = await fetch(url, reqInit(env));
    if (res.status === 401 || res.status === 403) {
      log("apify.bridge.dataset_auth_failed", { dataset_id: datasetId, status: res.status });
      throw new ApifyAuthError(res.status);
    }
    if (!res.ok) {
      const text = await safeReadCapped(res, 500);
      log("apify.bridge.dataset_fetch_failed", {
        dataset_id:   datasetId,
        status:       res.status,
        offset,
        body_preview: text,
      });
      throw new ApifyDatasetFetchError(res.status, text);
    }

    const page = await res.json();
    if (!Array.isArray(page)) {
      log("apify.bridge.dataset_unexpected_shape", { dataset_id: datasetId, offset });
      throw new ApifyDatasetFetchError(200, "dataset items endpoint did not return an array");
    }
    if (page.length === 0) break;

    collected.push(...page);
    offset += page.length;

    if (page.length < limit) break; // last page
  }

  // If we hit the cap and there could be more items, surface truncated=true
  // by asking for one more record at the cap offset.
  if (collected.length >= MAX_ITEMS_PER_RUN) {
    const probeUrl =
      `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items` +
      `?clean=true&format=json&limit=1&offset=${MAX_ITEMS_PER_RUN}`;
    try {
      const res = await fetch(probeUrl, reqInit(env));
      if (res.ok) {
        const probe = await res.json();
        if (Array.isArray(probe) && probe.length > 0) truncated = true;
      }
    } catch {
      // Probe failure is non-fatal; we still return what we have.
    }
  }

  return { items: collected, truncated };
}

async function safeReadCapped(res: Response, cap: number): Promise<string> {
  try {
    const text = await res.text();
    return text.length > cap ? text.slice(0, cap) + "...[truncated]" : text;
  } catch {
    return "";
  }
}
