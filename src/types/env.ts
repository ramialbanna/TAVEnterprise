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
   *   "worker"  — future: route through tav-intelligence-worker (not yet implemented; skips valuation)
   *
   * Set in wrangler.toml [vars]. Any value other than "worker" is treated as "direct".
   */
  MANHEIM_LOOKUP_MODE: string;
}
