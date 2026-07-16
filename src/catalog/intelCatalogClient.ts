import { z } from "zod";

import type { Env } from "../types/env";
import { isConfiguredSecret } from "../types/envValidation";
import { log, serializeError } from "../logging/logger";

const INTEL_SERVICE_BINDING_BASE = "https://tav-intelligence-worker.internal";
const CATALOG_FETCH_TIMEOUT_MS = 30_000;
const CATALOG_FETCH_MAX_ATTEMPTS = 4;
const CATALOG_FETCH_RETRY_STATUSES = new Set([429, 502, 503, 504]);

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class IntelCatalogFetchError extends Error {
  readonly path: string;
  readonly status: number | null;

  constructor(path: string, message: string, status: number | null = null) {
    super(message);
    this.name = "IntelCatalogFetchError";
    this.path = path;
    this.status = status;
  }
}

const IntelCatalogEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(z.string()),
    catalogState: z.enum(["connected", "not_connected"]),
  }),
});

/** Cox years synced into `tav.cox_catalog_tree` (current − 10 … current + 1). */
export function buildCoxCatalogYearRange(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = currentYear - 10; year <= currentYear + 1; year += 1) {
    years.push(year);
  }
  return years;
}

export async function fetchIntelCatalogItems(env: Env, path: string): Promise<string[]> {
  if (!isConfiguredSecret(env.INTEL_WORKER_SECRET)) {
    throw new Error("intel_worker_secret_not_configured");
  }

  const useServiceBinding = env.INTEL_WORKER !== undefined;
  const baseUrl = env.INTEL_WORKER_URL || (useServiceBinding ? INTEL_SERVICE_BINDING_BASE : "");
  if (!baseUrl) {
    throw new Error("intel_worker_not_configured");
  }

  const endpoint = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= CATALOG_FETCH_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CATALOG_FETCH_TIMEOUT_MS);

    try {
      const init: RequestInit = {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-tav-service-secret": env.INTEL_WORKER_SECRET,
        },
        signal: controller.signal,
      };
      const res = useServiceBinding
        ? await env.INTEL_WORKER!.fetch(endpoint, init)
        : await fetch(endpoint, init);

      if (!res.ok) {
        if (CATALOG_FETCH_RETRY_STATUSES.has(res.status) && attempt < CATALOG_FETCH_MAX_ATTEMPTS) {
          await sleep(500 * attempt);
          continue;
        }
        throw new IntelCatalogFetchError(
          path,
          `Catalog fetch failed ${path}: HTTP ${res.status}`,
          res.status,
        );
      }

      const raw = await res.json();
      const parsed = IntelCatalogEnvelopeSchema.safeParse(raw);
      if (!parsed.success || parsed.data.data.catalogState !== "connected") {
        throw new IntelCatalogFetchError(path, `Invalid catalog envelope for ${path}`);
      }

      return parsed.data.data.items;
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof IntelCatalogFetchError &&
        err.status != null &&
        CATALOG_FETCH_RETRY_STATUSES.has(err.status);
      if (retryable && attempt < CATALOG_FETCH_MAX_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
      log("catalog.sync.fetch_failed", { path, attempt, error: serializeError(err) });
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  log("catalog.sync.fetch_failed", { path, error: serializeError(lastError) });
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function buildIntelCatalogPath(
  year: number,
  make?: string,
  model?: string,
): string {
  const y = encodeURIComponent(String(year));
  if (!make) return `/catalog/years/${y}/makes`;
  const m = encodeURIComponent(make);
  if (!model) return `/catalog/years/${y}/makes/${m}/models`;
  return `/catalog/years/${y}/makes/${m}/models/${encodeURIComponent(model)}/styles`;
}
