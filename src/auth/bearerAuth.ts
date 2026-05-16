import { isConfiguredSecret } from "../types/envValidation";

/**
 * Constant-time string comparison. Avoids early-exit timing leaks when
 * validating a bearer token. Both inputs are encoded to byte arrays so an
 * unequal length does not short-circuit the loop.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

const BEARER_PREFIX = "Bearer ";

/**
 * Centralized bearer-token check for every authenticated HTTP surface
 * (`/app/*`, `/admin/*`, `/apify-webhook`).
 *
 * Returns true only when:
 *   - `secret` is a configured (non-placeholder) string, and
 *   - the request carries `Authorization: Bearer <secret>`, compared
 *     constant-time.
 *
 * An unconfigured/placeholder secret always fails closed — callers that
 * need to distinguish "not configured" (503) from "bad token" (401)
 * should check `isConfiguredSecret` themselves before responding.
 */
export function verifyBearer(request: Request, secret: unknown): boolean {
  if (!isConfiguredSecret(secret)) return false;
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith(BEARER_PREFIX)) return false;
  const provided = auth.slice(BEARER_PREFIX.length);
  return constantTimeEqual(provided, secret);
}
