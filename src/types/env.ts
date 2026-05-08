/**
 * Worker environment bindings.
 * All fields are non-optional: missing bindings fail at deploy time, not at runtime.
 * This is the single source of truth for every secret and KV the Worker receives.
 * The service role key must never leave this Worker — see CLAUDE.md §2.
 */
export interface Env {
  // ── Database ───────────────────────────────────────────────────────────────
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // ── Ingest authentication ──────────────────────────────────────────────────
  WEBHOOK_HMAC_SECRET: string;
  NORMALIZER_SECRET: string; // reserved for Phase 6 replay endpoint auth

  // ── Manheim MMR API ────────────────────────────────────────────────────────
  MANHEIM_CLIENT_ID: string;
  MANHEIM_CLIENT_SECRET: string;
  MANHEIM_USERNAME: string;
  MANHEIM_PASSWORD: string;
  MANHEIM_TOKEN_URL: string;
  MANHEIM_MMR_URL: string;

  // ── Alerts ─────────────────────────────────────────────────────────────────
  ALERT_WEBHOOK_URL: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;
  ALERT_TO_NUMBER: string;

  // ── Cloudflare KV ──────────────────────────────────────────────────────────
  TAV_KV: KVNamespace;

  // ── Admin auth ─────────────────────────────────────────────────────────────
  ADMIN_API_SECRET: string;

  // ── Feature flags ──────────────────────────────────────────────────────────
  HYBRID_BUYBOX_ENABLED: string; // "true" | "false" — wrangler.toml [vars]

  /**
   * Controls which code path executes Manheim MMR valuation lookups.
   *   "direct"  — legacy: main worker calls Manheim directly via src/valuation/mmr.ts (default)
   *   "worker"  — route through tav-intelligence-worker via src/valuation/workerClient.ts
   *
   * Set in wrangler.toml [vars]. Any value other than "worker" is treated as "direct".
   */
  MANHEIM_LOOKUP_MODE: string;

  /**
   * Base URL of tav-intelligence-worker, e.g. https://tav-intelligence-worker-staging.workers.dev
   * Empty string = not configured; worker-path valuation silently falls back to null.
   * Non-secret — set in wrangler.toml [vars].
   */
  INTEL_WORKER_URL: string;

  /**
   * Shared secret for worker-to-worker auth. Sent as x-tav-service-secret header.
   * Must match INTEL_SERVICE_SECRET in the intelligence worker. NEVER log this.
   * Set via: wrangler secret put INTEL_WORKER_SECRET
   */
  INTEL_WORKER_SECRET: string;
}
