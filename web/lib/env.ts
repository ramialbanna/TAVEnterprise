import "server-only";
import { z } from "zod";

/**
 * /web server-only environment.
 *
 * This module imports "server-only" so it can never be bundled into a client
 * component. None of these values may reach the browser (no NEXT_PUBLIC_ variant,
 * never logged). `APP_API_SECRET` in particular is the Bearer credential for the
 * Cloudflare Worker /app/* API and stays server-side only.
 */

export type EnvLabel = "PRODUCTION" | "STAGING" | "LOCAL";

/**
 * Derive the environment badge label from the Worker base URL host.
 *   - host contains "tav-aip-production" → PRODUCTION
 *   - host contains "tav-aip-staging"    → STAGING
 *   - localhost / 127.0.0.1 / any unknown or custom host → LOCAL (the safe default —
 *     an unrecognised host must never masquerade as PRODUCTION)
 */
export function deriveEnvLabel(baseUrl: string): EnvLabel {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return "LOCAL";
  }
  if (host.includes("tav-aip-production")) return "PRODUCTION";
  if (host.includes("tav-aip-staging")) return "STAGING";
  return "LOCAL";
}

const EnvSchema = z.object({
  // Cloudflare Worker /app/* API — ORIGIN ONLY (the proxy appends "/app").
  APP_API_BASE_URL: z.url(),
  // Bearer token for /app/* — server-only secret.
  APP_API_SECRET: z.string().min(1),
  // Auth.js — server-only secrets.
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  // Google Workspace email domain allowed to sign in.
  ALLOWED_EMAIL_DOMAIN: z.string().min(1).default("texasautovalue.com"),
});

export type ServerEnv = z.infer<typeof EnvSchema> & { ENV_LABEL: EnvLabel };

let cached: ServerEnv | null = null;

/**
 * Parse + validate the server environment once, memoised. Throws a descriptive
 * error if any required variable is missing or malformed (fail fast at boot).
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new Error(`Invalid /web environment: ${JSON.stringify(detail)}`);
  }
  cached = { ...parsed.data, ENV_LABEL: deriveEnvLabel(parsed.data.APP_API_BASE_URL) };
  return cached;
}
