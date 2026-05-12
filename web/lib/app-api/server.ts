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
import { serverEnv } from "@/lib/env";
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

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function bearerHeaders(extra?: Record<string, string>): HeadersInit {
  const { APP_API_SECRET } = serverEnv();
  return { authorization: `Bearer ${APP_API_SECRET}`, accept: "application/json", ...extra };
}

function appUrl(pathWithQuery: string): string {
  return `${serverEnv().APP_API_BASE_URL}/app/${pathWithQuery}`;
}

async function getJson(pathWithQuery: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(appUrl(pathWithQuery), {
    method: "GET",
    headers: bearerHeaders(),
    cache: "no-store",
  });
  return { status: res.status, json: await readJson(res) };
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
  const res = await fetch(appUrl("mmr/vin"), {
    method: "POST",
    headers: bearerHeaders({ "content-type": "application/json" }),
    cache: "no-store",
    body: JSON.stringify(body),
  });
  return parseMmrVin(res.status, await readJson(res));
}
