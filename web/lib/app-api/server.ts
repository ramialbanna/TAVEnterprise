import "server-only";

/**
 * Server-side `/app/*` fetch — for RSC first-paint data.
 *
 * Same surface as `client.ts` (`getSystemStatus`, `getKpis`, `listImportBatches`,
 * `listHistoricalSales`, `postMmrVin`) and the same `parse.ts` parsers, but it calls
 * `${APP_API_BASE_URL}/app/<path>` directly with the `Authorization: Bearer
 * ${APP_API_SECRET}` header instead of going through the same-origin proxy. Because it
 * imports "server-only" and reads `serverEnv()`, the secret/Worker URL never reach the
 * browser. Always `cache: "no-store"` — these are live operational reads.
 */
import { serverEnv, type ServerEnv } from "@/lib/env";
import {
  parseHistoricalSales,
  parseImportBatches,
  parseKpis,
  parseMmrVin,
  parseSystemStatus,
  type ApiResult,
} from "./parse";
import {
  historicalSalesQuery,
  importBatchesQuery,
  type HistoricalSalesFilter,
  type MmrVinRequest,
} from "./client";
import type { HistoricalSale, ImportBatch, Kpis, MmrVinOk, SystemStatus } from "./schemas";

export type { HistoricalSalesFilter, MmrVinRequest } from "./client";

const SERVER_FETCH_TIMEOUT_MS = 12_000;

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function bearerHeaders(env: ServerEnv, extra?: Record<string, string>): HeadersInit {
  return { authorization: `Bearer ${env.APP_API_SECRET}`, accept: "application/json", ...extra };
}

function proxyMisconfigured(): { status: number; json: unknown } {
  return { status: 500, json: { ok: false, error: "proxy_misconfigured" } };
}

function upstreamUnavailable(): { status: number; json: unknown } {
  return { status: 503, json: { ok: false, error: "upstream_unavailable" } };
}

type RequestJsonInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

async function requestJson(
  pathWithQuery: string,
  init: RequestJsonInit = {},
): Promise<{ status: number; json: unknown }> {
  let env: ServerEnv;
  try {
    env = serverEnv();
  } catch (err) {
    console.error("[app-api/server] environment invalid:", err instanceof Error ? err.message : String(err));
    return proxyMisconfigured();
  }

  const method = init.method ?? "GET";
  const pathForLog = `/app/${pathWithQuery.split("?")[0]}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${env.APP_API_BASE_URL}/app/${pathWithQuery}`, {
      method,
      headers: bearerHeaders(env, init.headers),
      cache: "no-store",
      ...(init.body !== undefined && { body: init.body }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error(
      `[app-api/server] ${method} ${pathForLog} -> upstream_unavailable`,
      err instanceof Error ? err.name : "",
    );
    return upstreamUnavailable();
  } finally {
    clearTimeout(timer);
  }

  return { status: res.status, json: await readJson(res) };
}

async function getJson(pathWithQuery: string): Promise<{ status: number; json: unknown }> {
  return requestJson(pathWithQuery);
}

export async function getSystemStatus(): Promise<ApiResult<SystemStatus>> {
  const { status, json } = await getJson("system-status");
  return parseSystemStatus(status, json);
}

export async function getKpis(): Promise<ApiResult<Kpis>> {
  const { status, json } = await getJson("kpis");
  return parseKpis(status, json);
}

export async function listImportBatches(limit?: number): Promise<ApiResult<ImportBatch[]>> {
  const { status, json } = await getJson(`import-batches${importBatchesQuery(limit)}`);
  return parseImportBatches(status, json);
}

export async function listHistoricalSales(
  filter: HistoricalSalesFilter = {},
): Promise<ApiResult<HistoricalSale[]>> {
  const { status, json } = await getJson(`historical-sales${historicalSalesQuery(filter)}`);
  return parseHistoricalSales(status, json);
}

export async function postMmrVin(body: MmrVinRequest): Promise<ApiResult<MmrVinOk>> {
  const { status, json } = await requestJson("mmr/vin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseMmrVin(status, json);
}
