import type { Env } from "../types/env";
import { extractUserContext } from "../auth/userContext";
import { errorResponse } from "../types/api";

import { handleHealth }            from "../handlers/health";
import { handleMmrVin }            from "../handlers/mmrVin";
import { handleMmrYearMakeModel }  from "../handlers/mmrYearMakeModel";
import { handleSalesUpload }       from "../handlers/salesUpload";
import { handleActivityVin }       from "../handlers/activityVin";
import { handleActivityFeed }      from "../handlers/activityFeed";
import { handleKpisSummary }       from "../handlers/kpisSummary";
import { handleIntelMmrCacheKey }  from "../handlers/intelMmrCacheKey";
import { handleIntelMmrQueries }   from "../handlers/intelMmrQueries";
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

  // Service-to-service identity: when the main worker calls us with the shared
  // secret header, bypass the CF Access requirement and inject a service identity.
  // CF Access JWTs are unavailable for direct worker-to-worker fetch calls.
  let userContext = extractUserContext(request);
  const serviceSecret = env.INTEL_SERVICE_SECRET;
  if (serviceSecret && request.headers.get("x-tav-service-secret") === serviceSecret) {
    userContext = { userId: "service@tav-internal", email: "service@tav-internal", name: "TAV Service", roles: [] };
  }
  const baseArgs: HandlerArgs = { request, env, requestId, userContext };

  if (method === "GET"  && pathname === "/health")               return handleHealth(baseArgs);
  if (method === "POST" && pathname === "/mmr/vin")              return handleMmrVin(baseArgs);
  if (method === "POST" && pathname === "/mmr/year-make-model")  return handleMmrYearMakeModel(baseArgs);
  if (method === "POST" && pathname === "/sales/upload")         return handleSalesUpload(baseArgs);
  if (method === "GET"  && pathname === "/kpis/summary")         return handleKpisSummary(baseArgs);

  if (method === "GET" && pathname === "/activity/feed") {
    return handleActivityFeed(baseArgs);
  }

  if (method === "GET" && pathname.startsWith("/activity/vin/")) {
    const vin = pathname.slice("/activity/vin/".length);
    return handleActivityVin({ ...baseArgs, pathParams: { vin } });
  }

  if (method === "GET" && pathname === "/intel/mmr/queries") {
    return handleIntelMmrQueries(baseArgs);
  }

  if (method === "GET" && pathname.startsWith("/intel/mmr/")) {
    const cacheKey = decodeURIComponent(pathname.slice("/intel/mmr/".length));
    return handleIntelMmrCacheKey({ ...baseArgs, pathParams: { cacheKey } });
  }

  return errorResponse(
    "not_found",
    `${method} ${pathname}`,
    requestId,
    404,
  );
}
