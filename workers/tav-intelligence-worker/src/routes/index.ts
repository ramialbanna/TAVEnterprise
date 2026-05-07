import type { Env } from "../types/env";
import { extractUserContext } from "../auth/userContext";
import { errorResponse } from "../types/api";

import { handleHealth }            from "../handlers/health";
import { handleMmrVin }            from "../handlers/mmrVin";
import { handleMmrYearMakeModel }  from "../handlers/mmrYearMakeModel";
import { handleSalesUpload }       from "../handlers/salesUpload";
import { handleActivityVin }       from "../handlers/activityVin";
import { handleKpisSummary }       from "../handlers/kpisSummary";
import type { HandlerArgs }        from "../handlers/types";

/**
 * Single dispatch entry point. Resolves user context once, then routes by
 * `(method, pathname)`. Path-param routes are matched explicitly here rather
 * than via a router framework — six routes does not justify a dependency.
 */
export async function dispatch(
  request:   Request,
  env:       Env,
  requestId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;

  const userContext = extractUserContext(request);
  const baseArgs: HandlerArgs = { request, env, requestId, userContext };

  if (method === "GET"  && pathname === "/health")               return handleHealth(baseArgs);
  if (method === "POST" && pathname === "/mmr/vin")              return handleMmrVin(baseArgs);
  if (method === "POST" && pathname === "/mmr/year-make-model")  return handleMmrYearMakeModel(baseArgs);
  if (method === "POST" && pathname === "/sales/upload")         return handleSalesUpload(baseArgs);
  if (method === "GET"  && pathname === "/kpis/summary")         return handleKpisSummary(baseArgs);

  if (method === "GET" && pathname.startsWith("/activity/vin/")) {
    const vin = pathname.slice("/activity/vin/".length);
    return handleActivityVin({ ...baseArgs, pathParams: { vin } });
  }

  return errorResponse(
    "not_found",
    `${method} ${pathname}`,
    requestId,
    404,
  );
}
