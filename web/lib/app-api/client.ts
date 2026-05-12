/**
 * Typed, browser-callable client for the `/app/*` product API.
 *
 * Every function hits the same-origin Next proxy (`/api/app/<path>` — see
 * `web/app/api/app/[...path]/route.ts`), which injects the server-side Bearer and
 * forwards to the Cloudflare Worker. No secret or Worker URL is referenced here, so
 * this module is safe to import from client components. Each call returns an
 * `ApiResult<T>` (see `parse.ts`) — never throws on an HTTP error, only on a network
 * failure that even `fetch` can't model.
 *
 * The server-side equivalent (RSC first-paint) lives in `server.ts` and is kept
 * deliberately parallel — same names, same parsers, different transport.
 */
import {
  parseHistoricalSales,
  parseImportBatches,
  parseKpis,
  parseMmrVin,
  parseSystemStatus,
  type ApiResult,
} from "./parse";
import { codeMessage } from "./missing-reason";
import type { HistoricalSale, ImportBatch, Kpis, MmrVinOk, SystemStatus } from "./schemas";

/** Query filter for `GET /app/historical-sales` (all fields optional; see `docs/APP_API.md`). */
export type HistoricalSalesFilter = {
  /** Default 20, clamped to 100 by the Worker. */
  limit?: number;
  year?: number;
  make?: string;
  model?: string;
  /** ISO date — only sales on/after this date. */
  since?: string;
};

/** Request body for `POST /app/mmr/vin`. */
export type MmrVinRequest = {
  vin: string;
  year?: number;
  mileage?: number;
};

const PROXY_PREFIX = "/api/app";

/** Build the `?...` query string for `historical-sales`; empty string when no filters. */
export function historicalSalesQuery(filter: HistoricalSalesFilter = {}): string {
  const params = new URLSearchParams();
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  if (filter.year !== undefined) params.set("year", String(filter.year));
  if (filter.make) params.set("make", filter.make);
  if (filter.model) params.set("model", filter.model);
  if (filter.since) params.set("since", filter.since);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** `?limit=` for `import-batches` (empty when unset). */
export function importBatchesQuery(limit?: number): string {
  return limit === undefined ? "" : `?limit=${encodeURIComponent(String(limit))}`;
}

/** Best-effort JSON read — the parsers treat a non-object body as `bad_response`. */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The browser couldn't even reach our own `/api/app/*` route (offline, DNS, aborted,
 * `fetch` rejected). This is a browser-to-`/web` transport failure — distinct from a
 * Worker `/app/*` error or a `/web`-to-Worker proxy error — so it's reported as
 * `kind:"proxy"` with `status:0`. UI consumes this as an `ApiResult`; the typed client
 * never throws on it.
 */
function clientTransportError<T>(): ApiResult<T> {
  return {
    ok: false,
    kind: "proxy",
    error: "client_fetch_failed",
    status: 0,
    message: codeMessage("client_fetch_failed"),
  };
}

/** Sentinel returned by the fetch wrappers when `fetch` itself rejects. */
const FETCH_FAILED = Symbol("fetch_failed");

async function getJson(
  pathWithQuery: string,
): Promise<{ status: number; json: unknown } | typeof FETCH_FAILED> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_PREFIX}/${pathWithQuery}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
  } catch {
    return FETCH_FAILED;
  }
  return { status: res.status, json: await readJson(res) };
}

export async function getSystemStatus(): Promise<ApiResult<SystemStatus>> {
  const r = await getJson("system-status");
  if (r === FETCH_FAILED) return clientTransportError();
  return parseSystemStatus(r.status, r.json);
}

export async function getKpis(): Promise<ApiResult<Kpis>> {
  const r = await getJson("kpis");
  if (r === FETCH_FAILED) return clientTransportError();
  return parseKpis(r.status, r.json);
}

export async function listImportBatches(limit?: number): Promise<ApiResult<ImportBatch[]>> {
  const r = await getJson(`import-batches${importBatchesQuery(limit)}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseImportBatches(r.status, r.json);
}

export async function listHistoricalSales(
  filter: HistoricalSalesFilter = {},
): Promise<ApiResult<HistoricalSale[]>> {
  const r = await getJson(`historical-sales${historicalSalesQuery(filter)}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseHistoricalSales(r.status, r.json);
}

export async function postMmrVin(body: MmrVinRequest): Promise<ApiResult<MmrVinOk>> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_PREFIX}/mmr/vin`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return clientTransportError();
  }
  return parseMmrVin(res.status, await readJson(res));
}
