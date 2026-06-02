import { isConfiguredSecret } from "../../types/envValidation";
import type { MaxbuyWorkerEnv } from "../types/env";

export function verifyMaxbuyServiceAuth(request: Request, env: MaxbuyWorkerEnv): boolean {
  if (!isConfiguredSecret(env.MAXBUY_SERVICE_SECRET)) return false;
  const header = request.headers.get("x-tav-service-secret");
  return header === env.MAXBUY_SERVICE_SECRET;
}

export function readMaxbuyUserId(request: Request): string | null {
  const header = request.headers.get("x-tav-user-id");
  if (header?.trim()) return header.trim();
  return null;
}

export function maxbuyUnauthorized(): Response {
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function maxbuyUserRequired(): Response {
  return new Response(JSON.stringify({ ok: false, error: "user_required" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
