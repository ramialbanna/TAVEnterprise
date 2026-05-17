import { okResponse } from "../types/api";
import { AuthError, ManheimAuthError, ValidationError } from "../errors";
import { ManheimHttpClient } from "../clients/manheimHttp";
import type { HandlerArgs } from "./types";

export type CatalogLevel = "years" | "makes" | "models" | "styles";

type CatalogData = {
  items: string[];
  catalogState: "connected" | "not_connected";
  cached: boolean;
  reason: string | null;
};

function readYear(pathParams: Record<string, string> | undefined): number {
  const raw = pathParams?.year;
  const year = raw ? Number(raw) : NaN;
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new ValidationError("Invalid catalog year");
  }
  return year;
}

function readParam(
  pathParams: Record<string, string> | undefined,
  key: "make" | "model",
): string {
  const raw = pathParams?.[key]?.trim();
  if (!raw) throw new ValidationError(`Invalid catalog ${key}`);
  return raw;
}

function cacheKey(level: CatalogLevel, params: Record<string, string> | undefined): string {
  const year = params?.year ?? "";
  const make = params?.make ?? "";
  const model = params?.model ?? "";
  return ["catalog", level, year, make, model]
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase())
    .join(":");
}

async function readCache(env: HandlerArgs["env"], key: string): Promise<CatalogData | null> {
  try {
    return await env.TAV_INTEL_KV.get<CatalogData>(key, { type: "json" });
  } catch {
    return null;
  }
}

async function writeCache(
  env: HandlerArgs["env"],
  key: string,
  data: CatalogData,
): Promise<void> {
  try {
    const ttl = data.catalogState === "not_connected" ? 600 : 86_400;
    await env.TAV_INTEL_KV.put(key, JSON.stringify(data), { expirationTtl: ttl });
  } catch {
    // Best-effort metadata cache. A KV write miss must not block the selector.
  }
}

export async function handleMmrCatalog(
  args: HandlerArgs & { catalogLevel: CatalogLevel },
): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const key = cacheKey(args.catalogLevel, args.pathParams);
  const cached = await readCache(args.env, key);
  if (cached !== null) {
    return okResponse({ ...cached, cached: true }, args.requestId);
  }

  const client = new ManheimHttpClient(args.env, args.env.TAV_INTEL_KV);

  try {
    const result =
      args.catalogLevel === "years"
        ? await client.getCatalogYears(args.requestId)
        : args.catalogLevel === "makes"
          ? await client.getCatalogMakes({
              year: readYear(args.pathParams),
              requestId: args.requestId,
            })
          : args.catalogLevel === "models"
            ? await client.getCatalogModels({
                year: readYear(args.pathParams),
                make: readParam(args.pathParams, "make"),
                requestId: args.requestId,
              })
            : await client.getCatalogStyles({
                year: readYear(args.pathParams),
                make: readParam(args.pathParams, "make"),
                model: readParam(args.pathParams, "model"),
                requestId: args.requestId,
              });

    const data: CatalogData = {
      items: result.items,
      catalogState: "connected",
      cached: false,
      reason: null,
    };
    await writeCache(args.env, key, data);
    return okResponse(data, args.requestId);
  } catch (err) {
    if (err instanceof ManheimAuthError) {
      const data: CatalogData = {
        items: [],
        catalogState: "not_connected",
        cached: false,
        reason: "not_provisioned",
      };
      await writeCache(args.env, key, data);
      return okResponse(data, args.requestId);
    }
    throw err;
  }
}
