import { handleMaxbuyEvaluate } from "../../../src/maxbuy/handlers/evaluate";
import { handleGetRecommendation } from "../../../src/maxbuy/handlers/getRecommendation";
import { handleMaxbuyOverride } from "../../../src/maxbuy/handlers/overrides";
import { handleMaxbuyPass } from "../../../src/maxbuy/handlers/passes";
import {
  maxbuyUnauthorized,
  maxbuyUserRequired,
  readMaxbuyUserId,
  verifyMaxbuyServiceAuth,
} from "../../../src/maxbuy/handlers/auth";
import { json } from "../../../src/maxbuy/handlers/http";
import type { MaxbuyWorkerEnv } from "../../../src/maxbuy/types/env";

const RECOMMENDATION_RE = /^\/maxbuy\/recommendations\/([^/]+)$/;

export async function dispatchMaxbuy(
  request: Request,
  env: MaxbuyWorkerEnv,
): Promise<Response> {
  if (request.method === "GET" && new URL(request.url).pathname === "/health") {
    return json({ ok: true, service: "maxbuy-worker" });
  }

  if (!verifyMaxbuyServiceAuth(request, env)) {
    return maxbuyUnauthorized();
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const userId = readMaxbuyUserId(request);

  if (request.method === "POST" && pathname === "/maxbuy/evaluate") {
    if (!userId) return maxbuyUserRequired();
    return handleMaxbuyEvaluate(request, env, userId);
  }

  if (request.method === "POST" && pathname === "/maxbuy/overrides") {
    if (!userId) return maxbuyUserRequired();
    return handleMaxbuyOverride(request, env, userId);
  }

  if (request.method === "POST" && pathname === "/maxbuy/passes") {
    if (!userId) return maxbuyUserRequired();
    return handleMaxbuyPass(request, env, userId);
  }

  const recMatch = pathname.match(RECOMMENDATION_RE);
  if (request.method === "GET" && recMatch) {
    return handleGetRecommendation(env, recMatch[1]!);
  }

  return json({ ok: false, error: "not_found" }, 404);
}
